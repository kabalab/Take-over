import express from 'express';
import cors from 'cors';
import http from 'http';
import { config } from './config.js';
import { initDb } from './db/index.js';
import { sessionMiddleware } from './auth/session.js';
import authRoutes from './auth/routes.js';
import friendsRoutes from './friends/routes.js';
import { RoomManager } from './rooms/RoomManager.js';
import { attachSocket } from './socket/index.js';

await initDb();

const app = express();
const roomManager = new RoomManager();

app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
  })
);
app.use(express.json());
app.use(sessionMiddleware);

app.get('/health', (_, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/friends', friendsRoutes);

const server = http.createServer(app);
attachSocket(server, roomManager);

server.listen(config.port, () => {
  console.log(`Server listening on ${config.port}`);
});
