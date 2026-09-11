import { supabase } from "@/integrations/supabase/client";

export type PayMethod = "paynow" | "ecocash" | "onemoney";

export interface InitPaymentArgs {
  amount: number;
  method: PayMethod;
  phone?: string;
  standNumber: string;
  minAmount: number;
  maxAmount: number;
}

export interface InitPaymentResult {
  success: boolean;
  error?: string;
  reference?: string;
  redirect_url?: string | null;
  browserurl?: string | null;
  instructions?: string | null;
  method?: string;
}

/** Parse "$1,234.56" style values coming from the Collection Schedule. */
export function parseAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export async function initPayment(args: InitPaymentArgs): Promise<InitPaymentResult> {
  const origin = window.location.origin;

  const { data, error } = await supabase.functions.invoke("paynow-init", {
    body: {
      amount: args.amount,
      method: args.method === "paynow" ? undefined : args.method,
      phone: args.method === "paynow" ? undefined : args.phone,
      return_url: `${origin}/pay/return`,
      return_origin: origin,
      stand_number: args.standNumber,
      min_amount: args.minAmount,
      max_amount: args.maxAmount,
    },
  });

  if (error) {
    return { success: false, error: error.message || "Could not start the payment" };
  }
  return (data || { success: false, error: "No response from the payment service" }) as InitPaymentResult;
}

export async function checkPaymentStatus(reference: string) {
  const { data, error } = await supabase.functions.invoke("paynow-status", {
    body: { reference },
  });
  if (error) return { success: false, error: error.message } as any;
  return data as {
    success: boolean;
    error?: string;
    paid?: boolean;
    status?: string;
    amount?: number;
    stand_number?: string;
  };
}
