#!/usr/bin/env python3
"""
Generate Lake City opening-balance journal entries from:
  COLLECTION SCHEDULE - JE for [OPENING BALANCES] (1).xlsx

Methodology: LakeCity Stand Sales JE Walkthrough — tab "02 Initial Contract"
  JE1  Dr Accounts Receivable (121000)           = gross contract (TOTAL PRICE)
       Cr Contract Liabilities (212010)           = net stand value
       Cr Deferred Output VAT (251020)            = VAT component

For Exclusive VAT: net = Column O, VAT = Column P (O + P = TOTAL PRICE).
For Inclusive VAT: net = Column O + Column P, VAT = Column P (sheet Column O is net − VAT).

Then for TOTAL PAID > 0 (Walkthrough steps 03/05):
  Receipt      Dr Bank (101410) / Cr AR
  Revenue/VAT  Dr CL + Deferred VAT / Cr Revenue + VAT Output

Target AR after all entries = Column N (Accounts Receivable).

Usage:
  python3 scripts/generate-opening-balance-jes.py
  python3 scripts/generate-opening-balance-jes.py --output docs/output/LakeCity-Opening-Balance-JEs.xlsx
"""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

import pandas as pd

VAT_RATE = 0.155
TODAY = date.today().isoformat()

ACCOUNTS = {
    "receivable": ("121000", "Accounts Receivable"),
    "contract_liability": ("212010", "Contract Liabilities - Customer Deposits / Instalments"),
    "deferred_vat": ("251020", "Deferred Output VAT"),
    "bank": ("101410", "Bank - CABS USD Main"),
    "revenue": ("401000", "Revenue - Stand Sales"),
    "vat_output": ("251010", "VAT Output - ZIMRA"),
    "inventory_allocated": ("110120", "Inventory - Active Allocated Stands"),
    "inventory_available": ("110110", "Inventory - Residential Stands Available"),
}

DEFAULT_SOURCE = Path(__file__).resolve().parents[1] / "COLLECTION SCHEDULE - JE for [OPENING BALANCES] (1).xlsx"
DEFAULT_INVENTORY = Path(__file__).resolve().parents[1] / "Inventory per Stand  - Costing_26May2026.xlsx"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "docs/output/LakeCity-Opening-Balance-JEs.xlsx"


def parse_money(val) -> float:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace("$", "").replace(",", "").replace(" ", "")
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def norm_stand(val) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    try:
        return str(int(float(val)))
    except (ValueError, TypeError):
        return str(val).strip()


def load_stand_costs(path: Path) -> dict[str, float]:
    if not path.exists():
        return {}
    df = pd.read_excel(path, sheet_name=0, header=0)
    df.columns = [str(c).strip().lower() for c in df.columns]
    stand_col = next((c for c in df.columns if "stand" in c), None)
    cost_col = next((c for c in df.columns if "cost" in c or "total" in c), None)
    if not stand_col or not cost_col:
        return {}
    out: dict[str, float] = {}
    for _, row in df.iterrows():
        stand = norm_stand(row[stand_col])
        cost = parse_money(row[cost_col])
        if stand and cost > 0:
            out[stand] = cost
    return out


def split_payment(gross: float, is_exclusive: bool) -> tuple[float, float]:
    if gross <= 0:
        return 0.0, 0.0
    if is_exclusive:
        net = round(gross / (1 + VAT_RATE), 2)
        vat = round(gross - net, 2)
    else:
        net = round(gross / (1 + VAT_RATE), 2)
        vat = round(gross - net, 2)
    return net, vat


def contract_splits(total_price: float, col_o: float, col_p: float, is_exclusive: bool) -> tuple[float, float, float]:
    gross = total_price
    if is_exclusive:
        contract_liability = col_o if col_o > 0 else round(gross * (1 - VAT_RATE), 2)
        deferred_vat = col_p if col_p > 0 else round(gross * VAT_RATE, 2)
    else:
        deferred_vat = col_p if col_p > 0 else round(gross - gross / (1 + VAT_RATE), 2)
        contract_liability = col_o + col_p if (col_o + col_p) > 0 else round(gross / (1 + VAT_RATE), 2)
    return gross, contract_liability, deferred_vat


