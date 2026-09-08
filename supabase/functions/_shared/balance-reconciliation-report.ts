import {
  formatSignedMoney,
  type ReconciliationResult,
  type ReconciledStand,
  varianceRows,
} from "./balance-reconciliation.ts";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function deltaCell(delta: number | null): { text: string; color: string; bg: string } {
  if (delta == null) return { text: "—", color: "#6b7280", bg: "#f9fafb" };
  if (Math.abs(delta) <= 0.01) return { text: "$0.00", color: "#166534", bg: "#dcfce7" };
  if (delta > 0) return { text: formatSignedMoney(delta), color: "#9a3412", bg: "#ffedd5" };
  return { text: formatSignedMoney(delta), color: "#9f1239", bg: "#ffe4e6" };
}

function statusLabel(row: ReconciledStand): { text: string; bg: string; color: string } {
  if (row.status === "match") return { text: "MATCH", bg: "#dcfce7", color: "#166534" };
  if (row.status === "missing_source") return { text: "MISSING", bg: "#fef3c7", color: "#92400e" };
  return { text: "VARIANCE", bg: "#fee2e2", color: "#991b1b" };
}

export function buildReconciliationCsv(result: ReconciliationResult): string {
  const headers = [
    "Stand",
    "Customer",
    "Status",
    "Sheets Price",
    "Sheets Deposit",
    "Sheets Paid",
    "Sheets Balance",
    "Odoo Price",
    "Odoo Deposit",
    "Odoo Paid",
    "Odoo Balance",
    "StandLedger Price",
    "StandLedger Deposit",
    "StandLedger Paid",
    "StandLedger Balance",
    "Sheets vs Odoo (balance)",
    "Sheets vs StandLedger (balance)",
    "Odoo vs StandLedger (balance)",
    "Likely source",
    "Likely cause",
  ];
  const lines = [headers.join(",")];
  const csv = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  for (const row of result.rows) {
    lines.push(
      [
        row.standNumber,
        row.customerName,
        row.status,
        row.sheets?.totalPrice ?? "",
        row.sheets?.deposit ?? "",
        row.sheets?.totalPaid ?? "",
        row.sheets?.currentBalance ?? "",
        row.odoo?.totalPrice ?? "",
        row.odoo?.deposit ?? "",
        row.odoo?.totalPaid ?? "",
        row.odoo?.currentBalance ?? "",
        row.standledger?.totalPrice ?? "",
        row.standledger?.deposit ?? "",
        row.standledger?.totalPaid ?? "",
        row.standledger?.currentBalance ?? "",
        row.sheetsVsOdooBalance ?? "",
        row.sheetsVsStandledgerBalance ?? "",
        row.odooVsStandledgerBalance ?? "",
        row.likelySource,
        row.likelyCause,
      ].map(csv).join(","),
    );
  }
  return lines.join("\n");
}

const EMAIL_ROW_CAP = 200;

