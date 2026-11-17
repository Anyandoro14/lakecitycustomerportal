import { supabase } from "@/integrations/supabase/client";

/** Feature flag: the button only renders when VITE_IVERI_CARD_ENABLED === "true" (Staging only for now). */
export const iveriCardEnabled = import.meta.env.VITE_IVERI_CARD_ENABLED === "true";

export interface IveriInitResult { success: boolean; error?: string; reference?: string; action?: string; fields?: Record<string, string>; reused?: boolean }

/** Ask the server to create the order (stand + amount checks + signing happen server-side). */
export async function initCardPayment(amount: string, idempotencyKey: string): Promise<IveriInitResult> {
  const { data, error } = await supabase.functions.invoke("iveri-init", { body: { amount, idempotency_key: idempotencyKey } });
  if (error) return { success: false, error: error.message };
  return data as IveriInitResult;
}

/** Full redirect to iVeri's hosted page (the card is typed there, never on our site). */
export function submitToIveri(action: string, fields: Record<string, string>): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  for (const [k, v] of Object.entries(fields)) {
    const i = document.createElement("input");
    i.type = "hidden"; i.name = k; i.value = v;
    form.appendChild(i);
  }
  document.body.appendChild(form);
  form.submit();
}
