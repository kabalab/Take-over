/**
 * Vercel build: writes client/config.js from dashboard env vars.
 * Local dev: skip (keep committed config.js with localhost defaults).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, '..', 'client', 'config.js');

if (!process.env.VERCEL) {
  console.log('Not on Vercel — keeping existing client/config.js');
  process.exit(0);
}

const api = process.env.TAKEOVER_API_URL?.trim();
if (!api) {
  console.error('Set TAKEOVER_API_URL in Vercel (your Render URL, e.g. https://take-over-api.onrender.com)');
  process.exit(1);
}

const socket = process.env.TAKEOVER_SOCKET_URL?.trim() || api;
const body = `// Generated at build time — do not edit on Vercel deploys
window.__API_URL__ = ${JSON.stringify(api)};
window.__SOCKET_URL__ = ${JSON.stringify(socket)};
`;

fs.writeFileSync(out, body, 'utf8');
console.log('Wrote client/config.js for', api);
