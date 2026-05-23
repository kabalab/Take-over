# What only you can do (~15 min)

Repo is ready on GitHub. No CLI tools were available on this machine, so these steps need your browser login.

## 1. Turso — [turso.tech](https://turso.tech)

- Create database `takeover`
- Copy **Database URL** (`libsql://...`) and create an **auth token**

## 2. Render — [render.com](https://render.com)

- **New → Blueprint** → repo `kabalab/Take-over` (uses `render.yaml`, `plan: free` = $0)
- If you already created the service: **Settings → Instance type → Free** (not Starter $7)
- Environment variables:
  - `TURSO_DATABASE_URL` = from Turso
  - `TURSO_AUTH_TOKEN` = from Turso
  - `CLIENT_ORIGIN` = your Vercel URL (step 3 — can set after Vercel deploy)
- Deploy; confirm **no disk** attached
- Copy service URL → test `https://YOUR-SERVICE.onrender.com/health`

## 3. Vercel — [vercel.com](https://vercel.com)

- Import same GitHub repo
- **Root Directory:** leave default (repo root)
- Environment: `TAKEOVER_API_URL` = Render URL from step 2
- Deploy; copy your `*.vercel.app` URL

## 4. Link them

- Render → set `CLIENT_ORIGIN` to exact Vercel URL → redeploy
- Open Vercel URL → register → add friend → redeploy Render once → friend should still exist

Done.
