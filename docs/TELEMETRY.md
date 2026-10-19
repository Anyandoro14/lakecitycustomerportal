# Product telemetry (privacy-safe)

LakeCity portal analytics use **PostHog Cloud (free)** in the browser and **OpenTelemetry → Grafana Cloud (free)** on payment-related Supabase Edge Functions.

North Star metric: **`paynow_payment_completed`** (payments completed through the portal, fired only after server-confirmed settlement on `/pay/return`).

## Environment variables

Set these in Vite / hosting (browser) and Supabase Edge Function secrets (server). Never commit real values.

| Variable | Where | Purpose |
|----------|--------|---------|
| `VITE_POSTHOG_KEY` | Frontend | PostHog project API key |
| `VITE_POSTHOG_HOST` | Frontend | PostHog host (e.g. `https://us.i.posthog.com`) |
| `VITE_TELEMETRY_SALT` | Frontend | Static salt for SHA-256 user identify |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Edge Functions | Grafana Cloud OTLP base or `/v1/traces` URL |
| `OTEL_EXPORTER_OTLP_HEADERS` | Edge Functions | e.g. `Authorization=Basic …` (comma-separated `k=v`) |

If any required PostHog vars are missing, the client is **fully inert** (no init network calls, no errors). If OTEL endpoint is missing, edge spans are skipped.

## Privacy rules

- Session recording: **`disable_session_recording: true`** and **`disable_external_dependency_loading: true`** (recorder.js never loads).
- `mask_all_text` and `mask_all_element_attributes`: true.
- Input values are never captured; sensitive DOM uses `ph-no-capture`.
- URLs: query strings and hash fragments stripped via `before_send` / sanitizers.
- `person_profiles: 'identified_only'`.
- Identify only with `SHA-256(internal_user_id + VITE_TELEMETRY_SALT)` — never email, name, phone, stand/account numbers, or amounts.
- Exception messages/stacks: emails and digit runs of 6+ redacted.
- OTEL spans: function name, HTTP status, duration only — no bodies or user fields.

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
payment_flow_started
        │
        ▼
payment_method_selected  (method type only: paynow | ecocash | zikimall | bank_transfer | …)
        │
        ▼
paynow_redirected        (hosted / mobile checkout handoff)
        │
        ├──────────────────► paynow_payment_completed   ← North Star (server-confirmed Paid)
        │
        └──────────────────► paynow_payment_failed      (error_category only)
```

Also: `statement_viewed` when a customer opens Monthly Statements.

Autocapture + pageview / pageleave power top pages, top clicks, and time-on-page. Heatmaps use PostHog heatmap capture (no session replay).

## OpenTelemetry (edge)

Shared helper: `supabase/functions/_shared/otel.ts`.

Instrumented functions:

- `paynow-init`, `paynow-status`, `paynow-webhook`
- `odoo-sync-payment`, `odoo-webhook`

CORS allow-headers include `traceparent`, `tracestate`, `baggage`. The browser attaches a lightweight `traceparent` on PayNow `functions.invoke` calls.

## Building the PostHog dashboard

1. Create a PostHog project (Cloud Free) and copy Project API Key + Host into the Vite env vars above. Set a long random `VITE_TELEMETRY_SALT`.
2. Deploy the portal; browse a few pages and complete a test payment in a non-prod project if available.
3. In PostHog → **Dashboards** → New dashboard “Portal product”:
   - **Top pages**: Trends on `$pageview`, breakdown by `$pathname` (sanitized).
   - **Top clicks**: Trends on autocapture `$autocapture`, breakdown by element tag / text (masked) or use **Heatmaps**.
   - **Avg time on page**: Trends using `$pageleave` with property `$prev_pageview_duration` (or PostHog’s “Time on page” insight), breakdown by `$pathname`.
   - **Payment funnel**: Funnels insight ordered  
     `payment_flow_started` → `payment_method_selected` → `paynow_redirected` → `paynow_payment_completed`  
     (optional drop-off step: `paynow_payment_failed`).
   - **Devices / browsers**: Breakdown `$pageview` by `$device_type`, `$browser`, `$os`.
   - **Errors**: Trends on `$exception` (messages already scrubbed).
4. Pin **North Star**: single-number insight counting `paynow_payment_completed` (daily / weekly).
5. In Grafana Cloud: add an OTLP source, set the Edge Function secrets, and explore traces filtered by `service.name = lakecity-edge-functions` and `faas.name` in `{paynow-init,paynow-status,…}`.

## Local verification

```bash
npm test          # unit tests (sanitizer, identify, noop, session recording flag)
npm run build     # production build
```

Without keys, the app runs normally and sends nothing. With a test key, Network panel should show PostHog `/e/` (or `/i/v0/e`) payloads whose `$current_url` has no `?` / `#`, and no raw emails or long digit runs in properties.
