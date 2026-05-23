import { areFriends } from '../db/index.js';
import { VISIBILITY } from '../rooms/Room.js';
import { setUserSpace } from '../presence.js';

export function registerSocketHandlers(io, roomManager, { notifyFriends, onConnect }) {
  io.on('connection', (socket) => {
    const user = socket.data.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }
    onConnect?.(socket, user);

    socket.on('space:create', ({ visibility } = {}, cb) => {
      try {
        const vis = visibility === VISIBILITY.private ? VISIBILITY.private : VISIBILITY.public;
        const room = roomManager.create(user.id, user.username, socket.id, vis);
        setUserSpace(user.id, room.code);
        socket.join(room.code);
        notifyFriends(user.id);
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

        let allowed = room.hostId === user.id;
        if (room.visibility === VISIBILITY.private && !allowed) {
          for (const m of room.members.values()) {
            if (m.userId !== user.id && (await areFriends(user.id, m.userId))) {
              allowed = true;
              break;
            }
          }
          if (!allowed) return cb?.({ ok: false, error: 'Private space — friends only' });
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
        setUserSpace(user.id, room.code);
        socket.join(room.code);
        notifyFriends(user.id);

        cb?.({ ok: true, state: room.toLobbyState() });
        io.to(room.code).emit('space:state', room.toLobbyState());
        if (room.session) broadcastSession(io, room);
      } catch (e) {
        cb?.({ ok: false, error: e.message });
      }
    });

    socket.on('space:leave', (_, cb) => {
      const result = roomManager.leave(user.id);
      socket.leaveAll();
      setUserSpace(user.id, null);
      notifyFriends(user.id);
      if (result && !result.deleted && result.room) {
        io.to(result.code).emit('space:state', result.room.toLobbyState());
      }
      cb?.({ ok: true });
    });

    socket.on('space:listPublic', (_, cb) => {
      cb?.({ ok: true, spaces: roomManager.listPublicWaiting() });
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
        io.to(room.code).emit('space:state', room.toLobbyState());
        broadcastSession(io, room);
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

export function emitFriendsPresence(io, userId) {
  const friends = listFriends(userId);
  const { getFriendsPresence } = require('../presence.js');
}
