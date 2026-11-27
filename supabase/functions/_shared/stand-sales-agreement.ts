// Agreement of Sale state machine for the stand-sales wizard.
// Pure functions: no database, no DocuSign HTTP, no email delivery.
// Follow-up days are for the staff badge only. This module does not send mail.

export const AGREEMENT_STATUSES = [
  "pending_review",
  "acknowledged",
  "dispatched",
  "return_submitted",
  "original_received",
  "countersigned",
  "action_required",
] as const;

export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

export const EXECUTION_METHODS = ["courier", "in_person", "docusign"] as const;
export type ExecutionMethod = (typeof EXECUTION_METHODS)[number];

export const BUYER_REGIONS = ["domestic", "diaspora"] as const;
export type BuyerRegion = (typeof BUYER_REGIONS)[number];

export const WIZARD_SALE_STATUSES = [
  "available",
  "paid",
  "signed",
  "awaiting_agreement",
  "agreement_sent_wet_signature",
  "signed_original_received",
] as const;

export type WizardSaleStatus = (typeof WIZARD_SALE_STATUSES)[number];

export const DOMESTIC_FOLLOW_UP_DAYS = 14;
export const DIASPORA_FOLLOW_UP_DAYS = 28;

export interface Witness {
  name: string;
  idNumber: string;
}

export interface CourierDetails {
  recipientName: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  region: BuyerRegion;
}

export interface Domicilium {
  address: string;
}

export interface AgreementState {
  status: AgreementStatus;
  executionMethod: ExecutionMethod | null;
  region: BuyerRegion | null;
  acknowledgedAt: string | null;
  dispatchedAt: string | null;
  dispatchTracking: string | null;
  returnSubmittedAt: string | null;
  returnTracking: string | null;
  returnCourier: string | null;
  originalReceivedAt: string | null;
  countersignedAt: string | null;
  actionRequiredAt: string | null;
  actionMessage: string | null;
  witnesses: Witness[];
  courier: CourierDetails | null;
  domicilium: Domicilium | null;
  docusignEnvelopeId: string | null;
  docusignStatus: string | null;
}

export interface PlannedEmail {
  template:
    | "agreement_acknowledged"
    | "agreement_sent_wet_signature"
    | "agreement_return_submitted"
    | "agreement_original_received"
    | "agreement_countersigned_complete"
    | "agreement_action_required"
    | "staff_agreement_dispatch_needed"
    | "staff_return_tracking_submitted";
  audience: "buyer" | "staff";
}

export interface TransitionResult {
  state: AgreementState;
  wizardStatus: WizardSaleStatus | null;
  emails: PlannedEmail[];
  requestedOn?: string;
  signedOn?: string;
}

export class AgreementTransitionError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function blankAgreement(): AgreementState {
  return {
    status: "pending_review",
    executionMethod: null,
    region: null,
    acknowledgedAt: null,
    dispatchedAt: null,
    dispatchTracking: null,
    returnSubmittedAt: null,
    returnTracking: null,
    returnCourier: null,
    originalReceivedAt: null,
    countersignedAt: null,
    actionRequiredAt: null,
    actionMessage: null,
    witnesses: [],
    courier: null,
    domicilium: null,
    docusignEnvelopeId: null,
    docusignStatus: null,
  };
}

export function docusignExecutionEnabled(flag: string | undefined | null): boolean {
  return flag === "true";
}

/** DocuSign never places an envelope from this build. A true flag still has no API client. */
export function rejectDocuSign(enabled: boolean): never {
  if (!enabled) {
    throw new AgreementTransitionError(403, "docusign_disabled", "DocuSign is turned off.");
  }
  throw new AgreementTransitionError(403, "docusign_not_configured", "DocuSign is not connected in this build.");
}

export function followUpLimitDays(region: BuyerRegion | null): number {
  return region === "diaspora" ? DIASPORA_FOLLOW_UP_DAYS : DOMESTIC_FOLLOW_UP_DAYS;
}

