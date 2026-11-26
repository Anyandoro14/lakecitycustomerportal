import type { PaymentView } from "@/lib/stand-sales/api";

export function paymentIsHeld(result: PaymentView | null): boolean {
  if (!result) return false;
  return result.cardStatus === 0 && result.result !== "approved";
}
