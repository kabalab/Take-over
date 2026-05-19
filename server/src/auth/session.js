import cookieSession from 'cookie-session';
import { config } from '../config.js';

export const sessionMiddleware = cookieSession({
  name: 'to_session',
  keys: [config.sessionSecret],
  maxAge: 30 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  secure: config.isProd,
  sameSite: config.isProd ? 'none' : 'lax',
});