export function buildReconciliationEmailHtml(
  result: ReconciliationResult,
  meta: { tenantName: string; sheetsLabel: string; generatedAt: string; extraNotes?: string[] },
): string {
  const s = result.summary;
  const issues = varianceRows(result);
  const shown = issues.slice(0, EMAIL_ROW_CAP);
  const truncated = issues.length - shown.length;

  const issueRows = shown.map((row) => {
    const st = statusLabel(row);
    const so = deltaCell(row.sheetsVsOdooBalance);
    const sp = deltaCell(row.sheetsVsStandledgerBalance);
    const op = deltaCell(row.odooVsStandledgerBalance);
    const cause = escapeHtml(row.likelyCause);
    return `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-weight:600;white-space:nowrap;">${escapeHtml(row.standNumber)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(row.customerName || "—")}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;"><span style="background:${st.bg};color:${st.color};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">${st.text}</span></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${fmt(row.sheets?.currentBalance)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${fmt(row.odoo?.currentBalance)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${fmt(row.standledger?.currentBalance)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;background:${so.bg};color:${so.color};font-weight:700;">${so.text}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;background:${sp.bg};color:${sp.color};font-weight:700;">${sp.text}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;background:${op.bg};color:${op.color};font-weight:700;">${op.text}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#374151;">${cause}</td>
      </tr>`;
  }).join("");

  const notes = (meta.extraNotes || [])
    .map((n) => `<li style="margin:0 0 6px 0;">${escapeHtml(n)}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Weekly balance reconciliation</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#111827;">
  <div style="max-width:1100px;margin:0 auto;padding:24px 12px;">
    <div style="background:#0d4a3a;padding:24px 28px;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;">Weekly account balance reconciliation</h1>
      <p style="margin:8px 0 0;color:#a8d5c8;font-size:13px;">${escapeHtml(meta.tenantName)} · ${escapeHtml(meta.generatedAt)} · Sources: ${escapeHtml(meta.sheetsLabel)}, Odoo, StandLedger</p>
    </div>
    <div style="background:#ffffff;padding:24px 28px;border-radius:0 0 8px 8px;">
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">
        Outstanding balances are compared for every stand. A <strong>positive</strong> discrepancy (orange) means the left source shows a
        <em>higher</em> amount outstanding. A <strong>negative</strong> discrepancy (rose) means the left source shows a <em>lower</em> amount outstanding.
        The last column states where the difference is most likely caused (sale price, deposit, payment receipts, or a missing record).
      </p>

      <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
        <tr>
          <td style="padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;width:25%;">
            <div style="font-size:11px;color:#166534;text-transform:uppercase;letter-spacing:.04em;">Matched</div>
            <div style="font-size:22px;font-weight:700;color:#166534;">${s.matched}</div>
          </td>
          <td style="padding:12px;background:#fff7ed;border:1px solid #fed7aa;width:25%;">
            <div style="font-size:11px;color:#9a3412;text-transform:uppercase;letter-spacing:.04em;">Variances</div>
            <div style="font-size:22px;font-weight:700;color:#9a3412;">${s.variances}</div>
          </td>
          <td style="padding:12px;background:#fef3c7;border:1px solid #fde68a;width:25%;">
            <div style="font-size:11px;color:#92400e;text-transform:uppercase;letter-spacing:.04em;">Missing source</div>
            <div style="font-size:22px;font-weight:700;color:#92400e;">${s.missingSource}</div>
          </td>
          <td style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;width:25%;">
            <div style="font-size:11px;color:#334155;text-transform:uppercase;letter-spacing:.04em;">Stands compared</div>
            <div style="font-size:22px;font-weight:700;color:#0f172a;">${s.standsCompared}</div>
          </td>
        </tr>
      </table>

      <p style="font-size:13px;color:#4b5563;margin:0 0 16px;">
        Rows pulled — Master Sales / Sheets: <strong>${s.sheetsCount}</strong>
        · Odoo: <strong>${s.odooCount}</strong>
        · StandLedger: <strong>${s.standledgerCount}</strong>
        · Positive balance diffs: <strong>${s.positiveDiscrepancies}</strong>
        · Negative balance diffs: <strong>${s.negativeDiscrepancies}</strong>
        · Abs. variance total (all pairs): <strong>${fmt(s.absVarianceTotal)}</strong>
        · Tolerance: <strong>${fmt(s.tolerance)}</strong>
      </p>

      ${notes ? `<ul style="padding-left:18px;font-size:13px;color:#374151;">${notes}</ul>` : ""}

      <h2 style="font-size:16px;color:#0d4a3a;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Discrepancies</h2>
      ${issues.length === 0
        ? `<p style="color:#166534;font-weight:600;">No discrepancies above tolerance. All compared stands agree.</p>`
        : `
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px 10px;background:#0d4a3a;color:#fff;">Stand</th>
            <th style="text-align:left;padding:8px 10px;background:#0d4a3a;color:#fff;">Customer</th>
            <th style="text-align:left;padding:8px 10px;background:#0d4a3a;color:#fff;">Status</th>
            <th style="text-align:right;padding:8px 10px;background:#0d4a3a;color:#fff;">Sheets bal.</th>
            <th style="text-align:right;padding:8px 10px;background:#0d4a3a;color:#fff;">Odoo bal.</th>
            <th style="text-align:right;padding:8px 10px;background:#0d4a3a;color:#fff;">StandLedger bal.</th>
            <th style="text-align:right;padding:8px 10px;background:#0d4a3a;color:#fff;">Sheets − Odoo</th>
            <th style="text-align:right;padding:8px 10px;background:#0d4a3a;color:#fff;">Sheets − StandLedger</th>
            <th style="text-align:right;padding:8px 10px;background:#0d4a3a;color:#fff;">Odoo − StandLedger</th>
            <th style="text-align:left;padding:8px 10px;background:#0d4a3a;color:#fff;">Likely cause</th>
          </tr>
        </thead>
        <tbody>
          ${issueRows}
        </tbody>
      </table>
      ${truncated > 0 ? `<p style="font-size:12px;color:#6b7280;">Showing ${shown.length} of ${issues.length} issues. Full CSV is attached.</p>` : ""}
      `}

      <p style="margin-top:28px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px;">
        LakeCity StandLedger · Automated weekly reconciliation · Do not reply to this email.
      </p>
    </div>
  </div>
</body>
</html>`;
}