def add_line(lines: list[dict], stand: str, customer: str, je_ref: str, purpose: str, move_date: str,
             account_key: str, debit: float, credit: float, narrative: str):
    code, name = ACCOUNTS[account_key]
    if abs(debit) < 0.005 and abs(credit) < 0.005:
        return
    lines.append({
        "Stand Number": stand,
        "Customer": customer,
        "JE Reference": je_ref,
        "Purpose": purpose,
        "Date": move_date,
        "Account Code": code,
        "Account Name": name,
        "Debit": round(debit, 2),
        "Credit": round(credit, 2),
        "Narrative": narrative,
    })


def parse_move_date(raw) -> str:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return TODAY
    if isinstance(raw, pd.Timestamp):
        return raw.strftime("%Y-%m-%d")
    if hasattr(raw, "strftime"):
        return raw.strftime("%Y-%m-%d")
    text = str(raw).strip()
    if not text:
        return TODAY
    text = text.replace("I ", "1 ").replace("l ", "1 ")
    try:
        return pd.to_datetime(text).strftime("%Y-%m-%d")
    except Exception:
        return TODAY


def build_rows(source: Path, inventory_path: Path) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    df = pd.read_excel(source, sheet_name="Collection Schedule - 36mo", header=0)
    df.columns = [str(c).strip() for c in df.columns]
    stand_costs = load_stand_costs(inventory_path)

    je_lines: list[dict] = []
    summary_rows: list[dict] = []

    for _, row in df.iterrows():
        stand = norm_stand(row.get("Stand Number"))
        if not stand:
            continue

        ar_target = parse_money(row.get("Accounts Receivable"))
        if ar_target <= 0:
            continue

        total_price = parse_money(row.get("TOTAL PRICE"))
        total_paid = parse_money(row.get("TOTAL PAID"))
        deposit = parse_money(row.get("Deposit"))
        col_o = parse_money(row.get("Contract Liabilities"))
        col_p = parse_money(row.get("VAT"))
        vat_type = str(row.get("Agreement Type (VAT)", "") or "").strip()
        is_exclusive = "exclusive" in vat_type.lower()
        customer = f"{row.get('First Name', '')} {row.get('Last Name', '')}".strip() or f"Stand {stand}"
        move_date = parse_move_date(row.get("START DATE"))

        gross, contract_liability, deferred_vat = contract_splits(total_price, col_o, col_p, is_exclusive)
        je_ref = f"OB-{stand}-Initial"

        add_line(je_lines, stand, customer, je_ref, "JE1 Initial contract", move_date,
                 "receivable", gross, 0, f"Recognize gross stand contract receivable — stand {stand}")
        add_line(je_lines, stand, customer, je_ref, "JE1 Initial contract", move_date,
                 "contract_liability", 0, contract_liability,
                 "Recognize net stand value as contract liability")
        add_line(je_lines, stand, customer, je_ref, "JE1 Initial contract", move_date,
                 "deferred_vat", 0, deferred_vat,
                 "Recognize VAT component not yet due to ZIMRA")

        if total_paid > 0:
            pay_ref = f"OB-{stand}-Receipt"
            add_line(je_lines, stand, customer, pay_ref, "Receipt (deposit/instalments)", move_date,
                     "bank", total_paid, 0, f"Cash receipt — opening balance stand {stand}")
            add_line(je_lines, stand, customer, pay_ref, "Receipt (deposit/instalments)", move_date,
                     "receivable", 0, total_paid, f"Clear receivable — opening balance stand {stand}")

            pay_net, pay_vat = split_payment(total_paid, is_exclusive)
            rev_ref = f"OB-{stand}-RevenueVAT"
            add_line(je_lines, stand, customer, rev_ref, "Revenue/VAT release", move_date,
                     "contract_liability", pay_net, 0, f"Release contract liability — stand {stand}")
            add_line(je_lines, stand, customer, rev_ref, "Revenue/VAT release", move_date,
                     "deferred_vat", pay_vat, 0, f"Release deferred VAT — stand {stand}")
            add_line(je_lines, stand, customer, rev_ref, "Revenue/VAT release", move_date,
                     "revenue", 0, pay_net, f"Recognize revenue — stand {stand}")
            add_line(je_lines, stand, customer, rev_ref, "Revenue/VAT release", move_date,
                     "vat_output", 0, pay_vat, f"VAT due to ZIMRA — stand {stand}")

        stand_cost = stand_costs.get(stand, 0.0)
        if stand_cost > 0:
            inv_ref = f"OB-{stand}-Inventory"
            add_line(je_lines, stand, customer, inv_ref, "JE2 Inventory reclass (optional)", move_date,
                     "inventory_allocated", stand_cost, 0,
                     f"Optional balance sheet reclass at stand cost — stand {stand}")
            add_line(je_lines, stand, customer, inv_ref, "JE2 Inventory reclass (optional)", move_date,
                     "inventory_available", 0, stand_cost,
                     f"Optional balance sheet reclass at stand cost — stand {stand}")

        implied_ar = round(gross - total_paid, 2)
        summary_rows.append({
            "Stand Number": stand,
            "Customer": customer,
            "VAT Type": vat_type,
            "TOTAL PRICE": total_price,
            "Deposit": deposit,
            "TOTAL PAID": total_paid,
            "Column N — Accounts Receivable": ar_target,
            "Column O — Contract Liabilities": col_o,
            "Column P — VAT (Deferred Output VAT)": col_p,
            "JE1 Dr AR (gross)": gross,
            "JE1 Cr Contract Liability (net)": contract_liability,
            "JE1 Cr Deferred Output VAT": deferred_vat,
            "Implied AR after payments": implied_ar,
            "AR check (N vs implied)": round(ar_target - implied_ar, 2),
            "Stand cost (optional JE2)": stand_cost,
            "Move date": move_date,
        })

    lines_df = pd.DataFrame(je_lines)
    summary_df = pd.DataFrame(summary_rows)

    control_rows = [{
        "Metric": "Contracts with opening AR",
        "Value": len(summary_df),
    }, {
        "Metric": "Total Column N — Accounts Receivable",
        "Value": round(summary_df["Column N — Accounts Receivable"].sum(), 2),
    }, {
        "Metric": "Total JE1 Dr AR",
        "Value": round(summary_df["JE1 Dr AR (gross)"].sum(), 2),
    }, {
        "Metric": "Total JE1 Cr Contract Liability",
        "Value": round(summary_df["JE1 Cr Contract Liability (net)"].sum(), 2),
    }, {
        "Metric": "Total JE1 Cr Deferred Output VAT",
        "Value": round(summary_df["JE1 Cr Deferred Output VAT"].sum(), 2),
    }, {
        "Metric": "Total receipts (TOTAL PAID)",
        "Value": round(summary_df["TOTAL PAID"].sum(), 2),
    }, {
        "Metric": "AR mismatches (should be 0)",
        "Value": int((summary_df["AR check (N vs implied)"].abs() > 0.02).sum()),
    }]
    control_df = pd.DataFrame(control_rows)
    return lines_df, summary_df, control_df


