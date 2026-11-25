// ZikiMall/CBZ payment confirmation: STUB. The source of automatic confirmations (webhook, API or bank
// feed) is TBC (OI-TBC-30). Once known: verify the message, map it to a PaymentConfirmation (reference,
// stand number = ZikiMall account number, amount, paid-at) and call handlePaymentConfirmed() from
// ../_shared/server/payment.ts, which is idempotent per reference.

import { json, serve } from "../_shared/server/http.ts";

serve(async () => json({ error: "ZikiMall/CBZ confirmation source not decided yet (OI-TBC-30). No payment was processed." }, 501));
