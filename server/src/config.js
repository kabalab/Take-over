import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const defaultDbPath = path.join(__dirname, '..', 'data', 'takeover.db');

function parseClientOrigins() {
  const raw = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  return raw.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  clientOrigins: parseClientOrigins(),
  clientOrigin: parseClientOrigins()[0],
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  isProd: process.env.NODE_ENV === 'production',
  tursoUrl: process.env.TURSO_DATABASE_URL || `file:${defaultDbPath}`,
  tursoAuthToken: process.env.TURSO_AUTH_TOKEN || undefined,
  turnMs: 60_000,
  windowMs: 30_000,
  maxMembers: 18,
  minMembers: 2,
  forcedTakeoverCredits: 10,
  takeoverCost: 7,
};