def main():
    parser = argparse.ArgumentParser(description="Generate Lake City opening balance JE workbook")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--inventory", type=Path, default=DEFAULT_INVENTORY)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    if not args.source.exists():
        raise SystemExit(f"Source workbook not found: {args.source}")

    lines_df, summary_df, control_df = build_rows(args.source, args.inventory)
    args.output.parent.mkdir(parents=True, exist_ok=True)

    with pd.ExcelWriter(args.output, engine="openpyxl") as writer:
        lines_df.to_excel(writer, sheet_name="Journal Entry Lines", index=False)
        summary_df.to_excel(writer, sheet_name="Summary by Stand", index=False)
        control_df.to_excel(writer, sheet_name="Control Totals", index=False)

        readme = pd.DataFrame([
            ["Lake City Opening Balance Journal Entries"],
            [f"Generated: {TODAY}"],
            [""],
            ["Source", str(args.source.name)],
            ["Methodology", 'Walkthrough tab "02 Initial Contract" + payment receipt/revenue steps'],
            [""],
            ["Account mapping"],
            ["121000", "Accounts Receivable — per stand (partner = customer)"],
            ["212010", "Contract Liabilities - Customer Deposits / Instalments — Column O (Exclusive) or O+P (Inclusive)"],
            ["251020", "Deferred Output VAT — Column P"],
            ["101410", "Bank — opening receipts (TOTAL PAID)"],
            ["401000 / 251010", "Revenue / VAT Output — released on TOTAL PAID"],
            [""],
            ["Target AR balance after all JEs = Column N Accounts Receivable"],
        ])
        readme.to_excel(writer, sheet_name="README", index=False, header=False)

    print(f"Wrote {len(summary_df)} stands / {len(lines_df)} JE lines → {args.output}")
    mismatches = (summary_df["AR check (N vs implied)"].abs() > 0.02).sum()
    if mismatches:
        print(f"WARNING: {mismatches} AR mismatches — review Summary by Stand")
    else:
        print("AR control check: all stands balance (Column N = gross − TOTAL PAID)")


if __name__ == "__main__":
    main()
