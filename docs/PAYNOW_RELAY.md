# Paynow relay

Paynow resets connections from Supabase Edge Function egress IPs. Hosted
checkout and EcoCash/OneMoney initiate calls must go through a relay on a
network Paynow allows (Cloudflare Workers).

The Edge Functions already read:

| Secret | Purpose |
| --- | --- |
| `PAYNOW_PROXY_URL` | Worker URL, no trailing slash |
| `PAYNOW_PROXY_SECRET` | Same value as the Worker `RELAY_SECRET` |

These are backend secrets only. Never prefix them with `VITE_`.

## 1. Deploy the Worker

1. Create a free Cloudflare account if you do not have one.
2. [Create an API token](https://dash.cloudflare.com/profile/api-tokens) with
   **Workers Scripts: Edit** and copy the **Account ID** from the Workers
   overview.
3. From this repo:

   ```sh
   npx wrangler login
   # or: export CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=...
   npx wrangler deploy
   npx wrangler secret put RELAY_SECRET
   ```

   Use a long random string for `RELAY_SECRET` (for example `openssl rand -hex 32`).
4. Copy the printed `*.workers.dev` URL.

Optional: add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub
repository secrets. Pushes that touch the Worker then deploy via
`.github/workflows/deploy-paynow-relay.yml`. Still run
`npx wrangler secret put RELAY_SECRET` once.

## 2. Point Lovable Cloud / Supabase at the Worker

In Lovable Cloud secrets (or `supabase secrets set`):

```sh
PAYNOW_PROXY_URL=https://lakecity-paynow-relay.<your-account>.workers.dev
PAYNOW_PROXY_SECRET=<same value as RELAY_SECRET>
```

Redeploy `paynow-init`, `paynow-status`, and `paynow-webhook` if your host
does not pick up new secrets automatically.

## 3. Local check

```sh
RELAY_SECRET=devsecret npm run paynow-relay:local
# other terminal
npm run test:paynow-relay
```

To exercise a real Paynow reachability check through the local relay:

```sh
RELAY_SECRET=devsecret npm run paynow-relay:local
curl -sS -D- -o /tmp/paynow-relay-body.txt \
  -H 'X-Relay-Secret: devsecret' \
  -H 'X-Paynow-Target: https://www.paynow.co.zw/interface/initiatetransaction' \
  --data 'id=1' \
  http://127.0.0.1:8787
```

A `200` with a Paynow `status=` body means the relay can reach Paynow. An
`Invalid Hash` (or similar) rejection is expected for dummy fields — that is
still success for connectivity.

## 4. Local Edge Functions

After `npm run test:env:setup`, add the same two secrets to
`supabase/.functions-test.env` and run `npm run paynow-relay:local` alongside
`npm run test:env:serve-functions`.
