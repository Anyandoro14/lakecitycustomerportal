import { supabase } from "@/integrations/supabase/client";

export class StandSalesApiError extends Error {
  code?: string;
  outcome?: PaymentView | null;
  constructor(message: string, code?: string, outcome?: PaymentView | null) {
    super(message);
    this.code = code;
    this.outcome = outcome;
  }
}

export interface PaymentView {
  result: string;
  cardStatus: number | null;
  title: string;
  message: string;
  reference?: string;
  reason?: string | null;
}

export interface StandCard {
  standNumber: string;
  phase: string | null;
  landUse: string | null;
  sizeSqm: number | null;
  priceCents: number | null;
  band: "A" | "B" | "C" | null;
  available: boolean;
}

export interface ApplicationView {
  id: string;
  standNumber: string;
  fullName: string;
  email: string;
  phone: string;
  stage: "contact" | "offer" | "paid";
  offer: Record<string, unknown> | null;
  paidAt: string | null;
  paymentReference: string | null;
  paymentAmountCents: number | null;
  portalReady: boolean;
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let payload: { error?: string; code?: string; outcome?: PaymentView | null } | null = null;
    try {
      payload = await (error as { context?: Response }).context?.json?.();
    } catch {
      payload = null;
    }
    throw new StandSalesApiError(payload?.error || error.message || "Request failed", payload?.code, payload?.outcome);
  }
  if (data?.error) throw new StandSalesApiError(data.error, data.code, data.outcome);
  return data as T;
}

export const standSalesApi = {
  listStands: () => invoke<{ stands: StandCard[] }>("stand-sales", { action: "list-stands" }),
  start: (input: { standNumber: string; fullName: string; email: string; phone: string }) =>
    invoke<{ applicationId: string; accessToken: string; standNumber: string }>("stand-sales", { action: "start", ...input }),
  submitOffer: (applicationId: string, accessToken: string, offer: Record<string, unknown>) =>
    invoke<{ ok: boolean }>("stand-sales", { action: "submit-offer", applicationId, accessToken, offer }),
  get: (applicationId: string, accessToken: string) =>
    invoke<{ application: ApplicationView }>("stand-sales", { action: "get", applicationId, accessToken }),
  createPortalLogin: (applicationId: string, accessToken: string, standNumber: string, password: string) =>
    invoke<{ ok: boolean }>("stand-sales", { action: "create-portal-login", applicationId, accessToken, standNumber, password }),
  startPayment: (applicationId: string, accessToken: string) =>
    invoke<{
      alreadyApproved?: boolean;
      outcome?: PaymentView;
      reference?: string;
      amountCents: number;
      action?: string;
      fields?: Record<string, string>;
      simulationAllowed?: boolean;
    }>("iveri-init", { action: "start", applicationId, accessToken }),
  checkPayment: (applicationId: string, accessToken: string) =>
    invoke<PaymentView & { stage?: string; checked?: number }>("iveri-init", { action: "check", applicationId, accessToken }),
  simulatePayment: (applicationId: string, accessToken: string, reference: string, cardStatus: number | null, extra?: Record<string, unknown>) =>
    invoke<PaymentView>("iveri-init", { action: "simulate", applicationId, accessToken, reference, cardStatus, ...extra }),
  staffQueue: () => invoke<{ rows: Array<Record<string, unknown>> }>("stand-sales", { action: "staff-queue" }),
  staffDismiss: (reference: string) => invoke<{ ok: boolean }>("stand-sales", { action: "staff-dismiss", reference }),
};
