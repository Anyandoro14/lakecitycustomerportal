// ZikiMall payment confirmation callback: STUB. The ZikiMall API, signature scheme and CBZ settlement
// flow are TBC. Once known: verify the callback signature, look up the lead by reference, then call
// onPaymentConfirmed(leadId, zikimallReference) from ../_shared/server/payment.ts.

import { json, serve } from "../_shared/server/http.ts";

serve(async () => json({ error: "ZikiMall integration not implemented (TBC). No payment was processed." }, 501));
