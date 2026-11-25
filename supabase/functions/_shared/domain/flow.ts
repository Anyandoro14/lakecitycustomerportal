import type { Lead } from "./types.ts";

// Wizard order (agreed): intake + ID -> ID review gate -> offer form -> payment schedule ->
// ZikiMall payment -> collection schedule account (+ portal account auto-created) ->
// agreement of sale (DocuSign) -> portal activation -> celebration.
export const WIZARD_STEPS = [
  { key: "id-review", label: "ID check" },
  { key: "offer", label: "Offer form" },
  { key: "schedule", label: "Payment schedule" },
  { key: "payment", label: "Deposit payment" },
  { key: "agreement", label: "Agreement of sale" },
  { key: "portal", label: "Portal activation" },
  { key: "complete", label: "Done" },
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number]["key"];

/** The furthest step the customer is allowed to be on. Later steps are locked. */
export function currentStep(lead: Lead): WizardStep {
  if (lead.idReviewStatus !== "approved") return "id-review";
  if (!lead.offer) return "offer";
  if (!lead.scheduleAcceptedAt) return "schedule";
  if (lead.stage === "form_filled") return "payment";
  if (lead.stage === "paid") return "agreement";
  if (lead.portalStatus !== "activated") return "portal";
  return "complete";
}

export function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.findIndex((s) => s.key === step);
}
