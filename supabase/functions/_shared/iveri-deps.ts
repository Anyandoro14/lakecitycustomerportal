// Wires config + Supabase store + Odoo STAGING recorder for the iVeri edge functions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { loadIveriConfig, redact, type Deps, type Recorder } from "./iveri.ts";
import { supabaseIveriStore } from "./iveri-supabase-store.ts";
import { odooPendingRecorder } from "./iveri-odoo.ts";

export function iveriDeps(extra: { userId?: string | null; tenantId?: string | null } = {}) {
  const get = (k: string) => Deno.env.get(k);
  const cfg = loadIveriConfig(get);
  const sb = createClient(get("SUPABASE_URL")!, get("SUPABASE_SERVICE_ROLE_KEY")!);
  const url = get("IVERI_ODOO_URL"), db = get("IVERI_ODOO_DB"), uid = get("IVERI_ODOO_UID"), key = get("IVERI_ODOO_API_KEY");
  // Without Odoo Staging credentials the approval is still stored and flagged
  // odoo_record_pending; the sweep retries once credentials exist.
  const recorder: Recorder = url && db && uid && key
    ? odooPendingRecorder({ url, db, uid: Number(uid), apiKey: key, receiptBaseUrl: `${cfg.portalBaseUrl}/pay/card/approved` }, fetch as never)
    : { recordPending: () => Promise.reject(new Error("IVERI_ODOO_* not configured")) };
  const deps: Deps = { cfg, store: supabaseIveriStore(sb, extra), recorder, fetch: fetch as never, log: (m) => console.log(redact(cfg, m)) };
  return { deps, sb, cfg };
}
