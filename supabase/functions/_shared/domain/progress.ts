// "Progress of your purchase": Signed up > Paid > Signed > Portal active.
// Completed stages are ticked; the first stage not yet completed is the current one (highlighted).
// A buyer who pays but has not signed can already be enrolled in the portal (OI-TBC-09), so stages
// are tracked independently: e.g. Signed up ✓, Paid ✓, Signed (current), Portal active ✓.

import type { Lead } from "./types.ts";

export type ProgressStageKey = "signed_up" | "paid" | "signed" | "portal_active";
export type ProgressStageState = "done" | "current" | "pending";

export const PROGRESS_STAGES: { key: ProgressStageKey; label: string }[] = [
  { key: "signed_up", label: "Signed up" },
  { key: "paid", label: "Paid" },
  { key: "signed", label: "Signed" },
  { key: "portal_active", label: "Portal active" },
];

export interface ProgressStage {
  key: ProgressStageKey;
  label: string;
  state: ProgressStageState;
}

export function progressFor(lead: Pick<Lead, "offer" | "stage" | "portalStatus">): ProgressStage[] {
  const done: Record<ProgressStageKey, boolean> = {
    signed_up: !!lead.offer,
    paid: lead.stage === "paid" || lead.stage === "signed",
    signed: lead.stage === "signed",
    portal_active: lead.portalStatus === "prepopulated",
  };
  const current = PROGRESS_STAGES.find((s) => !done[s.key])?.key;
  return PROGRESS_STAGES.map((s) => ({ ...s, state: done[s.key] ? "done" : s.key === current ? "current" : "pending" }));
}
