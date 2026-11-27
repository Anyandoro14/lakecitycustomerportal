import type { AgreementStatus } from "@/lib/stand-sales/api";

export const AGREEMENT_STATUS_LABEL: Record<AgreementStatus, string> = {
  pending_review: "Ready for your review",
  acknowledged: "Request received",
  dispatched: "Pack sent for your signature",
  return_submitted: "Return tracking received",
  original_received: "Original received by LakeCity",
  countersigned: "Agreement complete",
  action_required: "Please review a note from LakeCity",
};
