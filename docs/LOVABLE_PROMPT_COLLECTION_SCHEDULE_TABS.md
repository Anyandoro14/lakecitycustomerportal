# Lovable prompt: Collection Schedule tab naming

Use this verbatim when syncing the Lovable frontend with backend behavior.

---

**Context:** The Google Sheet workbook uses one tab per **installment term length** (in months). Tab names are standardized. Edge Functions resolve **exactly one** tab per customer using `profiles.payment_plan_months` (default **36**). No UI copy should mention internal tab names to end customers unless it is internal/admin-only documentation.

**Canonical tab name pattern (strict):**

`Collection Schedule - {N} Months`

- Example: `Collection Schedule - 36 Months` (this replaces the old **Collection Schedule 1** for the main Richcraft cohort).
- `{N}` is a positive integer (12, 24, 36, 48, 60, 72, 84, 96, 120, etc.).
- Spacing and capitalization matter: `Collection Schedule - ` then digits then ` Months`.

**Legacy:** Until the sheet is renamed, **`Collection Schedule 1`** is still accepted by the backend as the 36‑month tab. Do not show this legacy name to customers; internal docs may mention it once as “rename to `Collection Schedule - 36 Months`”.

**Frontend tasks:**

1. **Docs / internal** (`DocsSheets` or equivalent): Document the pattern above and that each tab holds all customers on that **term length**. Remove references to `Group Name - YYYY-MM-DD` tab names if that was documented earlier—**group/cohort naming is not the tab title**; the tab title is **only** `Collection Schedule - N Months`.

2. **`src/lib/collection-schedule.ts`:** Export `collectionScheduleTabName(months)`, `parseCollectionScheduleTabMonths(title)`, `isValidCollectionTabName(title)`, and `TAB_NAME_ERROR` aligned with the regex above (this file may already exist—update to match).

3. **Sign-up:** `validate-signup` returns `paymentPlanMonths`. `register-user` accepts `paymentPlanMonths` and persists to `profiles.payment_plan_months`. Ensure the signup flow passes `paymentPlanMonths` from validation into registration (no visible change for the user).

4. **Admin tools:** Any dropdown or validator for sheet tabs should list tabs matching `Collection Schedule - N Months` (plus optional legacy `Collection Schedule 1`).

5. **Do not** change login routes, customer dashboard layout, or branding. Customers should see **no** change in labels unless you already expose “Collection Schedule” in customer-facing text—keep those generic (“your payment schedule”).

---

**Out of scope for Lovable:** Deploying DB migration `payment_plan_months`, renaming tabs in Google Sheets, or setting Supabase secrets. Those are operator tasks.

---

## Pre-publish from Lovable (operator checklist)

Do these **before** you publish the Lovable build to production:

1. **Rename the legacy tab in Google Sheets:** `Collection Schedule 1` → `Collection Schedule - 36 Months` (code still accepts the old name, but the workbook should match the canonical pattern before go-live). Use `npm run sheet:rename-collection-schedule-tab` with `.env` containing `SPREADSHEET_ID` and `GOOGLE_SERVICE_ACCOUNT_KEY`, or rename manually in the Sheet UI.
2. **Database:** Apply migration `supabase/migrations/20260408120000_profiles_payment_plan_months.sql` (Supabase SQL editor or `supabase db push` after link) so `profiles.payment_plan_months` exists and nulls are backfilled to **36**.
3. **Edge Functions:** Deploy functions to the linked project (`npm run supabase:deploy-functions` or `bash scripts/deploy-supabase-functions.sh`) so tab resolution and multi-tab behavior match the repo.
