# Lake City stand inventory & development costing

Authoritative registers for stand inventory, per-stand development cost, and the ZIMRA-aligned stand sales journal entry model.

## Source of truth

| File | Role |
|------|------|
| [Inventory_per_Stand_Costing_26May2026.xlsx](./Inventory_per_Stand_Costing_26May2026.xlsx) | **Conclusive list of all stands** and development cost (Area, Cost/sqm, Total Cost). Column **Phase** is the project phase for each stand. |
| [LakeCity_Stand_Sales_JE_Walkthrough.xlsx](./LakeCity_Stand_Sales_JE_Walkthrough.xlsx) | Operational accounting walkthrough: revenue/VAT release, proportional cost of sales, forfeiture, and cancellation entries per payment. |

## Odoo integration

The **Lakecity BNPL Loan Management** addon loads stand costs from `data/lakecity_stand_cost_master.csv`, which is generated from the inventory workbook:

```bash
python3 scripts/generate_stand_cost_master_csv.py
```

After updating the Excel, regenerate the CSV and upgrade the Odoo module.

### Phase reporting

Each stand cost row carries a **Phase** (`lakecity.stand.phase`). That phase is stamped on:

- `product.template` (stand product)
- `lakecity.loan.contract` (BNPL contract / stand cost for COS)
- `account.move` and `account.move.line` (GL entries from the stand sales walkthrough)

Use **Accounting → Reporting → Stand sales by phase** (pivot on journal items) to analyse revenue, cost of sales, and profit by project phase.

## Regeneration

When the inventory workbook changes:

1. Replace `Inventory_per_Stand_Costing_26May2026.xlsx` in this folder.
2. Run `python3 scripts/generate_stand_cost_master_csv.py`.
3. Commit the workbook, CSV, and bump the Odoo module if schema changes.
