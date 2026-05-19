import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  isProd: process.env.NODE_ENV === 'production',
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'takeover.db'),
  turnMs: 60_000,
  windowMs: 30_000,
  maxMembers: 18,
  minMembers: 2,
  forcedTakeoverCredits: 10,
  takeoverCost: 7,
};