export function followUpReview(state: AgreementState, nowMs: number): { due: boolean; limitDays: number; overdueDays: number } | null {
  if (state.status !== "dispatched" || state.executionMethod !== "courier" || !state.dispatchedAt) return null;
  const parsed = Date.parse(state.dispatchedAt);
  if (Number.isNaN(parsed)) return null;
  const limitDays = followUpLimitDays(state.region);
  const elapsedDays = Math.floor((nowMs - parsed) / 86_400_000);
  const overdueDays = elapsedDays - limitDays;
  return { due: overdueDays >= 0, limitDays, overdueDays: Math.max(0, overdueDays) };
}

function fail(code: string, message: string, status = 400): never {
  throw new AgreementTransitionError(status, code, message);
}

function assertKnownStatus(status: string): AgreementStatus {
  if ((AGREEMENT_STATUSES as readonly string[]).includes(status)) return status as AgreementStatus;
  return fail("invalid_agreement", "This agreement is in a state we cannot update.");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseWitnesses(value: unknown): Witness[] {
  if (!Array.isArray(value) || value.length !== 2) fail("invalid_agreement", "Enter two witnesses.");
  return value.map((item) => {
    const record = asRecord(item);
    const name = String(record?.name ?? "").trim();
    const idNumber = String(record?.idNumber ?? "").trim();
    if (name.length < 3 || idNumber.length < 5) fail("invalid_agreement", "Enter each witness name and ID or passport number.");
    return { name, idNumber };
  });
}

function parseCourier(value: unknown): CourierDetails {
  const record = asRecord(value);
  const recipientName = String(record?.recipientName ?? "").trim();
  const phone = String(record?.phone ?? "").trim();
  const address = String(record?.address ?? "").trim();
  const city = String(record?.city ?? "").trim();
  const country = String(record?.country ?? "").trim();
  const region = String(record?.region ?? "").trim();
  if (recipientName.length < 3) fail("invalid_agreement", "Enter the name for the courier delivery.");
  if (phone.replace(/\D/g, "").length < 9) fail("invalid_agreement", "Enter a phone number for the courier delivery.");
  if (address.length < 5 || city.length < 2 || country.length < 2) fail("invalid_agreement", "Enter the courier delivery address.");
  if (region !== "domestic" && region !== "diaspora") fail("invalid_agreement", "Say whether the courier address is in Zimbabwe or abroad.");
  return { recipientName, phone, address, city, country, region };
}

function guardDocuSign(input: Record<string, unknown>, enabled: boolean) {
  const method = String(input.executionMethod ?? "");
  if (method === "docusign" || input.envelopeId != null || input.docusignEnvelopeId != null) rejectDocuSign(enabled);
}

export function planAcknowledge(state: AgreementState, input: Record<string, unknown>, nowIso: string, docusignEnabled: boolean): TransitionResult {
  guardDocuSign(input, docusignEnabled);
  const status = assertKnownStatus(state.status);
  if (status === "countersigned" || state.countersignedAt) fail("illegal_transition", "This agreement is already complete.", 409);
  if (state.dispatchedAt || state.originalReceivedAt) fail("illegal_transition", "This agreement has already moved past review.", 409);
  if (status !== "pending_review" && status !== "action_required") fail("illegal_transition", "The agreement cannot be requested from this step.", 409);
  if (input.accepted !== true) fail("invalid_agreement", "Please confirm you have reviewed the agreement.");
  const method = String(input.executionMethod ?? "");
  if (method !== "courier" && method !== "in_person") fail("invalid_agreement", "Choose courier or signing in person.");
  const witnesses = parseWitnesses(input.witnesses);
  const domiciliumAddress = String(input.domiciliumAddress ?? "").trim();
  if (domiciliumAddress.length < 5) fail("invalid_agreement", "Enter the address where notices can reach you.");
  const courier = method === "courier" ? parseCourier(input.courier) : null;
  const region: BuyerRegion = courier ? courier.region : "domestic";
  const day = nowIso.slice(0, 10);
  return {
    state: {
      ...blankAgreement(),
      status: "acknowledged",
      executionMethod: method,
      region,
      acknowledgedAt: nowIso,
      witnesses,
      courier,
      domicilium: { address: domiciliumAddress },
    },
    wizardStatus: "awaiting_agreement",
    emails: [
      { template: "agreement_acknowledged", audience: "buyer" },
      { template: "staff_agreement_dispatch_needed", audience: "staff" },
    ],
    requestedOn: day,
  };
}

export function planDispatch(state: AgreementState, tracking: string, nowIso: string): TransitionResult {
  const status = assertKnownStatus(state.status);
  if (state.executionMethod === "docusign") rejectDocuSign(false);
  if (status !== "acknowledged" || state.executionMethod !== "courier") {
    fail("illegal_transition", "Only a courier request that is waiting to be sent can be marked dispatched.", 409);
  }
  const clean = tracking.trim();
  if (clean.length < 4) fail("invalid_agreement", "Enter the outbound tracking number.");
  return {
    state: {
      ...state,
      status: "dispatched",
      dispatchedAt: nowIso,
      dispatchTracking: clean,
      actionMessage: null,
      actionRequiredAt: null,
    },
    wizardStatus: "agreement_sent_wet_signature",
    emails: [{ template: "agreement_sent_wet_signature", audience: "buyer" }],
  };
}

export function planBuyerReturn(state: AgreementState, input: Record<string, unknown>, nowIso: string): TransitionResult {
  const status = assertKnownStatus(state.status);
  const canReturn = state.executionMethod === "courier"
    && Boolean(state.dispatchedAt)
    && !state.returnSubmittedAt
    && !state.originalReceivedAt
    && (status === "dispatched" || status === "action_required");
  if (!canReturn) {
    fail("illegal_transition", "Return tracking can be added after LakeCity sends the pack.", 409);
  }
  if (input.witnessesConfirmed !== true) fail("invalid_agreement", "Confirm that both witnesses signed the original.");
  const tracking = String(input.tracking ?? "").trim();
  const courierName = String(input.courierName ?? "").trim();
  if (tracking.length < 4) fail("invalid_agreement", "Enter the return tracking number.");
  if (courierName.length < 2) fail("invalid_agreement", "Enter the courier you used for the return.");
  return {
    state: {
      ...state,
      status: "return_submitted",
      returnSubmittedAt: nowIso,
      returnTracking: tracking,
      returnCourier: courierName,
      actionMessage: null,
      actionRequiredAt: null,
    },
    wizardStatus: null,
    emails: [
      { template: "agreement_return_submitted", audience: "buyer" },
      { template: "staff_return_tracking_submitted", audience: "staff" },
    ],
  };
}

export function planOriginalReceived(state: AgreementState, nowIso: string): TransitionResult {
  const status = assertKnownStatus(state.status);
  if (state.executionMethod === "docusign") rejectDocuSign(false);
  const inPersonReady = state.executionMethod === "in_person" && (status === "acknowledged" || status === "action_required") && !state.originalReceivedAt;
  const courierReady = state.executionMethod === "courier" && (status === "dispatched" || status === "return_submitted" || (status === "action_required" && Boolean(state.dispatchedAt)));
  if (!inPersonReady && !courierReady) fail("illegal_transition", "The original cannot be marked received from this step.", 409);
  return {
    state: {
      ...state,
      status: "original_received",
      originalReceivedAt: nowIso,
      actionMessage: null,
      actionRequiredAt: null,
    },
    wizardStatus: "signed_original_received",
    emails: [{ template: "agreement_original_received", audience: "buyer" }],
  };
}

export function planCountersigned(state: AgreementState, nowIso: string): TransitionResult {
  if (assertKnownStatus(state.status) !== "original_received") {
    fail("illegal_transition", "Countersign only after the original has been received.", 409);
  }
  return {
    state: {
      ...state,
      status: "countersigned",
      countersignedAt: nowIso,
      actionMessage: null,
      actionRequiredAt: null,
    },
    wizardStatus: "signed",
    emails: [{ template: "agreement_countersigned_complete", audience: "buyer" }],
    signedOn: nowIso.slice(0, 10),
  };
}

export function planActionRequired(state: AgreementState, message: string, nowIso: string): TransitionResult {
  if (assertKnownStatus(state.status) === "countersigned") {
    fail("illegal_transition", "A completed agreement cannot be sent back for changes.", 409);
  }
  const clean = message.trim();
  if (clean.length < 5 || clean.length > 500) fail("invalid_agreement", "Enter a short note for the buyer.");
  return {
    state: {
      ...state,
      status: "action_required",
      actionRequiredAt: nowIso,
      actionMessage: clean,
    },
    wizardStatus: null,
    emails: [{ template: "agreement_action_required", audience: "buyer" }],
  };
}

export function agreementFromRow(row: Record<string, unknown>): AgreementState {
  const statusRaw = String(row.agreement_status ?? "pending_review");
  const status = (AGREEMENT_STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as AgreementStatus) : "pending_review";
  const methodRaw = row.agreement_execution_method ? String(row.agreement_execution_method) : "";
  const executionMethod = (EXECUTION_METHODS as readonly string[]).includes(methodRaw) ? (methodRaw as ExecutionMethod) : null;
  const regionRaw = row.agreement_region ? String(row.agreement_region) : "";
  const region = (BUYER_REGIONS as readonly string[]).includes(regionRaw) ? (regionRaw as BuyerRegion) : null;
  return {
    status,
    executionMethod,
    region,
    acknowledgedAt: row.agreement_acknowledged_at ? String(row.agreement_acknowledged_at) : null,
    dispatchedAt: row.agreement_dispatched_at ? String(row.agreement_dispatched_at) : null,
    dispatchTracking: row.agreement_dispatch_tracking ? String(row.agreement_dispatch_tracking) : null,
    returnSubmittedAt: row.agreement_return_submitted_at ? String(row.agreement_return_submitted_at) : null,
    returnTracking: row.agreement_return_tracking ? String(row.agreement_return_tracking) : null,
    returnCourier: row.agreement_return_courier ? String(row.agreement_return_courier) : null,
    originalReceivedAt: row.agreement_original_received_at ? String(row.agreement_original_received_at) : null,
    countersignedAt: row.agreement_countersigned_at ? String(row.agreement_countersigned_at) : null,
    actionRequiredAt: row.agreement_action_required_at ? String(row.agreement_action_required_at) : null,
    actionMessage: row.agreement_action_message ? String(row.agreement_action_message) : null,
    witnesses: storedWitnesses(row.agreement_witnesses),
    courier: storedCourier(row.agreement_courier),
    domicilium: storedDomicilium(row.agreement_domicilium),
    docusignEnvelopeId: null,
    docusignStatus: null,
  };
}

export function agreementToColumns(state: AgreementState): Record<string, unknown> {
  return {
    agreement_status: state.status,
    agreement_execution_method: state.executionMethod,
    agreement_region: state.region,
    agreement_acknowledged_at: state.acknowledgedAt,
    agreement_courier: state.courier,
    agreement_domicilium: state.domicilium,
    agreement_witnesses: state.witnesses,
    agreement_dispatched_at: state.dispatchedAt,
    agreement_dispatch_tracking: state.dispatchTracking,
    agreement_return_submitted_at: state.returnSubmittedAt,
    agreement_return_tracking: state.returnTracking,
    agreement_return_courier: state.returnCourier,
    agreement_original_received_at: state.originalReceivedAt,
    agreement_countersigned_at: state.countersignedAt,
    agreement_action_required_at: state.actionRequiredAt,
    agreement_action_message: state.actionMessage,
    agreement_document_url: null,
    docusign_envelope_id: null,
    docusign_status: null,
    docusign_sent_at: null,
  };
}

function storedWitnesses(value: unknown): Witness[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    const name = String(record.name ?? "").trim();
    const idNumber = String(record.idNumber ?? "").trim();
    return name ? [{ name, idNumber }] : [];
  });
}

function storedCourier(value: unknown): CourierDetails | null {
  const record = asRecord(value);
  if (!record) return null;
  const region = String(record.region ?? "");
  if (region !== "domestic" && region !== "diaspora") return null;
  return {
    recipientName: String(record.recipientName ?? ""),
    phone: String(record.phone ?? ""),
    address: String(record.address ?? ""),
    city: String(record.city ?? ""),
    country: String(record.country ?? ""),
    region,
  };
}

function storedDomicilium(value: unknown): Domicilium | null {
  const record = asRecord(value);
  if (!record) return null;
  const address = String(record.address ?? "").trim();
  return address ? { address } : null;
}
