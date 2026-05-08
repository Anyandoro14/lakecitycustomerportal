# Import historical Collection Schedule into Odoo

Loads every paid receipt and active stand from the legacy spreadsheet into the new `lakecity.collection.schedule` records. After this step Odoo holds the full historical truth and is ready to take over.

> **Time required**: 30–60 minutes depending on number of tabs (one import run per term length / tab).

> **Prerequisite**: Step 1 snapshot is complete and per-tab `.xlsx` files are staged in `/tmp/lake-city-snapshot/`. Step 2 confirmed the addon installs cleanly and you ran the synthetic-stand smoke test.

## 1. Prepare the per-tab files

The wizard at [`odoo/addons/lakecity_crm/wizards/import_schedule_wizard.py`](../../odoo/addons/lakecity_crm/wizards/import_schedule_wizard.py) takes one `Collection_Schedule_Template_*.xlsx`-style file per run. The original Google spreadsheet has multiple tabs, one per term length (12/24/36/.../120 months). Each tab needs to be exported to its own `.xlsx`.

Two ways:

### Option A — auto-split via gspread (recommended)

```bash
cd ~/lakecitycustomerportal
source .venv-xlsx/bin/activate   # or python -m venv .venv-xlsx; source ...; pip install gspread openpyxl

python - <<'PY'
import os
import gspread
from openpyxl import Workbook
from openpyxl.utils import get_column_letter

SHEET_ID = os.environ["COLLECTION_SCHEDULE_SHEET_ID"]
OUT = "/tmp/lake-city-snapshot"
os.makedirs(OUT, exist_ok=True)

gc = gspread.service_account()        # uses ~/.config/gspread/service_account.json
sh = gc.open_by_key(SHEET_ID)

for ws in sh.worksheets():
    if ws.title.lower() in {"instructions", "internal tester"}:
        continue
    rows = ws.get_all_values()
    if not rows:
        continue
    wb = Workbook()
    out_ws = wb.active
    out_ws.title = ws.title[:31]
    for r, row in enumerate(rows, start=1):
        for c, val in enumerate(row, start=1):
            out_ws.cell(row=r, column=c, value=val)
    fname = f"Collection_Schedule_Template_{ws.title.replace(' ', '_')}.xlsx"
    wb.save(os.path.join(OUT, fname))
    print(f"  wrote {fname}")
PY
```

### Option B — manual download

In the Google Sheet, for each tab:
1. Right-click the tab → **Copy to** → **New spreadsheet**.
2. Open the copy → File → Download → Microsoft Excel (.xlsx).
3. Save into `/tmp/lake-city-snapshot/` named `Collection_Schedule_Template_<term>mo.xlsx`.

## 2. Run the wizard, one tab at a time

In production Odoo:

1. **Lakecity → Configuration → Import from XLSX**.
2. Click **Choose File** → select `/tmp/lake-city-snapshot/Collection_Schedule_Template_12mo.xlsx`.
3. Term Override: leave on **Auto-detect** unless the wizard fails to recognise the file.
4. Customer Category Override: leave blank (the wizard reads the category from the spreadsheet column).
5. Click **Import**.
6. The wizard returns a notification with counts: `Created N, Updated M, Skipped K`.
7. If `Skipped > 0`, expand the wizard log (Settings → Technical → Logging → search "lakecity_crm") to see which rows were skipped and why.

Repeat for each tab (`24mo`, `36mo`, `48mo`, `60mo`, `72mo`, `84mo`, `96mo`, `120mo`).

The wizard is **idempotent** on `stand_number` — if you import the same file twice, it updates the existing records rather than duplicating.

## 3. Spot-check 10 stands

Pick 10 stands at random across multiple term lengths. For each, compare the Odoo record to the spreadsheet:

```bash
# Generate a random sample of 10 stands from the spreadsheet snapshot
python scripts/cutover/sample-stands-for-spotcheck.py \
  /tmp/lake-city-snapshot/ \
  > /tmp/spot-check-list.txt
cat /tmp/spot-check-list.txt
```

For each stand in the list:

1. Open Odoo → **Lakecity → Collection Schedules** → search by stand number.
2. Open the spreadsheet snapshot → find the same stand.
3. Compare:
   - Customer name
   - Sale price
   - Term months
   - Start date
   - Total paid (sum of monthly cells with values)
   - Current balance (sale price − total paid)
   - Number of payment lines

If any of those don't match for any stand, **stop the cutover** and investigate. Likely causes:

- Stand has off-cycle payment dates that the Day-5 constraint rejected → relax the constraint via a one-time addon hotfix.
- Customer category in spreadsheet is unmapped → add the value to `CATEGORY_MAP` in the wizard.
- Spreadsheet has merged cells / empty rows that confuse the parser → re-export the tab cleanly.

## 4. Compare the Odoo PDF to the spreadsheet PDF

The addon generates a printable Collection Schedule PDF that mirrors the spreadsheet layout exactly:

1. In Odoo, open one of the spot-checked stands.
2. **Print → Collection Schedule** → download the PDF.
3. Print the same stand from the spreadsheet (File → Print → Save as PDF).
4. Side-by-side compare every visible figure. They must be identical.

## 5. Reconciliation query

After all tabs are imported, run this query in Odoo's developer mode (Settings → Technical → ORM Query, or via XML-RPC):

```python
# Total schedules and total payment lines
env['lakecity.collection.schedule'].search_count([])
env['lakecity.collection.payment'].search_count([])

# Total paid across all stands (sum of payment.amount where state='paid')
sum(env['lakecity.collection.payment'].read_group(
  [('state', '=', 'paid')], ['amount:sum'], []
)[0]['amount'] or [0])
```

Compare the totals against your spreadsheet snapshot's grand totals. They should match within rounding (≤ $1 per 1000 rows).

## 6. Sign-off

- [ ] All term-length tabs imported via the wizard.
- [ ] No `Skipped` rows, or skipped rows reviewed and accepted.
- [ ] 10-stand spot check passed on every dimension.
- [ ] Side-by-side PDF compare passed for at least 3 stands.
- [ ] Grand-total reconciliation query matches spreadsheet within rounding.

Proceed to [06-reverse-sync.md](06-reverse-sync.md).
