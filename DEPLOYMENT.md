# Deploying the Shohoz Kitchen backend to Render

The repo already contains everything Render needs:

| File | Purpose |
|------|---------|
| `render.yaml` | Blueprint — defines the web service (build, start, region, health check). |
| `.env.render` | All environment variables to bulk‑paste into Render (gitignored — has secrets). |
| `package.json` | `build` = `tsc`, `start` = `node ./dist/server.js`, `engines.node >= 20`. |

## Steps

1. **Create the service**
   Render Dashboard → **New +** → **Blueprint** → connect the `ShohozKitchen_Server` GitHub repo.
   Render reads `render.yaml` and creates a web service named `shohozkitchen-server`
   (build `npm install && npm run build`, start `npm start`, region Singapore, health check `/api/health`).

2. **Add the environment variables (bulk)**
   Open the service → **Environment** → **Add from .env** → paste the entire contents of
   **`.env.render`** → **Save**. Render redeploys automatically.
   - ⚠️ Do **not** add `PORT` — Render sets it and the app reads `process.env.PORT`.

3. **Fix the URLs after the frontend is live**
   Once the Vercel client is deployed, update these three env values (Environment tab) and redeploy:
   - `FRONTEND_URL` → your Vercel URL (e.g. `https://shohozkitchen-client.vercel.app`) — CORS + email links depend on it.
   - `PAYMENT_FRONTEND_URL` → same Vercel URL.
   - `PAYMENT_BACKEND_URL` → this Render URL (e.g. `https://shohozkitchen-server.onrender.com`).

4. **Verify**
   Visit `https://<your-service>.onrender.com/api/health` → should return `{ "success": true }`.

## Notes
- **Free plan** spins the service down after ~15 min idle (cold start on the next request). Upgrade to a paid instance for always‑on + the Steadfast auto‑sync cron.
- **Node version** is pinned to `20.18.1` via `render.yaml` (`NODE_VERSION`).
- Online payment (bKash / SSLCommerz) stays disabled until you add merchant creds to the env; **Cash on Delivery works out of the box**.
- Set `STEADFAST_WEBHOOK_SECRET` (and configure the same secret in the Steadfast portal) before going live if you use delivery‑status webhooks.
