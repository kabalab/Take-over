import { areFriends, listFriends } from '../db/index.js';
import { VISIBILITY, sanitizePublicName } from '../rooms/Room.js';
import { setUserSpace } from '../presence.js';

function presenceSpaceCode(room) {
  if (!room) return null;
  if (room.visibility === VISIBILITY.friends) return null;
  return room.code;
}

export function registerSocketHandlers(io, roomManager, { notifyFriends, onConnect }) {
  io.on('connection', (socket) => {
    const user = socket.data.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }
    onConnect?.(socket, user);

    socket.on('space:create', ({ visibility, name } = {}, cb) => {
      try {
        if (user.isGuest && visibility !== VISIBILITY.public) {
          return cb?.({ ok: false, error: 'Guests can only create public spaces' });
        }
        let vis = VISIBILITY.public;
        if (visibility === VISIBILITY.private) vis = VISIBILITY.private;
        else if (visibility === VISIBILITY.friends) vis = VISIBILITY.friends;

        const roomName = vis === VISIBILITY.public ? sanitizePublicName(name) : null;
        const room = roomManager.create(user.id, user.username, socket.id, vis, roomName);
        setUserSpace(user.id, presenceSpaceCode(room));
        socket.join(room.code);
        if (!user.isGuest) notifyFriends(user.id);
        cb?.({ ok: true, state: room.toLobbyState() });
        io.to(room.code).emit('space:state', room.toLobbyState());
      } catch (e) {
        cb?.({ ok: false, error: e.message });
      }
    });

    socket.on('space:join', async ({ code, spectate } = {}, cb) => {
      try {
        const room = roomManager.get(code);
        if (!room) return cb?.({ ok: false, error: 'Space not found' });

        if (room.visibility === VISIBILITY.friends) {
          const ok =
            room.hostId === user.id || (await areFriends(user.id, room.hostId));
          if (!ok) return cb?.({ ok: false, error: 'Friends space — friends only' });
        }

        const inProgress = room.status === 'active';
        const asSpectator = spectate || (inProgress && room.visibility === VISIBILITY.public);

        if (inProgress && !asSpectator && room.visibility !== VISIBILITY.public) {
          return cb?.({ ok: false, error: 'Session in progress' });
        }
        if (inProgress && !asSpectator) {
          return cb?.({ ok: false, error: 'Use spectate to observe' });
        }

        const existing = room.members.get(user.id);
        if (existing) {
          existing.socketId = socket.id;
          existing.spectator = asSpectator;
        } else {
          if (roomManager.getByUser(user.id)) roomManager.leave(user.id);
          room.addMember(user.id, user.username, socket.id, { spectator: asSpectator });
        }
        roomManager.userRoom.set(user.id, room.code);
        setUserSpace(user.id, presenceSpaceCode(room));
        socket.join(room.code);
        if (!user.isGuest) notifyFriends(user.id);

        cb?.({ ok: true, state: room.toLobbyState() });
        io.to(room.code).emit('space:state', room.toLobbyState());
        if (room.session) broadcastSession(io, room);
      } catch (e) {
        cb?.({ ok: false, error: e.message });
      }
    });

    socket.on('space:joinFriends', async ({ hostId } = {}, cb) => {
      try {
        if (user.isGuest) return cb?.({ ok: false, error: 'Sign in to join friends spaces' });
        const room = roomManager.findFriendsRoomByHost(hostId);
        if (!room) return cb?.({ ok: false, error: 'Friends space not found' });
        if (!(await areFriends(user.id, hostId)) && hostId !== user.id) {
          return cb?.({ ok: false, error: 'Friends only' });
        }

        const existing = room.members.get(user.id);
        if (existing) {
          existing.socketId = socket.id;
          existing.spectator = false;
        } else {
          if (roomManager.getByUser(user.id)) roomManager.leave(user.id);
          room.addMember(user.id, user.username, socket.id);
        }
        roomManager.userRoom.set(user.id, room.code);
        setUserSpace(user.id, null);
        socket.join(room.code);
        notifyFriends(user.id);

        cb?.({ ok: true, state: room.toLobbyState() });
        io.to(room.code).emit('space:state', room.toLobbyState());
      } catch (e) {
        cb?.({ ok: false, error: e.message });
      }
    });

    socket.on('space:leave', (_, cb) => {
      const result = roomManager.leave(user.id);
      socket.leaveAll();
      setUserSpace(user.id, null);
      if (!user.isGuest) notifyFriends(user.id);
      if (result && !result.deleted && result.room) {
        io.to(result.code).emit('space:state', result.room.toLobbyState());
      }
      cb?.({ ok: true });
    });

    socket.on('space:listPublic', (_, cb) => {
      cb?.({ ok: true, spaces: roomManager.listPublicWaiting() });
    });

    socket.on('space:listFriends', async (_, cb) => {
      try {
        if (user.isGuest) return cb?.({ ok: true, spaces: [] });
        const friends = await listFriends(user.id);
        const spaces = roomManager.listFriendsWaiting(friends.map((f) => f.id));
        cb?.({ ok: true, spaces });
      } catch (e) {
        cb?.({ ok: false, error: e.message });
      }
    });

    socket.on('session:start', (_, cb) => {
      const room = roomManager.getByUser(user.id);
      if (!room) return cb?.({ ok: false, error: 'Not in a space' });
      if (room.hostId !== user.id) return cb?.({ ok: false, error: 'Host only' });
      if (room.status === 'active') return cb?.({ ok: false, error: 'Already started' });
      try {
        const session = room.startSession();
        session.setOnUpdate(() => broadcastSession(io, room));
        cb?.({ ok: true });
        broadcastSession(io, room);
        io.to(room.code).emit('space:state', room.toLobbyState());
      } catch (e) {
        cb?.({ ok: false, error: e.message });
      }
    });

    socket.on('session:action', (payload, cb) => {
      const room = roomManager.getByUser(user.id);
      if (!room?.session) return cb?.({ ok: false, error: 'No active session' });
      const err = room.session.declareAction(user.id, payload.type, payload.targetId);
      if (err) return cb?.({ ok: false, error: err });
      broadcastSession(io, room);
      cb?.({ ok: true });
    });

    socket.on('session:block', ({ role }, cb) => {
      const room = roomManager.getByUser(user.id);
      if (!room?.session) return cb?.({ ok: false, error: 'No active session' });
      const err = room.session.block(user.id, role);
      if (err) return cb?.({ ok: false, error: err });
      broadcastSession(io, room);
      cb?.({ ok: true });
    });

    socket.on('session:challenge', (_, cb) => {
      const room = roomManager.getByUser(user.id);
      if (!room?.session) return cb?.({ ok: false, error: 'No active session' });
      const err = room.session.challenge(user.id);
      if (err) return cb?.({ ok: false, error: err });
      broadcastSession(io, room);
      cb?.({ ok: true });
    });

    socket.on('session:pass', (_, cb) => {
      const room = roomManager.getByUser(user.id);
      if (!room?.session) return cb?.({ ok: false, error: 'No active session' });
      const err = room.session.pass(user.id);
      if (err) return cb?.({ ok: false, error: err });
      broadcastSession(io, room);
      cb?.({ ok: true });
    });

    socket.on('session:loseToken', ({ cardIndex }, cb) => {
      const room = roomManager.getByUser(user.id);
      if (!room?.session) return cb?.({ ok: false, error: 'No active session' });
      const err = room.session.loseStanding(user.id, cardIndex);
      if (err) return cb?.({ ok: false, error: err });
      broadcastSession(io, room);
      cb?.({ ok: true });
    });

    socket.on('session:shufflePick', ({ keptIds }, cb) => {
      const room = roomManager.getByUser(user.id);
      if (!room?.session) return cb?.({ ok: false, error: 'No active session' });
      const err = room.session.shufflePick(user.id, keptIds);
      if (err) return cb?.({ ok: false, error: err });
      broadcastSession(io, room);
      cb?.({ ok: true });
    });

    socket.on('disconnect', () => {
      const room = roomManager.getByUser(user.id);
      if (room) {
        const m = room.members.get(user.id);
        if (m) m.socketId = null;
      }
    });
  });
}

export function broadcastSession(io, room) {
  if (!room.session) return;
  for (const m of room.members.values()) {
    if (!m.socketId) continue;
    const spectator = m.spectator;
    const member = room.session.getMember(m.userId);
    const view = room.session.getView(m.userId, {
      spectator,
      eliminatedSpectator: spectator || member?.eliminated,
    });
    io.to(m.socketId).emit('session:state', view);
  }
}
