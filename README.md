# LakeCity stand sales

Online sales wizard for the LakeCity stand campaign. A buyer picks a stand, fills in contact details and the digital
offer form, and pays the fixed USD 2,250 due at start by card on CBZ's hosted **iVeri Lite** page (Full Redirect,
**TEST environment only**; card details never touch this app). Only an iVeri AuthoriseInfo status 0, checked
server-side, moves them on. They then set up
their portal account with stand number + phone, which pre-populates their collection schedule, master schedule and
Odoo records (**mock adapters**, keyed by stand number). Staff see Valerie's sales report, fill the official-use block
and preview the automated emails on internal pages.

> **Rules for this build**
> * Read-only by default. Bots never move money. Card payments run on the **iVeri TEST** environment only; there is
>   no Live App ID in this repo and Live/Production needs Alex's own yes (OI-TBC-33).
> * The iVeri App ID and shared secret come from environment variables only. They are never hard-coded, logged or
>   sent to the browser (the browser gets only the signed form fields iVeri requires).
> * No Production. **Not deployed to Staging** either: that needs Alex's own yes.
> * Automated customer emails are approved (OI-TBC-18 closed) but stay in the **preview outbox** until an email
>   provider is configured (OI-TBC-20). Nothing is sent.
> * Adapters to the real sheets and Odoo are mock/read-only: no writes without Alex's go-ahead.
> * Bank account numbers are never shown in full: last 4 digits only (CBZ ...0018).
> * Never commit secrets. ID numbers and other personal data are never logged.
> * Unknowns are marked TBC with an `OI-TBC-nn` number. They are all listed in [Open items](#open-items-oi-tbc).
> * Everything customer-facing is PLACEHOLDER copy and design until QC and approval (OI-TBC-01).

Stack (Lovable compatible): Vite, React 18, TypeScript, Tailwind, shadcn/ui, Supabase (Postgres, Auth, Edge
Functions on Deno), pdf-lib. Emails are plain table-based HTML on the LakeCity standard template v4.

## Run it locally

```bash
npm install
npm run dev          # http://127.0.0.1:8137
```

With no Supabase env vars the app uses an **in-browser mock backend**: data in `localStorage`, emails rendered to the
outbox preview, and a **mock iVeri page** (`/mock-iveri/:reference`, mock mode only) standing in for CBZ's card page:
pick the card status AuthoriseInfo should report (0, 3, 4, 5, 9, 14, 255 or cancel) and it runs through the same
return handler and payment-confirmed handler as the server. No card data, no money.
Staff pages need no login in mock mode. "Reset demo data" on `/internal` clears everything.

| Page | URL |
| --- | --- |
| Landing: stand list, A/B/C range filter | `/` |
| Stand page: price summary + contact side pane | `/stands/:standNumber` |
| Wizard | `/apply/:leadId/{offer,payment,celebration,portal}` (`/apply/:leadId` jumps to the current step) |
| Staff: Valerie's sales report (3 statuses, counts, CSV export) and inventory | `/internal` |
| Staff: lead detail (offer, typed ID check, official use, records) | `/internal/leads/:leadId` |
| Staff: email outbox preview | `/internal/outbox` |

Scripts:

| Command | What it does |
| --- | --- |
| `npm test` | Vitest: pricing on the real sizes, A/B/C banding + filter, read-only amount, iVeri (env config, merchant reference, signed form + token, AuthoriseInfo parsing, status messages, return handler with a mocked gateway: approve once, duplicates, 3/4/5/9/14/255/cancel change nothing, gateway down, amount/trace mismatch, stand already sold), payment handler, **SQL test of `apply_payment_confirmed` on PGlite** (all migrations), report statuses, stand-keyed adapters, purchase progress, v4 emails, flow, ID validators |
| `npm run typecheck` / `npm run lint` / `npm run build` | The usual |
| `npm run screenshots` | Walks every step in headless Chrome against the running dev server and saves PNGs to `OUT_DIR` (default `/opt/cursor/artifacts`). It also asserts the stand count and phases, band coverage, VAT note, $2,250 due now, the locked amount and card button, a new merchant reference per attempt, each declined/cancelled result leaving the application unchanged, approval moving the stand out of inventory with one email, a replayed return changing nothing, the portal progress banner, the report counts and the contact-only tab, and saves full-length email previews. Set `CHROME_PATH` if Chrome isn't at `/usr/local/bin/google-chrome`. |
| `cd supabase/functions && deno check */index.ts` | Typechecks the edge functions |

## Pricing rules

Source of truth: `supabase/functions/_shared/domain/campaign.ts`.

| Rule | Value |
| --- | --- |
| Stand price | USD 45 × size in m², **including 15.5% VAT** (shown as "incl. 15.5% VAT"; OI-TBC-06 closed) |
| Down payment | USD 1,750 (fixed) |
| Legal fee (Agreement of Sale preparation, non-refundable, to Chigwanda Legal Practitioners) | USD 500 (fixed) |
| **Due at start (card payment step)** | **USD 2,250** = down payment + legal fee |
| Balance | price − down payment, over 48 monthly instalments; the last instalment absorbs rounding |
| Instalment due day | 5th of the month, starting the month after payment (OI-TBC-11) |

No VAT breakdown is shown for the down payment or the legal fee.

The card amount is always computed server-side (`paymentDueNowCents()`), shown in a read-only,
non-focusable field, sent to iVeri as `Lite_Order_Amount=225000` (USD), checked against AuthoriseInfo, and checked again by the payment
handler and the `apply_payment_confirmed` database function.

**Ranges A / B / C:** the span from the cheapest to the dearest stand price is split into three equal bands,
A = [min, min + w), B = [min + w, min + 2w), C = [min + 2w, max], where w = (max − min) / 3. Bands are computed over
every sized stand (sold or not), so a stand keeps its range as others sell (OI-TBC-24).

**Stand sizes and phases are real** (OI-TBC-04 closed): sheet `1b_ZLUR1WXjQfyhnNBc7oYSspiEJOOd9aKwuhzYR42u0`, tab
"Marketing Campaign Tracker", column A stand, column J area. They live in `src/data/stands.seed.json` and the seed
migration `20261125000002_seed_stands.sql`. 3 more campaign stands are TBC (OI-TBC-05).

| Range | Price | Stands |
| --- | --- | --- |
| A | USD 54,000 to under USD 85,320 | 10 |
| B | USD 85,320 to under USD 116,640 | 25 |
| C | USD 116,640 to USD 147,960 | 3 (3084, 3095, 3096) |

Smallest stand 1,200 m² (USD 54,000), largest 3,288 m² (USD 147,960).

## Wizard flow

1. **Landing:** every stand with number, phase, size (m²), price (incl. 15.5% VAT) and range. Filter by All / A / B / C. Covers loading, error
   (retry) and empty states. Reserved stands are shown but can't be selected.
2. **Stand selected:** the summary shows total price, $1,750 down payment, $500 legal fee and **$2,250 due now**. A
   side pane collects name, email and phone. Nothing is reserved yet.
3. **Digital offer form** (mirrors the General Offer Form, September 2025): purchaser identity (typed ID, no photos;
   OI-TBC-12), addresses, up to 3 co-owners, next of kin, the six conditions, and a typed or drawn signature. Email
   and phone are locked to the contact details. On submit, the offer email is queued to the outbox preview with the
   offer PDF.
4. **Card payment (iVeri Lite, Full Redirect)**: the locked **$2,250** amount and one **Pay $2,250 by card** button.
   * `lead-api` `start-payment` (offer submitted, not yet paid, stand still available) creates a `payment_attempts`
     row with a new **merchant reference** `LC<stand>-<8 random chars>` (unique per attempt, at most 20 characters,
     also the `Lite_Merchant_Trace`) and returns the signed Lite form (`iveri.ts` `buildLiteForm`: braced App ID,
     amount in cents, USD, the four return URLs, line item, email; `Lite_Transaction_Token` when a shared secret
     is set). The browser POSTs it to `portal.host.iveri.com/Lite/Authorise.aspx`.
   * iVeri sends the browser to the `iveri-return` edge function. Nothing iVeri posts is trusted: it calls
     **AuthoriseInfo** server-side for that trace and only **card status 0** calls `apply_payment_confirmed`, and
     only if AuthoriseInfo's own amount is 225000 (a different amount is recorded as `rejected`; a missing
     amount, another trace or a non-USD currency is held for a staff check). It then redirects to the payment
     step with the reference.
   * Statuses **3, 4, 5, 9, 14, 255** and cancel show a friendly message (255 explains 3-D Secure cards can't be
     used yet) and **change nothing**; "Try again" starts a new attempt with a new reference. If AuthoriseInfo
     can't be reached the attempt stays open and **Check payment status** re-checks it later.
   * **Idempotent:** `payment_events` records each reference once and a repeat returns the recorded outcome
     (so a racing second return can never report "approved" for a payment that wasn't applied). Only applied or
     held-for-check attempts are final; a missing status (buyer still on the card page, cancel) is never stored,
     and declined attempts are re-checked (by "Check payment status" and the return handler alike), so a late
     approval for a trace is never lost. Attempts not approved after 30 minutes appear under **Payments needing
     attention**. While a buyer has an approved-but-unapplied payment, new card attempts are refused (409).
   * An approved payment that can't be applied (stand already sold, lead already paid, wrong amount) is **recorded**
     as `unmatched`/`rejected` with a reason, nothing else changes, the buyer is told LakeCity Accounts will contact
     them, and staff see it under **Payments needing attention** on `/internal` (refund route OI-TBC-25).
   `apply_payment_confirmed` does everything else in one transaction: stand out of available inventory (`paid`;
   allocated to the buyer only at signing), lead paid, attempt approved, one thank-you email queued, wizard on to
   the portal step. ZikiMall has been **removed** from the wizard (OI-TBC-07).
5. **Celebration:** a confirmation screen naming the stand and payment (wording OI-TBC-02), with a button on to the
   portal step.
6. **Portal account:** the customer enters stand number + phone. If they match the application (last 9 digits of
   the phone), mock adapters prepare a collection schedule (49 rows), a master-schedule row and Odoo
   partner/account/payment records. **Stand number is the unique key** in every system (`MOCK-CS-<stand>`,
   `MOCK-MS-<stand>`, `MOCK-ODOO-…-<stand>`): one record per stand, upserted by stand; a second buyer on the same
   stand is rejected (and a partial unique index enforces one enrolment per stand in the database). Nothing is
   written anywhere real (OI-TBC-14 to 17). A "Progress of your purchase" banner sits at the top of the portal.

Buyers who pay but never sign are still enrolled in the portal and Odoo: enrolment follows confirmed payment, not
signing (OI-TBC-09 closed).

**Valerie's report** (`/internal`, `report.ts`): every signed-up lead has exactly one status, with counts and a
CSV export (no ID numbers): **Signed up** (offer submitted), **Signed up and Paid** (card payment approved),
**Signed up, Paid and Signed** (agreement signed). Applications without a submitted offer are left out of the report
(OI-TBC-29) and listed on their own **Contact only, not in report** tab.

The Agreement of Sale / DocuSign step is **parked** (OI-TBC-13). The code stays in the repo (`docusign.ts`,
`docusign-connect`, `mark_signed`, the template merge fields) but the core wizard doesn't call it.

## Emails (automated; preview outbox until a provider is set)

Every automated email is rendered on the **LakeCity standard HTML email template v4**
(`_shared/domain/email-html.ts`): 600px table layout, green `#0B412F` header with the white wordmark, 60×3 gold
rule and "Customer Care", summary table with a green header row and gold border, VML button for Outlook, green
footer with a gold top border, Playfair Display / Inter with Georgia / Arial fallbacks, mobile classes
`.wrap .pad .cell .logo`, and the sign-off **LakeCity Accounts** (accounts@lakecity.co.zw). Under the header every
email has a table-based **Progress of your purchase** bar: Signed up › Paid › Signed › Portal active, with ticks on
completed stages and the current stage in gold. Body copy is still PLACEHOLDER (OI-TBC-01).

| Stage | Trigger | Template | Content |
| --- | --- | --- | --- |
| Signed up | Offer submitted | `offer_completed` | Price (incl. 15.5% VAT), $2,250 due now, pay by card; **offer-to-purchase.pdf** attached |
| Paid | Payment confirmed (automatic) | `payment_thank_you` | Thank you, stand reserved, amount/date/reference, **View your offer** link |
| Portal active | Portal records ready | `portal_ready` | Collection account id, portal link. **Never a password.** |

Every email is written to `email_outbox` (or the in-browser outbox) with status `queued_dev_only` and logged as
metadata only. The offer link is built only from the server-configured `APP_URL`, never from the request.
The triggers are wired; the transport is the outbox. `emailsLive()` is true only if `EMAILS_LIVE=true` **and**
`EMAIL_PROVIDER` and `EMAIL_PROVIDER_API_KEY` are set, and the provider adapters are stubs that throw until the
provider is chosen (OI-TBC-20).

## Connecting Supabase (when approved; not done)

1. `supabase link && supabase db push` applies `supabase/migrations/` (schema, the 38 stands with real sizes and
   phases, the payment-events and payment-attempts tables).
2. Copy `.env.example` → `.env.local` and fill `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_APP_URL`.
3. Function secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, `PORTAL_URL`, and for card payments
   `IVERI_ENVIRONMENT=test`, `IVERI_APPLICATION_ID` (**TEST** App ID), optionally `IVERI_SHARED_SECRET` and
   `IVERI_RETURN_URL` (see `.env.example`). Without a TEST App ID card payments are off (friendly 503); any
   environment other than `test` also turns them off. Set `ALLOW_DEV_SIMULATIONS=true` only on a local stack: it
   lets `simulate-payment` play AuthoriseInfo for the caller's **own** attempt on an application awaiting payment.
4. Functions: `lead-intake`, `lead-api`, `iveri-return` (no JWT; verifies via AuthoriseInfo), `docusign-connect`
   (parked).
5. Staff: create a Supabase Auth user, then `insert into public.staff_users (user_id, email) values (…)`.

Security model: customers are anonymous and talk only to edge functions using a random per-lead access token (only
its SHA-256 hash is stored). Staff read through RLS (`is_staff()`) and write only through the security-definer
`set_offer_official_use`. `apply_payment_confirmed` (one transaction: reference recorded once, offer submitted,
stand number matches, amount 225000 cents, stand still available, outbox row; anything else is recorded as
`unmatched`/`rejected` instead of rolled back) and `mark_signed` are service-role only. Database errors are logged
by code only and the client gets a generic message.

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
| OI-TBC-04 | **CLOSED** (Alex, 2026-11-25): real sizes and phases from the Marketing Campaign Tracker sheet | `stands.seed.json`, seed migration |
| OI-TBC-05 | The 3 additional campaign stands (38 seeded) | `stands.seed.json`, seed migration |
| OI-TBC-06 | **CLOSED**: 15.5% VAT is included in the USD 45/m² price; shown as "incl. 15.5% VAT" | `campaign.ts` (`VAT`, `PRICE_VAT_NOTE`) |
| OI-TBC-07 | **SUPERSEDED**: ZikiMall removed from the wizard (Alex, 25 Nov: iVeri Lite card payments are the payment solution). Nothing could confirm ZikiMall payments automatically, so it isn't offered as another way to pay | (none) |
| OI-TBC-08 | CBZ settlement of iVeri card payments (Warwickshire Pvt Ltd CBZ ...0018): settlement and reconciliation report from CBZ/iVeri TBC | `iveri.ts` |
| OI-TBC-09 | **CLOSED**: pay-but-never-sign buyers stay enrolled in the portal and Odoo; report shows them as "Signed up and Paid" | `report.ts`, Dashboard |
| OI-TBC-10 | Collection schedule PDF layout to match the official template on Drive | `src/lib/pdf/documents.ts` |
| OI-TBC-11 | Standard instalment due day (5th vs 1st) and when instalments start | `campaign.ts`, `schedule.ts` |
| OI-TBC-12 | ID photos and verification: whether to collect ID images, and an automated provider (none found for Zimbabwe; Dojah, Smile ID, Didit need a vendor and data-protection review) | Offer form, lead detail |
| OI-TBC-13 | Where the Agreement of Sale / DocuSign step goes in the flow (parked) | `docusign.ts`, `docusign-connect`, `mark_signed` |
| OI-TBC-14 | StandLedger customer portal integration and login | `PortalStep.tsx`, `PORTAL_URL` |
| OI-TBC-15 | Collection Schedule: key decided: stand number; live connection pending (mock, read-only) | `integrations.ts` |
| OI-TBC-16 | Master Schedule: key decided: stand number; live connection pending (mock, read-only) | `integrations.ts` |
| OI-TBC-17 | Odoo (partner, account, payment): key decided: stand number; live connection pending (mock, read-only) | `integrations.ts` |
| OI-TBC-18 | **CLOSED**: automated customer emails allowed, on the standard template v4 | `email-html.ts`, `emails.ts` |
| OI-TBC-19 | Offer-link URL and access: the link works on the same device only (per-device access token) | `email.ts`, `supabase.ts` |
| OI-TBC-20 | Email provider choice (Resend vs Google Workspace). Until then every email stays in the preview outbox | `_shared/server/email.ts` |
| OI-TBC-21 | DocuSign plan / production account (demo only today) | DocuSign code |
| OI-TBC-22 | Where signed agreements are filed | Agreement step |
| OI-TBC-23 | Staging deployment: needs Alex's own yes (not deployed) | Infra |
| OI-TBC-24 | Range banding basis: all stands vs available only, and whether bands should be fixed price points | `priceBands()` in `campaign.ts` |
| OI-TBC-25 | Stand hold: two buyers can fill offers for the same stand; the first approved card payment takes the stand; a later approved payment is recorded as `unmatched` (Payments needing attention on `/internal`). Who refunds it and how (iVeri BackOffice void/refund) is TBC | `payment-events.ts`, `apply_payment_confirmed` |
| OI-TBC-26 | Retention and data-protection policy for offer-form personal data (IDs, next of kin) | `leads.offer` |
| OI-TBC-27 | **CLOSED** (ZikiMall account number = stand number). Now moot: ZikiMall removed (OI-TBC-07); the stand number is the base of the iVeri merchant reference | `newMerchantReference()` |
| OI-TBC-28 | **WITHDRAWN**: manual staff confirmation of ZikiMall receipts, superseded by automatic confirmation | (none) |
| OI-TBC-29 | Applications without a submitted offer are not "Signed up" and are left out of Valerie's report; confirm that's wanted | `report.ts` |
| OI-TBC-30 | **CLOSED**: iVeri AuthoriseInfo (server-side, status 0 only) is the payment confirmation source. Unmatched or wrong-amount payments are recorded and listed for staff | `iveri.ts`, `iveri-return`, `apply_payment_confirmed` |
| OI-TBC-31 | **Blocker before Live:** 3-D Secure / ECI must be enabled on the CBZ iVeri application. 3DS cards return status 255 ("ElectronicCommerceIndicator required") on TEST; the buyer is told to try another card | CBZ / iVeri setup |
| OI-TBC-32 | iVeri TEST card 5454… returns an iVeri 500 error (iVeri side; raise with iVeri/CBZ). If it happens the buyer sees a generic "payment not completed" message and nothing changes | iVeri |
| OI-TBC-33 | iVeri **Live** App ID and moving to Production: needs Alex's own yes. Only `IVERI_ENVIRONMENT=test` is accepted today. iVeri uses the same host for Test and Live, so the App ID itself decides: only a TEST App ID may be configured | `iveriConfigFromEnv()` |
| OI-TBC-34 | Turn on iVeri **Token Verification** (`IVERI_SHARED_SECRET`) before Live so the posted amount can't be altered in the browser (a changed amount is already caught by the AuthoriseInfo amount check and recorded as rejected), and confirm AuthoriseInfo returns `Lite_Currency_AlphaCode` and how long emails over 40 characters are handled | `buildLiteForm()`, `processIveriReturn()` |
