# Take Over

Real-time multiplayer web app with Canvas UI, Node/Express API, Socket.IO, and SQLite auth.

## Local development

### API (port 3001)

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

### Front-end

Serve `client/` with any static server (e.g. VS Code Live Server on port 5173). Set API URL in `client/config.js`:

```js
window.__API_URL__ = 'http://localhost:3001';
window.__SOCKET_URL__ = 'http://localhost:3001';
```

Sign in, create a public or private space, share the 6-character code, and begin when at least two members are present.

## Deploy

### Render (API)

1. Connect this repo; use `render.yaml` or create a Web Service with root `server`.
2. Set `CLIENT_ORIGIN` to your Vercel URL (e.g. `https://take-over.vercel.app`).
3. Attach a persistent disk at `/var/data` and set `DB_PATH=/var/data/takeover.db`.
4. Set `SESSION_SECRET` to a long random string.

### Vercel (front-end)

1. Import repo; set **Root Directory** to `client`.
2. Add environment variables or edit `config.js` in production to point `__API_URL__` and `__SOCKET_URL__` at your Render URL.
3. Deploy. Cookies use `SameSite=None; Secure` in production.

## Manual test checklist

- [ ] Register and sign in; refresh page — still signed in
- [ ] Create public space; second browser joins by code
- [ ] Private space: non-friend cannot join; friend can join
- [ ] Host begins session with 2+ members
- [ ] Collect, Support + Director counter, dispute success/fail
- [ ] Takeover at 7 credits; 10+ credits forces takeover only
- [ ] Strike, Seize, Levy, Shuffle flows
- [ ] Turn timer defaults to Collect after 60s
- [ ] Leave empty space — room removed; friend list updates `spaceCode`
- [ ] 7 members uses double deck (30 tokens in pool logic)

## Project layout

- `client/` — HTML/CSS/JS + Canvas
- `server/` — Express, Socket.IO, SQLite, rules engine in `server/src/session/`
