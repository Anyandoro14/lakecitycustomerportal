# LakeCity stand sales (scaffold)

Online sales flow for the LakeCity stand campaign: a buyer picks a stand, submits their details and ID, completes
the offer form, gets a 48-month payment schedule, pays the deposit (ZikiMall, **stub**), signs the Agreement of
Sale (DocuSign **demo** only), and activates their customer portal. Staff review IDs and track leads on internal pages.

> **Everything customer-facing is PLACEHOLDER** (design, copy, prices, legal text) and needs Cursor QC + approval.
> No real payments, no real emails, no deployment. The only external side effect this code can ever have is
> creating DocuSign **demo** envelopes, and only once demo keys are supplied.

Stack (Lovable compatible): Vite, React 18, TypeScript, Tailwind, shadcn/ui, Supabase (Postgres, private Storage,
Auth, Edge Functions on Deno), pdf-lib, React Email.

## Run it locally

```bash
npm install
npm run dev          # http://localhost:8137
```

With no Supabase env vars the app uses an **in-browser mock backend**: data in `localStorage`, ID images in memory
only (lost on reload), emails rendered to a dev outbox, and "Developer mode" buttons that simulate the ZikiMall
callback, DocuSign completion and magic link. Staff pages need no login in mock mode.

| Page | URL |
| --- | --- |
| Landing | `/` |
| Wizard | `/apply` then `/apply/:leadId/{id-review,offer,schedule,payment,agreement,portal,complete}` |
| Staff: lead lists, inventory, ID review queue | `/internal` |
| Staff: lead detail (ID review, official use, portal status) | `/internal/leads/:leadId` |
| Staff: email outbox preview | `/internal/outbox` |

Other scripts: `npm run typecheck`, `npm run build`, `npm test` (validators, schedule maths, template fields),
`npm run lint`, `npm run screenshots` (walks the whole flow with headless Chrome while `npm run dev` runs; set
`CHROME_PATH` / `OUT_DIR`), `npm run generate:agreement` (rebuilds the placeholder PDF), `npm run generate:countries`.

## Wizard order

1. Landing
2. Intake + ID upload (buyer and optional co-owners, up to 3)
3. **ID review gate**: lead is `id_pending_review` until a LakeCity staff member approves or rejects it (reason,
   reviewer and time logged). The customer sees "we're checking your ID".
4. Offer form (mirrors the General Offer Form, September 2025), prefilled from intake
5. Payment schedule shown, PDF download, and emailed (dev outbox)
6. Deposit via ZikiMall (stub). On confirmation: stand becomes `paid` (out of inventory, reserved to the lead),
   lead moves to the **paid** list, a Collection Schedule account is created (mock id `LC-CS-…`), and the customer
   portal account is **auto-created** (status `created`), pre-linked to that account and stand using the intake email
7. Agreement of Sale via DocuSign. On completion the stand is **allocated** (`signed`) and the lead moves to the
   **signed** list. DocuSign emails the signed copy.
8. Portal activation (forced): set a password, or confirm via magic link. Status `created → activated`
9. Celebration page with "Log in to your portal" (`PORTAL_URL`, default `https://lakecity.standledger.io`)

**Note on order (kept as instructed):** signing comes *before* portal activation, but the portal account itself is
created right after payment. So a customer who pays but never signs has a portal account that is never activated.
Activating before signing would let them see their statement sooner. Owner call.

## Connecting Supabase

1. Create a Supabase project and run the migrations: `supabase link && supabase db push`
   (`supabase/migrations/…_init_schema.sql`, `…_seed_stands.sql`).
2. Copy `.env.example` → `.env.local` and fill `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Set function secrets (`supabase secrets set --env-file supabase/functions/.env`): `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `PORTAL_URL`, optionally `ALLOW_DEV_SIMULATIONS=true` for testing.
4. Deploy functions: `supabase functions deploy lead-intake lead-api docusign-connect zikimall-callback`.
5. Staff: create a user in Supabase Auth, then `insert into public.staff_users (user_id, email) values (…)`.

Security model: customers are anonymous and talk only to edge functions, using a random per-lead access token
issued at intake (only its SHA-256 hash is stored). Staff read through RLS (`is_staff()`) and change state only
through security-definer RPCs (`review_id`, `set_offer_official_use`). Payment and signing transitions
(`confirm_payment`, `mark_signed`) are callable by the service role only.

