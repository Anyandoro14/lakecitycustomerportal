# LakeCity stand sales

Online sales wizard for the LakeCity stand campaign. A buyer picks a stand, fills in contact details and the digital
offer form, pays the fixed USD 2,250 due at start through ZikiMall (**stub**), sees a celebration page, and then sets
up their portal account with stand number + phone, which pre-populates their collection schedule, master schedule
and Odoo records (**mock adapters**). Staff track leads, fill the official-use block and preview emails on internal
pages.

> **Rules for this build**
> * Read-only by default. Bots never move money. Nothing here can take a payment.
> * No Production. **Not deployed to Staging** either: that needs Alex's own yes.
> * Emails are **preview mode only** (dev outbox). LakeCity staff send customer comms.
> * Never commit secrets. ID numbers and other personal data are never logged.
> * Unknowns are marked TBC with an `OI-TBC-nn` number. They are all listed in [Open items](#open-items-oi-tbc).
> * Everything customer-facing is PLACEHOLDER copy and design until QC and approval (OI-TBC-01).

Stack (Lovable compatible): Vite, React 18, TypeScript, Tailwind, shadcn/ui, Supabase (Postgres, Auth, Edge
Functions on Deno), pdf-lib, React Email.

## Run it locally

```bash
npm install
npm run dev          # http://127.0.0.1:8137
```

With no Supabase env vars the app uses an **in-browser mock backend**: data in `localStorage`, emails rendered to the
outbox preview, and a "Developer mode" button that simulates ZikiMall's payment-confirmed callback (no money moves).
Staff pages need no login in mock mode. "Reset demo data" on `/internal` clears everything.

| Page | URL |
| --- | --- |
| Landing: stand list, A/B/C range filter | `/` |
| Stand page: price summary + contact side pane | `/stands/:standNumber` |
| Wizard | `/apply/:leadId/{offer,payment,celebration,portal}` (`/apply/:leadId` jumps to the current step) |
| Staff: lead lists and inventory | `/internal` |
| Staff: lead detail (offer, typed ID check, official use, records) | `/internal/leads/:leadId` |
| Staff: email outbox preview | `/internal/outbox` |

Scripts:

| Command | What it does |
| --- | --- |
| `npm test` | Vitest: pricing, A/B/C banding + filter, non-editable amount, flow, ID validators, templates |
| `npm run typecheck` / `npm run lint` / `npm run build` | The usual |
| `npm run screenshots` | Walks every step in headless Chrome against the running dev server and saves PNGs to `OUT_DIR` (default `/opt/cursor/artifacts`). It also asserts the stand count, band coverage, $2,250 due now, and that the ZikiMall amount can't be edited. Set `CHROME_PATH` if Chrome isn't at `/usr/local/bin/google-chrome`. |
| `cd supabase/functions && deno check */index.ts` | Typechecks the edge functions |

## Pricing rules

Source of truth: `supabase/functions/_shared/domain/campaign.ts`.

| Rule | Value |
| --- | --- |
| Stand price | USD 45 × size in m² |
| Down payment | USD 1,750 (fixed) |
| Legal fee (Agreement of Sale preparation, non-refundable, to Chigwanda Legal Practitioners) | USD 500 (fixed) |
| **Due at start (ZikiMall step)** | **USD 2,250** = down payment + legal fee |
| Balance | price − down payment, over 48 monthly instalments; the last instalment absorbs rounding |
| Instalment due day | 5th of the month, starting the month after payment (OI-TBC-11) |
| VAT | Not applied or shown (OI-TBC-06) |

The amount at the ZikiMall step is always computed server-side (`paymentDueNowCents()`), shown in a read-only,
non-focusable field, and checked again in the `confirm_payment` database function.

**Ranges A / B / C:** the span from the cheapest to the dearest stand price is split into three equal bands,
A = [min, min + w), B = [min + w, min + 2w), C = [min + 2w, max], where w = (max − min) / 3. Bands are computed over
every sized stand (sold or not), so a stand keeps its range as others sell (OI-TBC-24).

**Stand sizes are mock values** (`src/data/stands.seed.json`, 300–890 m²) until LakeCity supplies real ones
(OI-TBC-04). The UI tags them "Mock size". The 38 stand numbers are real. 3 more are TBC (OI-TBC-05).

## Wizard flow

1. **Landing:** every stand with number, size (m²), price and range. Filter by All / A / B / C. Covers loading, error
   (retry) and empty states. Reserved stands are shown but can't be selected.
2. **Stand selected:** the summary shows total price, $1,750 down payment, $500 legal fee and **$2,250 due now**. A
   side pane collects name, email and phone. Nothing is reserved yet.
3. **Digital offer form** (mirrors the General Offer Form, September 2025): purchaser identity (typed ID, no photos;
   OI-TBC-12), addresses, up to 3 co-owners, next of kin, the six conditions, and a typed or drawn signature. Email
   and phone are locked to the contact details. On submit, the offer email is queued to the outbox preview with the
   offer PDF.
4. **ZikiMall:** an auto-populated, **non-editable** $2,250 field. The ZikiMall button stays disabled until the
   integration exists (OI-TBC-07). On payment confirmation (simulated in dev only) the stand becomes `paid`, the lead
   moves to the paid list, and the thank-you email is queued.
5. **Celebration:** names the stand and payment (wording OI-TBC-02). It says staff will send the thank-you email,
   which is prepared in preview mode (green/white/gold, stage badge, 4-stage progress bar, "View your offer" link).
6. **Portal account:** the customer enters stand number + phone. If they match the application (last 9 digits of
   the phone), mock adapters prepare a collection schedule (49 rows), a master-schedule row and Odoo
   partner/account/payment records. Ids are prefixed `MOCK-` and nothing is written anywhere real
   (OI-TBC-14 to 17).

The Agreement of Sale / DocuSign step is **parked** (OI-TBC-13). The code stays in the repo (`docusign.ts`,
`docusign-connect`, `mark_signed`, the template merge fields) but the core wizard doesn't call it.

## Emails (preview mode only)

Branded React Email templates in `src/emails/` with the LakeCity header, a gold stage badge and a 4-stage tracker
(Stand chosen → Offer signed → Payment received → Portal account). All copy is PLACEHOLDER.

| Stage | Trigger | Template | Content |
| --- | --- | --- | --- |
| 2 | Offer submitted | `offer_completed` | Price summary, $2,250 due now; **offer-to-purchase.pdf** attached |
| 3 | Payment confirmed | `payment_thank_you` | Thank you, stand reserved, amount/date/reference, **View your offer** link |
| 4 | Portal records ready | `portal_ready` | Collection account id, portal link. **Never a password.** |

Every email is written to `email_outbox` (or the in-browser outbox) with status `queued_dev_only` and logged as
metadata only. The offer link is built only from the server-configured `APP_URL`, never from the request.
`emailsLive()` is true only if `EMAILS_LIVE=true` **and** `EMAIL_PROVIDER`, `EMAIL_PROVIDER_API_KEY` and
`EMAIL_LIVE_APPROVAL_REF` are set, and the provider adapters are stubs that throw. Going live needs QC PASS, Alex
Key 1 + Key 2 approval and an owner decision on automated sends (OI-TBC-18, OI-TBC-20).

## Connecting Supabase (when approved; not done)

1. `supabase link && supabase db push` applies `supabase/migrations/` (schema + the 38 stand numbers, no sizes).
   For local dev only, `supabase db reset` also runs `supabase/seed.sql` (mock sizes). Never run it on Staging or
   Production.
2. Copy `.env.example` → `.env.local` and fill `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_APP_URL`.
3. Function secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, `PORTAL_URL`. Set
   `ALLOW_DEV_SIMULATIONS=true` only on a local stack.
4. Functions: `lead-intake`, `lead-api`, `zikimall-callback` (returns 501 until OI-TBC-07), `docusign-connect`
   (parked).
5. Staff: create a Supabase Auth user, then `insert into public.staff_users (user_id, email) values (…)`.

Security model: customers are anonymous and talk only to edge functions using a random per-lead access token (only
its SHA-256 hash is stored). Staff read through RLS (`is_staff()`) and write only through the security-definer
`set_offer_official_use`. `confirm_payment` (offer must be submitted, amount must be 225000 cents) and
`mark_signed` are service-role only.

## Importing into Lovable

Create a repository for this project (it doesn't have one yet; use the **Create repo** pill), then create a
Lovable project from that GitHub repo, connect Supabase in Lovable and apply `supabase/migrations`. Shared domain
code (`supabase/functions/_shared/domain`) is dependency-free and imported by both the app (`@shared/*`) and the
functions.

## Field mapping

### General Offer Form (September 2025)

| Offer Form item | Captured in |
| --- | --- |
| Purchaser(s) full name(s), D.O.B., ID number | Offer form › Purchaser + each co-owner (ID type, issuing country, number, expiry) |
| Residential / postal / alternative address, country | Offer form |
| Cell number, email | Stand page side pane (locked on the offer form) |
| Business phone | Offer form (optional) |
| Next of kin: name, D.O.B., ID, residential address, cell (required); business phone, email, alt. address (optional) | Offer form › Next of kin |
| Stand number, size, price, down payment, legal fee, due now, term, monthly | Computed from the stand (read-only) |
| 6 acknowledgements (USD 500 non-refundable legal fee to Chigwanda Legal Practitioners, minimum instalment over 48 months, re-allocation after 3 consecutive missed payments, non-refundable on default, legal fee payment, stamp duty + conveyancing) | Offer form › 6 required checkboxes |
| Signed at, date, purchaser name, signature | Offer form › typed or drawn signature |
| Official use (stand confirmation, checked by, signature, date) | Internal lead page only |

### Agreement of Sale merge fields (parked, OI-TBC-13)

The field list and sources live in `supabase/functions/_shared/domain/agreement-fields.ts`; `npm test` checks the
placeholder PDF in `public/templates/` has every field. Replace it with the real template when available
(OI-TBC-03).

## ID validation

Typed ID numbers are format-checked in the browser and again in the edge function, then checked by hand by staff on
the lead page. Validators live in a per-country registry (`_shared/domain/id-validation.ts`):

| Rule | Check | Source |
| --- | --- | --- |
| Zimbabwe national ID | `RR-NNNNNN(N) C DD`; check letter = (office+serial) mod 23 → `ZABCDEFGHJKLMNPQRSTVWXY` | Team Pachedu, *2018 Biometric Voters' Roll Analysis*, Appendix 2 ([PDF](https://www.kubatana.net/wp-content/uploads/2018/07/mainreport.pdf)); cross-checked against [identique/idnumbers](https://github.com/identique/idnumbers). Not an official Registrar-General spec, so a failed check is a hint, not proof. |
| South Africa ID | 13 digits `YYMMDD SSSS C A Z`, valid date, citizenship 0/1/2, Luhn | Identification Regulations 1998, reg. 3 ([polity.org.za](https://www.polity.org.za/polity/govdocs/regulations/1998/reg98-0978.html)) |
| Any other country | 4–20 letters/digits after removing separators | Generic fallback |
| Passport | 6–9 letters/digits, issuing country required, future expiry required | ICAO Doc 9303 |

## Open items (OI-TBC)

| OI | Open item | Where it shows up |
| --- | --- | --- |
| OI-TBC-01 | Final copy, design and legal wording everywhere marked PLACEHOLDER | All customer pages, emails, PDFs |
| OI-TBC-02 | Final celebration-page wording (owner's sentence was cut off) | `CelebrationStep.tsx` |
| OI-TBC-03 | Real Agreement of Sale template | `public/templates/` |
| OI-TBC-04 | Real stand sizes (m²). Sizes today are **mock**, so every price is illustrative | `stands.seed.json`, `seed.sql`, "Mock size" tags |
| OI-TBC-05 | The 3 additional campaign stands (38 seeded) | `stands.seed.json`, seed migration |
| OI-TBC-06 | VAT treatment of the USD 45/m² price | `campaign.ts`, schedule PDF |
| OI-TBC-07 | ZikiMall integration: checkout URL, payload, callback signature, how the fixed amount is passed | `PaymentStep.tsx`, `lead-api`, `zikimall-callback` (501) |
| OI-TBC-08 | CBZ settlement and reconciliation of ZikiMall payments | Payment confirmation |
| OI-TBC-09 | Refund / expiry policy if a customer pays but never signs the Agreement of Sale | Paid list |
| OI-TBC-10 | Collection schedule PDF layout to match the official template on Drive | `src/lib/pdf/documents.ts` |
| OI-TBC-11 | Standard instalment due day (5th vs 1st) and when instalments start | `campaign.ts`, `schedule.ts` |
| OI-TBC-12 | ID photos and verification: whether to collect ID images, and an automated provider (none found for Zimbabwe; Dojah, Smile ID, Didit need a vendor and data-protection review) | Offer form, lead detail |
| OI-TBC-13 | Where the Agreement of Sale / DocuSign step goes in the flow (parked) | `docusign.ts`, `docusign-connect`, `mark_signed` |
| OI-TBC-14 | StandLedger customer portal integration and login | `PortalStep.tsx`, `PORTAL_URL` |
| OI-TBC-15 | Collection schedule integration (mock adapter today) | `integrations.ts` |
| OI-TBC-16 | Master schedule integration (mock adapter today) | `integrations.ts` |
| OI-TBC-17 | Odoo integration: partner, account, payment (mock adapter today) | `integrations.ts` |
| OI-TBC-18 | Owner decision on automated customer emails (today staff send all comms) | `emails.ts`, outbox |
| OI-TBC-19 | Offer-link URL and access: the link works on the same device only (per-device access token) | `email.ts`, `supabase.ts` |
| OI-TBC-20 | Email provider choice (Resend vs Google Workspace) | `_shared/server/email.ts` |
| OI-TBC-21 | DocuSign plan / production account (demo only today) | DocuSign code |
| OI-TBC-22 | Where signed agreements are filed | Agreement step |
| OI-TBC-23 | Staging deployment: needs Alex's own yes (not deployed) | Infra |
| OI-TBC-24 | Range banding basis: all stands vs available only, and whether bands should be fixed price points | `priceBands()` in `campaign.ts` |
| OI-TBC-25 | Stand hold: two buyers can fill offers for the same stand; the first confirmed payment wins and the second payment must be refused or refunded by ZikiMall | `confirm_payment` |
| OI-TBC-26 | Retention and data-protection policy for offer-form personal data (IDs, next of kin) | `leads.offer` |
