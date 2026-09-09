# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

LakeCity Portal is a Vite + React + TypeScript SPA on **Lovable Cloud** (Postgres, Auth, Edge Functions hosted by Lovable). Optional Odoo addons under `odoo/addons/` deploy elsewhere (Odoo.sh); they are not started from this repo.

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

### Cloud fallback

Without Docker, `npm run dev` still serves the UI using the publishable anon key and URL baked into `vite.config.ts` (Lovable Cloud project `gumkxjeahojrcaqnosyz`). Dashboard flows that need Edge Functions require either local `test:env:serve-functions` or the functions already deployed on Lovable Cloud.

### StandLedger MCP

Project MCP config is `.cursor/mcp.json`. Remote URL:

`https://gumkxjeahojrcaqnosyz.supabase.co/functions/v1/mcp`

Auth is the Lovable Cloud secret `LOVABLE_API_KEY` (injected into Edge Functions automatically). Cursor sends it as `Authorization: Bearer ${env:LOVABLE_API_KEY}` and `Lovable-API-Key`. Customer OAuth JWTs still work as a fallback.

API-key calls are service-role lookups and require `stand_number` (or `email` on `get_my_profile`). Tools: `get_my_profile`, `get_my_statements`, `get_payment_schedule`, `get_payoff_projection`, `get_my_payment_behaviour`. Rebuild the function with `npm run build:mcp` after editing `src/lib/mcp/`.

Deploy Edge Functions on Lovable Cloud (not `supabase functions deploy`): merge to the Git-synced branch, then in the Lovable project chat ask it to deploy `mcp` and `fetch-google-sheets` from the repo source. `npm run deploy:mcp` prints that prompt.