**ID documents:** stored only in the private `id-documents` bucket (8 MB limit, JPEG/PNG/WebP/PDF, checked by MIME
type *and* magic bytes, client and server). There are no public URLs. Staff get 5-minute signed URLs. Images and ID numbers
are never logged. No OCR and no third-party verification.

## Testing DocuSign end to end (developer sandbox)

1. Create a free account at [developers.docusign.com](https://developers.docusign.com) (demo environment).
2. Apps and Keys → Add App → Integration Key. Generate an **RSA keypair** (save the private key). Add redirect URI
   `https://localhost/callback` (only used for consent).
3. Grant consent once (as the user you will impersonate):
   `https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=<INTEGRATION_KEY>&redirect_uri=https://localhost/callback`
4. Set secrets: `DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_USER_ID` (API Username GUID), `DOCUSIGN_ACCOUNT_ID`
   (API Account ID), `DOCUSIGN_PRIVATE_KEY` (PEM, `\n` allowed), `DOCUSIGN_BASE_PATH=https://demo.docusign.net/restapi`.
   The code refuses any non-demo base path, and the OAuth host is hard-coded to `account-d.docusign.com`.
5. Browser env: `VITE_DOCUSIGN_INTEGRATION_KEY` (same integration key, used by the Focused View JS).
6. Connect webhook: set `DOCUSIGN_CONNECT_URL=https://<project>.supabase.co/functions/v1/docusign-connect` and a
   `DOCUSIGN_CONNECT_HMAC_KEY` (Settings → Connect → HMAC keys). Envelopes then carry an envelope-level
   `eventNotification` (JSON, SIM). The webhook rejects calls without a valid `X-DocuSign-Signature-*` header.
7. Run the flow with `ALLOW_DEV_SIMULATIONS=true` (to simulate payment). On the agreement step the app fills the
   template, creates an envelope (buyer + co-owners as embedded signers, signing in order on the same device) and
   mounts **Focused View** (`https://js-d.docusign.com/bundle.js`). If the iframe can't load, it falls back to the
   classic embedded-signing redirect. After the last signer finishes, the page waits for the Connect webhook, then
   continues to portal activation.
8. Embedded (captive) signers don't get DocuSign emails by default. To have DocuSign email the signed copy, enable
   the account setting that sends completed documents to embedded signers (eSignature Admin, signing settings; exact
   setting TBC on the chosen plan).

### Swapping in the real agreement template

Replace `public/templates/agreement-of-sale-PLACEHOLDER.pdf` (or set `AGREEMENT_TEMPLATE_URL`). The contract:

* AcroForm **text fields** named exactly as in the merge-field table below (`npm test` checks the placeholder).
* Signature anchors printed in the document (white text is fine): `/buyer_sign/`, `/buyer_date/`,
  `/coowner1_sign/`, `/coowner1_date/` … up to `coowner3`.

The source of truth is `supabase/functions/_shared/domain/agreement-fields.ts`.

## Field mapping

### Agreement of Sale merge fields

| Template field | Meaning | Captured in |
| --- | --- | --- |
| `agreement_date` | Agreement date | System: date the envelope is created |
| `buyer_full_name` | Buyer full name | Intake › Full name |
| `buyer_dob` | Buyer date of birth | Intake › Date of birth |
| `buyer_id_type` | National ID / Passport | Intake › ID type |
| `buyer_id_country` | ID issuing country | Intake › Issuing country |
| `buyer_id_number` | ID number (normalised) | Intake › ID number |
| `buyer_id_expiry` | ID expiry | Intake › Expiry date |
| `buyer_postal_address` | Postal address | Intake › Postal address |
| `buyer_physical_address` | Physical address | Intake › Residential address |
| `buyer_country` | Country of residence | Intake › Country of residence |
| `buyer_email` | Email | Intake › Email |
| `buyer_phone` | Phone | Intake › Cell phone |
| `co_owners` | Co-owners (name, DOB, ID, email, phone) | Intake › Co-owners |
| `stand_number` | Stand number | Intake › Stand |
| `stand_size` | Size (m²) | Stand inventory `size_sqm` (TBC) |
| `purchase_price` | Price, USD VAT incl. | Stand inventory `price_usd` (TBC) |
| `deposit` | Initial deposit | Stand inventory `deposit_usd` (TBC) |
| `instalment` | Monthly instalment | Computed (price − deposit) / term |
| `term_months` | Term | Campaign config: 48 |
| `payment_reference` | Deposit payment reference | ZikiMall callback |
| `collection_account_id` | Collection Schedule account | Created after payment |
| *(DocuSign tabs)* | Signatures + dates | DocuSign: buyer and each co-owner |

### General Offer Form (September 2025)

| Offer Form item | Captured in |
| --- | --- |
| Purchaser(s) full name(s) (I/We) | Intake › Full name (buyer + each co-owner) |
| D.O.B. | Intake › Date of birth (buyer + co-owners) |
| ID number | Intake › ID type, issuing country, ID number, expiry, photo(s) |
| Residential address | Intake › Residential (physical) address |
| Cell number | Intake › Cell phone |
| Business phone | Offer form › Business phone (optional) |
| Email | Intake › Email |
| Alternative residential / postal address | Intake › Postal address; Offer form › Alternative address |
| Next of kin: name, D.O.B., ID number, residential address, cell | Offer form › Next of kin (required) |
| Next of kin: business phone, email, alternative/postal address | Offer form › Next of kin (optional) |
| Stand number | Intake › Stand (read-only on Offer form) |
| Price (USD) / Initial deposit (USD) | Stand inventory (TBC); Offer form; option to pay deposit in 3 |
| Term in months | 48 (campaign config) |
| Monthly payment (USD) | Computed, shown on Offer form + schedule |
| 6 acknowledgements (USD 500 non-refundable AOS fee to Chigwanda Legal Practitioners; minimum instalment over 48 months; re-allocation after 3 consecutive missed payments; non-refundable on default; AOS fee payment; stamp duty + conveyancing) | Offer form › 6 required checkboxes |
| Signed at (place), date, signature, purchaser name | Offer form › typed or drawn signature |
| Official use (stand confirmation, checked by, signature, date) | Internal lead page only |

## Payment schedule

Monthly instalment = (total price incl. VAT − deposit) / 48. Prices are VAT-inclusive (15.5%, shown as a
breakdown). Everything is computed in cents, and the last deposit part and the last instalment absorb rounding.
The deposit can be paid in 1 or 3 monthly parts. Instalments start the month after the deposit is fully paid
(assumption, TBC), on the configured due day (`CAMPAIGN.dueDay`, currently the 5th, TBC). Stands have no prices yet,
so the app shows clearly labelled **demo figures** (USD 25,000 / 2,500 deposit). See
`supabase/functions/_shared/domain/campaign.ts` and `schedule.ts`.

## ID validation

Every buyer and co-owner gives an ID type (national ID or passport), an ISO issuing country, an ID number, an expiry
date (required for passports, optional for national IDs) and a photo (front and optional back, or the passport data
page). Format checks run in the browser and again in the edge function. **Every ID is then checked by hand by staff.**

Validators live in a pluggable per-country registry (`_shared/domain/id-validation.ts`):

| Rule | Check | Source |
| --- | --- | --- |
| Zimbabwe national ID | `RR-NNNNNN(N) C DD` (2-digit office, 6–7 digit serial, check letter, 2-digit district); check letter = (office+serial as integer) mod 23 → `ZABCDEFGHJKLMNPQRSTVWXY` | Team Pachedu, *2018 Biometric Voters' Roll Analysis*, Appendix 2 ([PDF](https://www.kubatana.net/wp-content/uploads/2018/07/mainreport.pdf)); cross-checked against [identique/idnumbers](https://github.com/identique/idnumbers). **Not an official Registrar-General specification**, so a failed check is a hint for staff, not proof of fraud. |
| South Africa ID | 13 digits `YYMMDD SSSS C A Z`, valid date, citizenship 0/1/2 (2 per recent DHA practice), Luhn check digit | Identification Regulations 1998, reg. 3 ([polity.org.za](https://www.polity.org.za/polity/govdocs/regulations/1998/reg98-0978.html)); [Wikipedia: South African identity card](https://en.wikipedia.org/wiki/South_African_identity_card) |
| Any other country | 4–20 letters/digits after removing spaces, hyphens, slashes and dots | Generic fallback |
| Passport (any country) | 6–9 letters/digits, issuing country required, expiry required and in the future | ICAO Doc 9303 allows up to 9 characters in the document number field |

Add a country by adding a `NationalIdRule` to `NATIONAL_ID_RULES`.

**MRZ reading was skipped on purpose.** Reading the passport MRZ from a phone photo needs OCR first. The usual
browser option (tesseract.js) downloads its language models from a CDN at runtime unless they are self-hosted, and
OCR on phone photos is unreliable. A checksum-only MRZ parser adds little over the manual review. Revisit together
with the automated ID-verification provider.

## Emails (dev mode only)

Seven branded React Email templates (`src/emails/`), one per stage, each with the LakeCity header, a coloured stage
badge, a 7-stage progress tracker, and a "LakeCity Accounts" footer with admin@lakecity.co.zw. All copy is PLACEHOLDER.

| # | Trigger | Subject | Content |
| --- | --- | --- | --- |
| 1 | Intake submitted | We've received your LakeCity application | Thanks, stand number, ID being checked by hand, stand not reserved until deposit, next step |
| 2 | Offer submitted | Your offer to purchase - copy attached | Summary (stand, price, deposit, term, monthly), USD 500 AOS fee note; **offer-to-purchase.pdf** attached |
| 3 | Offer submitted | Your LakeCity payment schedule | First due date, monthly amount, number of instalments, total; **payment-schedule.pdf** attached |
| 4 | Payment confirmed | Deposit received - your stand is reserved | Amount, date, reference; stand reserved and off the market; next step: sign |
| 5 | Agreement signed | Agreement signed - your stand is allocated | Stand allocated; DocuSign emails the signed copy |
| 6 | Agreement signed | Activate your LakeCity customer portal | Portal link, username (email), linked stand + collection account, how to activate. **Never a password.** |
| 7 | Portal activated | Welcome to the LakeCity family | Honesty/integrity/transparency message, statement and payment tracking, "Log in to your portal" |

Email 6 is queued at signing even though the account is created at payment, so the customer gets it when the
wizard asks them to activate, and the 7-stage order holds.

The provider abstraction (`_shared/server/email.ts`) has **stub** adapters for Resend and Google Workspace/Gmail
that throw if called. Every email is written to `email_outbox` (or the in-memory outbox in mock mode) and logged as
metadata only. `emailsLive()` returns true only if `EMAILS_LIVE=true` **and** `EMAIL_PROVIDER`,
`EMAIL_PROVIDER_API_KEY` and `EMAIL_LIVE_APPROVAL_REF` are all set. Even then, nothing is sent until an adapter is
implemented.

**Going live requires Cursor QC PASS plus Alex Key 1 and Key 2 approval.** LakeCity's rule is that staff send
customer comms, so automated sends need an explicit owner decision (open item).

## Importing into Lovable

Create a GitHub repo for this project and push. In Lovable, create a project from that GitHub repo (or connect the
repo to an existing project), then connect Supabase in Lovable and apply `supabase/migrations`. Lovable reads
`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`. Edge functions live in `supabase/functions`. Shared domain
code (`supabase/functions/_shared/domain`) is dependency-free and imported by both the app (`@shared/*`) and
the functions.

## Open items (TBC)

* Real Agreement of Sale template (placeholder in `public/templates/`)
* DocuSign plan / production account (demo only today)
* ZikiMall integration (URL, callback signature, payload) and CBZ settlement
* Stand prices, deposits and sizes (all `null` in `src/data/stands.seed.json`)
* The 3 additional stands (38 seeded)
* Refund / expiry policy if a customer pays but never signs
* Where signed agreements are filed
* Automated ID verification provider (OI number TBC). No official public Zimbabwe Registrar-General verification
  API was found. Commercial options (e.g. Dojah, Smile ID, Didit) need a vendor decision and a data-protection review.
* Payment-schedule PDF layout to match the official schedule template on Drive
* Standard instalment due day (5th vs 1st) and when instalments start when the deposit is split
* Final celebration-page wording (owner's sentence was cut off)
* Owner decision on automated customer emails, and choice of email provider
* StandLedger portal integration (Supabase Auth stands in for portal accounts; collection account ids are mock)
* Final copy, design and legal wording everywhere marked PLACEHOLDER
