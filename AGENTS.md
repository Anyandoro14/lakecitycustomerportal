# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

LakeCity Portal is a Vite + React + TypeScript SPA backed by Supabase (Postgres, Auth, Edge Functions). Optional Odoo addons under `odoo/addons/` deploy elsewhere (Odoo.sh); they are not started from this repo.

### Services (local full stack)

| Service | Command | URL / notes |
|---------|---------|-------------|
| Local Supabase | `npm run test:env:setup` (requires Docker) | API `http://127.0.0.1:54321`, Studio `http://127.0.0.1:54323` |
| Vite (test mode) | `npm run dev:test` | `http://localhost:8080` |
| Edge Functions | `npm run test:env:serve-functions` | Serves `supabase/functions` against local DB (second terminal) |

Default `npm run dev` uses `.env` / `vite.config.ts` fallbacks (hosted Supabase). Prefer **`dev:test`** + local stack for isolated development (see `docs/TEST_ENVIRONMENT.md`).

### Docker on Cloud Agent VMs

Docker is not preinstalled. If `docker info` fails:

1. Ensure `dockerd` is running (systemd may be unavailable; start manually: `sudo dockerd > /tmp/dockerd.log 2>&1 &` and wait a few seconds).
2. If you see permission denied on `/var/run/docker.sock`, run `sudo chmod 666 /var/run/docker.sock` (or use `sudo docker`).

Use `fuse-overlayfs` storage driver and `iptables-legacy` when running Docker inside nested VMs (see Cursor Cloud setup docs).

### Local Supabase setup

`npm run test:env:setup` runs `npx supabase start` and applies `supabase/migrations/`. On failure, run `npx supabase stop` and retry; use `npx supabase db reset` to wipe local data and reapply migrations.

### Lint / test / build

- **Lint:** `npm run lint` (includes `supabase/functions/`; many pre-existing findings).
- **Tests:** No Vitest/Jest suite in `package.json`; smoke-test via app + `docs/TEST_ENVIRONMENT.md` checklist.
- **Build:** `npm run build`

### Cloud Supabase fallback

Without Docker, `npm run dev` still serves the UI using the publishable anon key and URL baked into `vite.config.ts` (hosted project). Dashboard flows that need Edge Functions require either local `test:env:serve-functions` or deployed functions on that project.

### Commercial / team Cloud Agents

Repo config for shared agents lives in `.cursor/environment.json` (`npm ci` on boot). For Teams upgrade, GitHub integration, team snapshots, secrets, Automations, and Bugbot, follow `docs/CURSOR_COMMERCIAL_AGENT_DEPLOYMENT.md`.
