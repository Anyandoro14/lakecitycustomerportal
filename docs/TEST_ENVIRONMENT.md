# Test environment (before production)

## Fast path: local test stack (your machine)

Requires **[Docker Desktop](https://docs.docker.com/desktop/)** running.

```bash
npm run test:env:setup
```

This will:

1. Start **local Supabase** (`npx supabase start`) and apply everything under `supabase/migrations/`.
2. Create **`.env.test.local`** with the standard local API URL + anon key + `lakecity` tenant slug.
3. Create **`supabase/.functions-test.env`** (git-ignored) for Edge Functions.

Then use **two terminals**:

| Terminal | Command |
|----------|---------|
| 1 | `npm run dev:test` — Vite app on http://localhost:8080 (or next free port) |
| 2 | `npm run test:env:serve-functions` — serves `supabase/functions` against local DB |

**Reset local DB** (wipe data, re-run migrations): `npx supabase db reset`  
**Stop Docker stack**: `npx supabase stop`

---

## Cloud test project (optional)

Use a **separate Supabase project** (or a Supabase **preview branch**) so you never point a work-in-progress app at live customer data.

### 1. Create the test backend

Pick one:

- **New Supabase project** named e.g. `lakecity-portal-test` (free tier is fine for dev).
- **Supabase branching** (if your plan includes it): a preview database linked to a branch.

You do **not** need a second Lovable project unless you want a hosted preview there too. Running the **Vite app on your laptop** against the test Supabase URL is enough for “test environment.”

### 2. Apply the database schema to test

On the **test** project only:

- **Option A — Supabase CLI** (if you have access):  
  `supabase link --project-ref <TEST_REF>` then `supabase db push`
- **Option B — SQL Editor**: run migrations in order from `supabase/migrations/`, or paste the one-shot script in `docs/sql/lovable-ensure-tenants-lakecity.sql` if you only need `tenants` + `lakecity` for a quick smoke test.

Until migrations match this repo, features like `fetch-customer-data` will fail or return empty data.

### 3. Deploy Edge Functions to test

Edge Functions live in the Supabase project you call. For the **test** project, deploy the functions your branch uses (at minimum `fetch-customer-data` if the dashboard uses it):

```bash
# After linking to the TEST project
npx supabase functions deploy fetch-customer-data
# Repeat for other functions as needed
```

If you only use the SQL editor and Lovable later, note that **functions must exist on the same project** as `VITE_SUPABASE_URL`.

### 4. Point the frontend at test (local)

1. Copy `.env.example` to **`.env.test.local`** in the project root (this file is git-ignored via `*.local`).
2. Set:
   - `VITE_SUPABASE_URL` = test project URL  
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = test project **anon** key (Settings → API)
3. Optional: `VITE_DEFAULT_TENANT_SLUG=lakecity` if your test DB uses that slug.

Vite **test mode** loads, in order: `.env`, `.env.local`, `.env.test`, **`.env.test.local`** (highest priority for duplicates).

### 5. Run the app in test mode

```bash
npm run dev:test
```

Open the URL Vite prints (e.g. `http://localhost:8080`). This uses **only** the variables above, so your default `npm run dev` can keep using `.env` for another project if needed.

### 6. Smoke checklist

- [ ] Login works (Auth users exist on **test** or you sign up a test user).
- [ ] No “Tenant … not found” → `tenants` row with slug `lakecity` (or your slug + env).
- [ ] Customer dashboard loads or shows a clear “no contracts” state (expected if test DB has no `contracts` yet).
- [ ] Browser devtools → Network: calls hit your **test** Supabase host, not production.

### 7. Production later

When ready: repeat migration + function deploy on the **production** project, update Lovable env / publish, and keep using `npm run dev:test` for day-to-day feature work.
