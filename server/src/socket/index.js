import { Server } from 'socket.io';
import cookieSession from 'cookie-session';
import { config } from '../config.js';
import { findUserById, listFriends } from '../db/index.js';
import { getFriendsPresence, setUserOnline, setUserOffline, setUserSpace } from '../presence.js';
import { registerSocketHandlers, broadcastSession } from './handlers.js';
import { VISIBILITY } from '../rooms/Room.js';

function presenceSpaceCode(room) {
  if (!room) return null;
  if (room.visibility === VISIBILITY.friends) return null;
  return room.code;
}

export function attachSocket(httpServer, roomManager) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.clientOrigin,
      credentials: true,
    },
  });

  const cookieParser = cookieSession({
    name: 'to_session',
    keys: [config.sessionSecret],
    httpOnly: true,
    secure: config.isProd,
    sameSite: config.isProd ? 'none' : 'lax',
  });

  io.use((socket, next) => {
    const req = { headers: socket.request.headers };
    const res = { getHeader: () => {}, setHeader: () => {}, end: () => {} };
    cookieParser(req, res, async () => {
      try {
        if (req.session?.isGuest && req.session?.guestId) {
          socket.data.user = {
            id: req.session.guestId,
            username: req.session.username,
            isGuest: true,
          };
          return next();
        }
        const userId = req.session?.userId;
        if (!userId) return next(new Error('Unauthorized'));
        const user = await findUserById(userId);
        if (!user) return next(new Error('Unauthorized'));
        socket.data.user = { id: user.id, username: user.username, isGuest: false };
        next();
      } catch (err) {
        next(err);
      }
    });
  });

  async function notifyFriends(userId) {
    const affected = new Set([userId]);
    const myFriends = await listFriends(userId);
    for (const f of myFriends) affected.add(f.id);

    for (const uid of affected) {
      const friends = await listFriends(uid);
      const presence = getFriendsPresence(friends);
      const payload = friends.map((f) => ({
        username: f.username,
        online: presence[f.id]?.online ?? false,
        spaceCode: presence[f.id]?.spaceCode ?? null,
      }));
      for (const [, s] of io.sockets.sockets) {
        if (s.data.user?.id === uid && !s.data.user?.isGuest) {
          s.emit('friends:presence', payload);
        }
      }
    }
  }

  registerSocketHandlers(io, roomManager, {
    notifyFriends,
    async onConnect(socket, user) {
      setUserOnline(user.id, socket.id, null);

      const room = roomManager.getByUser(user.id);
      if (room) {
        const m = room.members.get(user.id);
        if (m) m.socketId = socket.id;
        setUserSpace(user.id, presenceSpaceCode(room));
        socket.join(room.code);
        io.to(room.code).emit('space:state', room.toLobbyState());
        if (room.session) broadcastSession(io, room);
      }

      if (user.isGuest) return;

      const friends = await listFriends(user.id);
      const presence = getFriendsPresence(friends);
      socket.emit(
        'friends:presence',
        friends.map((f) => ({
          username: f.username,
          online: presence[f.id]?.online ?? false,
          spaceCode: presence[f.id]?.spaceCode ?? null,
        }))
      );
    },
  });

  io.on('connection', (socket) => {
    socket.on('disconnect', () => {
      const userId = setUserOffline(socket.id);
      if (userId && !socket.data.user?.isGuest) {
        notifyFriends(userId);
      }
    });
  });

  return { io, notifyFriends };
}
