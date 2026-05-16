/**
 * Maps portal `payment_receipts.gateway` (+ optional metadata) to Odoo
 * `lakecity.loan.payment` `source` selection keys.
 */
export function mapGatewayToOdooSource(
  gateway: string,
  metadata?: Record<string, unknown> | null,
): string {
  const g = (gateway || "").toLowerCase().trim();
  const method = String(metadata?.payment_method || metadata?.channel || metadata?.payment_channel || "")
    .toLowerCase();

  if (g === "kuva") return "kuva";
  if (g === "odoo") return "odoo";
  if (g === "paystack") return "paystack";
  if (g === "paypal") return "paypal";
  if (g === "flutterwave") return "flutterwave";

  if (
    g === "mobile_money" ||
    g === "ecocash" ||
    g === "mpesa" ||
    g === "momo"
  ) {
    return "mobile_money";
  }
  if (
    g === "bank_transfer" ||
    g === "transfer" ||
    g === "wire" ||
    g === "eft"
  ) {
    return "bank_transfer";
  }
  if (g === "cash") return "cash";
  if (
    g === "card" ||
    g === "credit_card" ||
    g === "debit_card"
  ) {
    return "card";
  }

  if (g === "google_form" || g === "manual" || g === "" || !g) {
    if (method.includes("mobile") || method.includes("ecocash") || method.includes("mpesa") || method.includes("momo")) {
      return "mobile_money";
    }
    if (method.includes("transfer") || method.includes("bank") || method.includes("wire")) {
      return "bank_transfer";
    }
    if (method.includes("cash")) return "cash";
    if (method.includes("card") || method.includes("visa") || method.includes("master")) {
      return "card";
    }
    return "manual";
  }

  return "manual";
}
