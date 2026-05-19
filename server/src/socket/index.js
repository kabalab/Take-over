import { Server } from 'socket.io';
import cookieSession from 'cookie-session';
import { config } from '../config.js';
import { findUserById, listFriends } from '../db/index.js';
import { getFriendsPresence, setUserOnline, setUserOffline, setUserSpace } from '../presence.js';
import { registerSocketHandlers } from './handlers.js';

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
    cookieParser(req, res, () => {
      const userId = req.session?.userId;
      if (!userId) return next(new Error('Unauthorized'));
      const user = findUserById(userId);
      if (!user) return next(new Error('Unauthorized'));
      socket.data.user = { id: user.id, username: user.username };
      next();
    });
  });

  function notifyFriends(userId) {
    const affected = new Set([userId]);
    const myFriends = listFriends(userId);
    for (const f of myFriends) affected.add(f.id);

    for (const uid of affected) {
      const friends = listFriends(uid);
      const presence = getFriendsPresence(friends);
      const payload = friends.map((f) => ({
        username: f.username,
        online: presence[f.id]?.online ?? false,
        spaceCode: presence[f.id]?.spaceCode ?? null,
      }));
      for (const [, s] of io.sockets.sockets) {
        if (s.data.user?.id === uid) s.emit('friends:presence', payload);
      }
    }
  }

  registerSocketHandlers(io, roomManager, {
    notifyFriends,
    onConnect(socket, user) {
      setUserOnline(user.id, socket.id, null);
      const friends = listFriends(user.id);
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
      if (userId) {
        setUserSpace(userId, null);
        notifyFriends(userId);
      }
    });
  });

  return { io, notifyFriends };
}
