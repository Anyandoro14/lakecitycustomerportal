# Lovable prompt: Collection Schedule tab naming

Use this verbatim when syncing the Lovable frontend with backend behavior.

---

**Context:** The Google Sheet workbook uses one tab per **installment term length** (in months). Tab names are standardized. Edge Functions resolve **exactly one** tab per customer using `profiles.payment_plan_months` (default **36**). No UI copy should mention internal tab names to end customers unless it is internal/admin-only documentation.

**Canonical tab name pattern (strict):**

`Collection Schedule - {N}mo`

- Example: `Collection Schedule - 36mo` (this replaces the old **Collection Schedule 1** for the main Richcraft cohort).
- `{N}` is a positive integer (12, 24, 36, 48, 60, 72, 84, 96, 120, etc.).
- Spacing and capitalization matter: `Collection Schedule - ` then digits then `mo` (lowercase **mo**).

**Legacy (still accepted by the backend):**

- `Collection Schedule - {N} Months` (transition from the previous naming).
- `Collection Schedule 1` as the 36‑month tab until renamed.

Do not show legacy names to customers; internal docs may mention them once as “rename to `Collection Schedule - 36mo`”.

**Frontend tasks:**

1. **Docs / internal** (`DocsSheets` or equivalent): Document the pattern above and that each tab holds all customers on that **term length**. Remove references to `Group Name - YYYY-MM-DD` tab names if that was documented earlier—**group/cohort naming is not the tab title**; the tab title is **only** `Collection Schedule - Nmo` (plus legacy forms above).

2. **`src/lib/collection-schedule.ts`:** Export `collectionScheduleTabName(months)`, `parseCollectionScheduleTabMonths(title)`, `isValidCollectionTabName(title)`, and `TAB_NAME_ERROR` aligned with the regex above (this file may already exist—update to match).

3. **Sign-up:** `validate-signup` returns `paymentPlanMonths`. `register-user` accepts `paymentPlanMonths` and persists to `profiles.payment_plan_months`. Ensure the signup flow passes `paymentPlanMonths` from validation into registration (no visible change for the user).

4. **Admin tools:** Any dropdown or validator for sheet tabs should list tabs matching `Collection Schedule - Nmo` (plus legacy `Collection Schedule - N Months` and optional `Collection Schedule 1`).

5. **Do not** change login routes, customer dashboard layout, or branding. Customers should see **no** change in labels unless you already expose “Collection Schedule” in customer-facing text—keep those generic (“your payment schedule”).

---

**Out of scope for Lovable:** Deploying DB migration `payment_plan_months`, renaming tabs in Google Sheets, or setting Supabase secrets. Those are operator tasks.

---

## Pre-publish from Lovable (operator checklist)

Do these **before** you publish the Lovable build to production:

1. **Rename the legacy tab in Google Sheets:** `Collection Schedule 1` → `Collection Schedule - 36mo` (code still accepts the old names, but the workbook should match the canonical pattern before go-live). Use `npm run sheet:rename-collection-schedule-tab` with `.env` containing `SPREADSHEET_ID` and `GOOGLE_SERVICE_ACCOUNT_KEY`, or rename manually in the Sheet UI.
2. **Database:** If your database is managed inside **Lovable Cloud**, apply schema changes through Lovable’s documented SQL/migration workflow (e.g. migrations under `supabase/migrations/` such as `20260408120000_profiles_payment_plan_months.sql` when relevant). Use standalone Supabase CLI (`supabase db push`) only if you operate a separate Supabase project.
3. **Edge Functions:** On **Lovable Cloud**, deploy or sync functions via Lovable’s dashboard. Use `bash scripts/deploy-supabase-functions.sh` only when deploying to a **self-hosted** Supabase project (this repo does not expose an npm script for that by default).
