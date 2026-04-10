# Lovable prompt: Payment schedule templates & instructions (copy below)

Copy everything inside the fenced block into Lovable as your task prompt.

---

```
## Goal

Align the app and internal documentation with how **Excel payment schedule templates** are maintained in the repo: each template workbook contains **only** the data sheet named like `Collection Schedule - {N}mo`. **Operator instructions are not** embedded as a separate tab inside those `.xlsx` files anymore—they live in **one standalone markdown document** in the repository.

## Shared calendar grid (must match repo templates)

All checked-in templates under **`docs/payment-schedule-templates/Payment Schedules - Customer Portal/`** use the **same** monthly header row—this is **not** the same as “N monthly columns for an N‑month term.”

- **First month column (M):** **`5 January 2022`**
- **Last month column (FX):** **`5 December 2035`**
- **Count:** **168** calendar month columns (**M** through **FX**)
- **After FX:** **Next Payment Column** (FY), then **TOTAL PAID** (FZ), **Current Balance**, **Payment Progress**, then operational columns (Receipts … Registered)
- **Column J** on each row = **number of instalments / contract term** (12–120) for that **file** (`Collection_Schedule_Template_48mo.xlsx` means **term 48**, not “48 columns”—avoid that confusion in UI copy)
- **Column L** = each customer’s **payment start date** (any qualifying 5th within the grid)

Formulas in templates: **TOTAL PAID** = Deposit + **SUM(M:FX)** (monthly amounts only). Backend code **clamps** reads to the column before **Next Payment** so long `payment_plan_months` values do not overrun the physical grid.

If internal docs still mention **48 columns**, **BH**, **Dec 2025**, or **BJ** for totals, **update them** to **168**, **FX**, **Dec 2035**, **FZ** respectively.

## Naming convention (must be understood everywhere)

The **canonical** tab/sheet title for a Collection Schedule is:

**`Collection Schedule - {N}mo`**

- **`{N}`** is the instalment term in **months** as digits only (no commas, no “months” word in the title).
- **`mo`** is literal, **lowercase**—not “MO”, not “Mo”, not “month” or “months”.
- There is a **single space** after each hyphen: `Collection Schedule - ` then `{N}` then `mo` with **no space** between the number and `mo`.

**Concrete examples (copy-paste shape):**

- `Collection Schedule - 36mo` — thirty-six month term  
- `Collection Schedule - 120mo` — one hundred twenty month term (this exact string is the correct form for the 120‑month template; do not use `Collection Schedule - 120 months` as the canonical name)

**Wrong shapes to avoid in new copy and validators:** `CollectionSchedule-120mo` (missing spaces), `Collection Schedule - 120 MO` (wrong case), `Collection Schedule - 120 mo` (space before `mo`), `120mo Collection Schedule` (word order).

Internal docs, admin tools, and helpers must treat **`Collection Schedule - 120mo`** and the same pattern for other terms (12, 24, 36, …) as the **standard**; legacy tab names (`Collection Schedule 1`, `Collection Schedule - N Months`) may still be mentioned only as “accepted until renamed,” not as the preferred convention.

## Date formats (human-readable and unambiguous)

The repo already uses **date-fns** in many places; keep **new** UI and docs consistent and fix spots that are hard to read or locale-dependent.

1. **Avoid in visible labels**
   - Raw **ISO-8601** strings (`2026-04-05T12:00:00.000Z`).
   - **Numeric-only** locale forms that read like `04/05/2026` or `05/04/2026` (ambiguous **MM/DD** vs **DD/MM**). Prefer a **named month**.

2. **Preferred patterns (match existing components)**
   - **Dates:** `format(date, "d MMM yyyy")` → e.g. **`5 Apr 2026`** (used in `AccountManagement`, `Updates`, `TimelinePanel`).
   - **Long form where space allows:** `d MMMM yyyy` → **`5 April 2026`** (articles).
   - **Month-only periods:** `MMMM yyyy` / `MMM yyyy` (see `MonthlyStatements`).
   - **With time:** `d MMM yyyy, HH:mm` or `MMM d, h:mm a`—stay consistent within each screen.
   - Parse string inputs with **`parseISO`** from date-fns when the value is an ISO date string.

3. **Locale**
   - Do **not** use bare `toLocaleDateString()` with **no options** in user-facing tables—it follows the **browser** locale and looks inconsistent next to date-fns.
   - If you use `toLocaleDateString`, pass an explicit locale and **long** or **short month** options, or switch that call site to **date-fns** `format` with an explicit pattern.

4. **Documentation / markdown**
   - In prose, prefer **5 April 2026** or **Apr 5, 2026** over slash-numeric forms.
   - Reserve **`YYYY-MM-DD`** for technical examples (APIs, migrations, filenames); say “ISO date” if readers need to distinguish it from display copy.

5. **Audit when touching dates**
   - Search for `toLocaleDateString()` without a second argument, `month: '2-digit', day: '2-digit'` (numeric-only), and raw `{dateString}` from APIs in JSX—normalize to **`d MMM yyyy`** (or the patterns above) unless there is a strong reason not to.

## Source of truth (do not contradict)

- **Canonical operator instructions (markdown):** `docs/payment-schedule-templates/COLLECTION_SCHEDULE_TEMPLATE_INSTRUCTIONS.md` (path is under `payment-schedule-templates/`, not repo root—do not duplicate at root unless the app’s docs router requires it).
- **BNPL ledger rules (formulas, columns, widening):** `docs/payment-schedule-templates/BNPL_SCHEDULE_SPEC.md`
- **Template folder README:** `docs/payment-schedule-templates/README.md`
- **Archive folders:** `docs/payment-schedule-templates/Payment-Schedules-Customer-Portal-fixed-20260407*` are **deprecated snapshots**. Their `README.md` files must **only** point to the canonical paths above—not claim **`TEMPLATE_INSTRUCTIONS`** tabs or old tab-naming (`Group - YYYY-MM-DD`) as current.
- **Backend behavior:** Edge Functions treat `TEMPLATE_INSTRUCTIONS` as a non–data tab and skip it when resolving Collection Schedule tabs (see `supabase/functions/_shared/collection-schedule-sheets.ts`). No customer-facing change is required for that.

## Deno Edge Functions (imports)

- **`supabase/functions/send-platform-report/index.ts`:** import Resend as  
  `import { Resend } from "https://esm.sh/resend@2.0.0";`  
  (not `npm:resend@…` if your deploy/build rejects npm specifiers).

## What to update in the Lovable / frontend codebase

1. **Search and fix copy**  
   Search the project for any text that says Excel templates include a sheet/tab named **`TEMPLATE_INSTRUCTIONS`**, an **“instructions”** tab inside the workbook, or similar. Replace with language that:
   - States each template file has **one** sheet: **`Collection Schedule - {N}mo`** (matching term length).
   - Points operators to **external** documentation for setup (see paths below—not necessarily exposed to end customers).

2. **Internal / docs routes** (e.g. `DocsSheets`, `DocsDataModels`, `DocsGlossary`, `DocsQuickstart`, technical spec pages, internal admin help)  
   - **`DocsSheets`:** include explicit subsections **Monthly calendar grid** (M–FX, Jan 2022–Dec 2035, FY/FZ) and **Template setup** pointing at `docs/payment-schedule-templates/COLLECTION_SCHEDULE_TEMPLATE_INSTRUCTIONS.md`; include a **120mo** tab-name example (`Collection Schedule - 120mo`) as term vs grid width.  
   - **`DocsDataModels`:** **Template setup** paragraph + **Column J** described as term months; fix any lingering **M–AW** to **M–FX** in business rules.  
   - **`DocsGlossary`:** entries for **Monthly columns (M–FX)**, **Collection Schedule tab name**, **Template instructions (operators)**; date examples use **named-month** style (e.g. `5 Sep 2025`), not ambiguous `MM/DD/YYYY`.  
   - Remove or rewrite any bullet that implies **in-file** instructions tabs in Excel.

3. **Customer-facing surfaces**  
   - **Do not** expose raw repo paths or internal tab names to logged-in customers unless you already do so for other ops docs.  
   - Keep customer language generic (“payment schedule”, “your plan”) unless the page is clearly **internal-only** or **admin**.

4. **Tab naming (unchanged, but keep consistent)**  
   - Master Google Sheet tabs for data must follow **`Collection Schedule - {N}mo`**, including long terms—e.g. **`Collection Schedule - 120mo`** for the 120‑month workbook/tab (legacy forms may still exist; internal docs may mention rename once).  
   - When you show examples in UI or docs, prefer **at least one** concrete string such as **`Collection Schedule - 120mo`** so the convention is unmistakable.  
   - If you maintain helpers like `collection-schedule.ts`, keep regex/helpers aligned with existing backend behavior—**do not** treat `TEMPLATE_INSTRUCTIONS` as a Collection Schedule data tab.

5. **Date display (readability)**  
   - Apply the **Date formats** section above: align any new or broken date rendering with **`date-fns`** and named-month patterns; remove ambiguous numeric-only displays.  
   - **Admin tables (e.g. `QcQueue.tsx`):** prefer `parseISO` + `format(..., "d MMM yyyy")` with a fallback if the string is not ISO.

6. **Out of scope**  
   - Do not modify Supabase Edge Functions or migrations for this task unless you find a **bug** caused by the docs change (unlikely).  
   - Do not re-add an instructions sheet to Excel files from the app—that is a repo/ops process (`remove_template_instructions_sheet.py`, templates under `docs/payment-schedule-templates/Payment Schedules - Customer Portal/`).

## Acceptance criteria

- No UI or internal doc claims that each `.xlsx` template includes a **`TEMPLATE_INSTRUCTIONS`** (or equivalent) sheet.  
- Operators have a **single** documented place for template setup (reference to `COLLECTION_SCHEDULE_TEMPLATE_INSTRUCTIONS.md` or equivalent docs section).  
- Collection Schedule tab naming docs and examples are accurate and consistent with **`Collection Schedule - {N}mo`**, including a clear example such as **`Collection Schedule - 120mo`** where a long term is illustrated.  
- **Calendar strip:** Internal/admin docs that describe the Excel grid state **Jan 2022 – Dec 2035**, **M–FX**, **168** month columns, and **FY/FZ** for Next / TOTAL PAID (or describe generically as “through Dec 2035” without wrong column letters).  
- **Dates:** No new ambiguous or raw-ISO date strings in UI copy; date pickers and tables use readable **named-month** formats consistent with **`d MMM yyyy`** (or the other approved patterns in the Date formats section).  
- Build passes; no broken links on docs pages you touched.

## Related prompt

For **tab naming** and signup/`payment_plan_months` alignment, see `docs/LOVABLE_PROMPT_COLLECTION_SCHEDULE_TABS.md` in the same repo.
```

---

## How to use

1. Paste the **contents of the fenced block** (without the outer ``` markers) into Lovable.  
2. If Lovable cannot read repo files, attach or paste **`COLLECTION_SCHEDULE_TEMPLATE_INSTRUCTIONS.md`**, **`README.md`**, and **`BNPL_SCHEDULE_SPEC.md`** from `docs/payment-schedule-templates/` as context.  
3. After the Lovable pass, search for stale grid references (**BH**, **BJ**, **Dec 2025**, **48 columns** as the calendar width), **“TEMPLATE_INSTRUCTIONS”**, **“instructions tab”**, and date anti-patterns: **`toLocaleDateString()`** with no args, **`month: '2-digit'`** with **`day: '2-digit'`** (numeric-only), and raw ISO timestamps in JSX.
