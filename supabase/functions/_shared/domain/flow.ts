import type { Lead } from "./types.ts";

// Core wizard (Alex, 2026-11-25): choose stand (landing) -> stand details + side pane with contact
// details and the digital offer form -> ZikiMall payment (USD 2,250) -> celebration + thank-you
// email -> portal account step (stand number + phone; records pre-populated).
export const WIZARD_STEPS = [
  { key: "offer", label: "Offer form" },
  { key: "payment", label: "Payment" },
  { key: "celebration", label: "Celebration" },
  { key: "portal", label: "Portal account" },
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number]["key"];

/** The furthest step the customer may open. Later steps redirect here; earlier ones stay viewable. */
export function currentStep(lead: Lead): WizardStep {
  if (!lead.offer) return "offer";
  if (lead.stage === "form_filled") return "payment";
  return "portal";
}

export function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.findIndex((s) => s.key === step);
}
