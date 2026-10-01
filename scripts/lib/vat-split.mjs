/**
 * Tanaka / ZIMRA inclusive VAT split for portal receipts.
 * VAT = (rate / (100 + rate)) × gross  e.g. (15.5 / 115.5) × receipt.
 * Mirrors odoo .../lakecity_stand_accounting.py::_lakecity_split_gross_payment
 */
export function splitGrossPayment(gross, taxRate = 15.5) {
  const g = Number(gross) || 0;
  if (!Number.isFinite(g) || g === 0) return { net: 0, vat: 0 };
  const rate = Number(taxRate);
  if (!Number.isFinite(rate) || rate === 0) return { net: round2(g), vat: 0 };
  const factor = 1 + rate / 100;
  const net = round2(g / factor);
  const vat = round2(g - net);
  return { net, vat };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
