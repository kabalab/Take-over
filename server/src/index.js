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

if (config.isProd) app.set('trust proxy', 1);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, '');
  if (config.clientOrigins.includes(normalized)) return true;
  try {
    const host = new URL(normalized).hostname;
    if (
      config.clientOrigins.some((allowed) => {
        const allowedHost = new URL(allowed).hostname;
        return allowedHost.endsWith('.vercel.app') && host.endsWith('.vercel.app');
      })
    ) {
      return true;
    }
  } catch {
    /* ignore malformed origin */
  }
  return false;
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) callback(null, true);
      else {
        console.warn('CORS blocked origin:', origin, 'allowed:', config.clientOrigins);
        callback(new Error('Not allowed by CORS'));
      }
    },
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
