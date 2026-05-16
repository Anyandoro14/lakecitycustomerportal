-- Enable Realtime for receipting so Lovable / customer apps can subscribe to INSERT/UPDATE
-- on `payment_receipts` and contract rows as balances flow through the ledger.

ALTER TABLE public.payment_receipts REPLICA IDENTITY FULL;
ALTER TABLE public.contracts REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_receipts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contracts;
