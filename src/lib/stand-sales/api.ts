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

export type AgreementStatus =
  | "pending_review"
  | "acknowledged"
  | "dispatched"
  | "return_submitted"
  | "original_received"
  | "countersigned"
  | "action_required";

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
  agreementStatus?: AgreementStatus;
  executionMethod?: "courier" | "in_person" | "docusign" | null;
  region?: "domestic" | "diaspora" | null;
  acknowledgedAt?: string | null;
  dispatchedAt?: string | null;
  dispatchTracking?: string | null;
  returnSubmittedAt?: string | null;
  returnTracking?: string | null;
  returnCourier?: string | null;
  originalReceivedAt?: string | null;
  countersignedAt?: string | null;
  actionMessage?: string | null;
  documentUrl?: string;
  documentLabel?: string;
  inPersonLine?: string;
}

export interface AgreementStaffRow {
  applicationId: string;
  standNumber: string;
  fullName: string;
  email: string;
  status: AgreementStatus;
  executionMethod: "courier" | "in_person" | "docusign" | null;
  region: "domestic" | "diaspora" | null;
  dispatchedAt: string | null;
  dispatchTracking: string | null;
  returnTracking: string | null;
  returnCourier: string | null;
  actionMessage: string | null;
  followUp: { due: boolean; limitDays: number; overdueDays: number } | null;
  witnesses: Array<{ name: string; idNumber: string }>;
  domiciliumAddress: string | null;
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
  getForPortal: (standNumber: string) =>
    invoke<{ application: ApplicationView }>("stand-sales", { action: "get", standNumber }),
  acknowledgeAgreement: (input: {
    applicationId?: string;
    accessToken?: string;
    standNumber: string;
    accepted: boolean;
    executionMethod: "courier" | "in_person";
    domiciliumAddress: string;
    witnesses: Array<{ name: string; idNumber: string }>;
    courier?: Record<string, string>;
  }) => invoke<{ ok: boolean; agreementStatus: string }>("stand-sales", { action: "acknowledge-and-request-agreement", ...input }),
  submitBuyerReturn: (input: {
    applicationId?: string;
    accessToken?: string;
    standNumber: string;
    tracking: string;
    courierName: string;
    witnessesConfirmed: boolean;
  }) => invoke<{ ok: boolean; agreementStatus: string }>("stand-sales", { action: "submit-buyer-return", ...input }),
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
  staffAgreements: () => invoke<{ rows: AgreementStaffRow[] }>("stand-sales", { action: "staff-agreements-queue" }),
  staffMarkDispatched: (applicationId: string, tracking: string) =>
    invoke<{ ok: boolean }>("stand-sales", { action: "staff-mark-dispatched", applicationId, tracking }),
  staffMarkOriginalReceived: (applicationId: string) =>
    invoke<{ ok: boolean }>("stand-sales", { action: "staff-mark-original-received", applicationId }),
  staffMarkCountersigned: (applicationId: string) =>
    invoke<{ ok: boolean }>("stand-sales", { action: "staff-mark-countersigned", applicationId }),
  staffMarkActionRequired: (applicationId: string, message: string) =>
    invoke<{ ok: boolean }>("stand-sales", { action: "staff-mark-action-required", applicationId, message }),
};
