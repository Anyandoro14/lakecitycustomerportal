# Product telemetry (privacy-safe)

LakeCity portal analytics use **PostHog Cloud (free)** in the browser and **OpenTelemetry → Grafana Cloud (free)** on Odoo/payment Edge Functions that still run.

**North Star metric: `payment_posted_odoo`** — a payment successfully posted in Odoo for a hashed customer, emitted **server-side** from `odoo-sync-payment` after a posted sync. No amounts, names, or reference numbers.

PayNow is not part of the live portal payment path. Customers pay via ZikiMall (external), CABS/CBZ bank transfer, remittance, or cash/EcoCash through staff (then email proof of payment).

## Environment variables

Set these in Vite / hosting (browser) and Supabase Edge Function secrets (server). Never commit real values.

| Variable | Where | Purpose |
|----------|--------|---------|
| `VITE_POSTHOG_KEY` | Frontend | PostHog project API key |
| `VITE_POSTHOG_HOST` | Frontend | PostHog host (e.g. `https://us.i.posthog.com`) |
| `VITE_TELEMETRY_SALT` | Frontend | Static salt for SHA-256 user identify |
| `POSTHOG_PROJECT_KEY` | Edge Functions | Same PostHog project key (server capture) |
| `POSTHOG_HOST` | Edge Functions | Same PostHog host |
| `TELEMETRY_SALT` | Edge Functions | Same salt as `VITE_TELEMETRY_SALT` (aligned distinct_ids) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Edge Functions | Grafana Cloud OTLP base or `/v1/traces` URL |
| `OTEL_EXPORTER_OTLP_HEADERS` | Edge Functions | e.g. `Authorization=Basic …` (comma-separated `k=v`) |

If PostHog browser vars are missing, the client is **fully inert**. If `POSTHOG_PROJECT_KEY` / `POSTHOG_HOST` are missing, server capture is skipped. If OTEL endpoint is missing, edge spans are skipped.

## Privacy rules

- Session recording: **`disable_session_recording: true`** and **`disable_external_dependency_loading: true`** (recorder.js never loads).
- `mask_all_text` and `mask_all_element_attributes`: true.
- Input values are never captured; sensitive DOM uses `ph-no-capture`.
- URLs: query strings and hash fragments stripped via `before_send` / sanitizers.
- `person_profiles: 'identified_only'`.
- Identify only with `SHA-256(internal_user_id + salt)` — never email, name, phone, stand/account numbers, or amounts.
- Exception messages/stacks: emails and digit runs of 6+ redacted.
- OTEL spans: function name, HTTP status, duration only — no bodies or user fields.
- Server `payment_posted_odoo`: `distinct_id` = salted hash; `source` only; `$insert_id` = hash of Odoo payment id (dedupe). No amount / names / refs.

### `ph-no-capture` areas

| Area | Why |
|------|-----|
| Login form (stand + password) | Credentials / stand id |
| Login OTP form | Verification codes / destinations |
| `CustomerOverview` | Customer name + stand number |
| `InfoCards` progress + balance grid | Balances and payment amounts |
| `PaymentHistory` | Amounts and payment references |
| Pay page account summary card | Name, stand, balance, instalment |
| Pay page ZikiMall instructions | Stand / identity guidance |
| Pay page bank transfer section | Bank account numbers |
| Pay page remittance payee names | Personal names |
| `/pay/return` detail block | Amount, stand, payment references |
| Monthly statement history list | Stand + balances |
| Monthly statement document | Full statement PII / financials |

## Payment funnel events

```
payment_flow_started          (/pay opened)
        │
        ├─► zikimall_redirected              (ZikiMall button click; no amount/account data)
        │
        ├─► payment_instructions_viewed      (page/section opened; section label only)
        │
        └─► … customer pays offline / externally …
                    │
                    ▼
          payment_posted_odoo   ← North Star (server; Odoo posted sync)
```

Also: `statement_viewed` when a customer opens Monthly Statements.

Autocapture + pageview / pageleave power top pages, top clicks, and time-on-page. Heatmaps use PostHog heatmap capture (no session replay).

### Removed (PayNow)

These events are **not** emitted: `payment_method_selected`, `paynow_redirected`, `paynow_payment_completed`, `paynow_payment_failed`.

## OpenTelemetry (edge)

Shared helper: `supabase/functions/_shared/otel.ts`.

Instrumented functions (payment / Odoo path that still matters):

- `odoo-sync-payment`
- `odoo-webhook`

PayNow edge functions are **not** wrapped in OTEL. CORS allow-headers on the Odoo functions include `traceparent`, `tracestate`, `baggage`.

## Building the PostHog dashboard

1. Create a PostHog project (Cloud Free). Set browser + edge secrets listed above (same project key/host; same salt on both sides).
2. Deploy the portal and edge functions; approve a test receipt so `odoo-sync-payment` posts to Odoo (non-prod).
3. In PostHog → **Dashboards** → New dashboard “Portal product”:
   - **Top pages**: Trends on `$pageview`, breakdown by `$pathname` (sanitized).
   - **Top clicks**: Trends on `$autocapture` / **Heatmaps**.
   - **Avg time on page**: `$pageleave` / time-on-page insight by `$pathname`.
   - **Payment funnel**:  
     `payment_flow_started` → `zikimall_redirected` (and/or `payment_instructions_viewed`) → **`payment_posted_odoo`**.  
     Note: ZikiMall and bank/remittance are not closed-loop in the browser; the North Star is the server event when Odoo posts.
   - **Devices / browsers**: Breakdown `$pageview` by `$device_type`, `$browser`, `$os`.
   - **Errors**: Trends on `$exception` (messages scrubbed).
4. Pin **North Star**: single-number insight counting `payment_posted_odoo` (daily / weekly).
5. Grafana Cloud: OTLP traces for `service.name = lakecity-edge-functions`, `faas.name` in `{odoo-sync-payment, odoo-webhook}`.

## Local verification

```bash
npm test          # unit tests (sanitizer, identify, noop, session recording flag)
npm run build     # production build
```

Without keys, the app and edge helpers send nothing. With a test key, Network panel should show PostHog payloads whose `$current_url` has no `?` / `#`, and no raw emails or long digit runs.
