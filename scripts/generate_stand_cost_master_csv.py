#!/usr/bin/env python3
"""Generate Odoo stand cost master CSV from the authoritative inventory costing workbook."""
from __future__ import annotations

import csv
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DEFAULT_XLSX = REPO / "docs/stand-inventory-costing/Inventory_per_Stand_Costing_26May2026.xlsx"
DEFAULT_CSV = (
    REPO / "odoo/addons/lakecity_loan_management/data/lakecity_stand_cost_master.csv"
)


def normalize_stand_number(raw: str) -> str:
    s = str(raw or "").strip().upper()
    if not s or s in ("-", ""):
        return ""
    try:
        f = float(s)
        if f == int(f):
            return str(int(f))
    except ValueError:
        pass
    return s


def read_xlsx_rows(path: Path) -> list[dict[str, str]]:
    with zipfile.ZipFile(path) as z:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            for si in root.findall(".//m:si", ns):
                texts = [t.text or "" for t in si.findall(".//m:t", ns)]
                shared.append("".join(texts))

        sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
        ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        out: list[dict[str, str]] = []
        for row in sheet.findall(".//m:row", ns):
            cells: dict[str, str] = {}
            for c in row.findall("m:c", ns):
                ref = c.get("r", "")
                col = "".join(ch for ch in ref if ch.isalpha())
                t = c.get("t")
                v = c.find("m:v", ns)
                val = v.text if v is not None else ""
                if t == "s" and val:
                    val = shared[int(val)]
                cells[col] = val
            if cells.get("A") == "Stand Number":
                continue
            stand = normalize_stand_number(cells.get("A", ""))
            phase = str(cells.get("B", "") or "").strip().upper()
            if not stand or not phase:
                continue
            out.append(
                {
                    "stand_number": stand,
                    "phase": phase,
                    "area_sqm": cells.get("C", "") or "0",
                    "cost_per_sqm": cells.get("D", "") or "0",
                    "total_cost": cells.get("E", "") or "0",
                }
            )
        return out


def main() -> int:
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    csv_path = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_CSV
    if not xlsx.is_file():
        print(f"Missing workbook: {xlsx}", file=sys.stderr)
        return 1

    rows = read_xlsx_rows(xlsx)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=["stand_number", "phase", "area_sqm", "cost_per_sqm", "total_cost"],
        )
        writer.writeheader()
        writer.writerows(rows)

    phases = sorted({r["phase"] for r in rows})
    print(f"Wrote {len(rows)} stand cost rows to {csv_path}")
    print(f"Phases ({len(phases)}): {', '.join(phases)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
