import { Badge } from "@/components/ui/badge";
import type { IdReviewStatus, LeadStage, PortalStatus } from "@/lib/backend";
import { cn } from "@/lib/utils";

const tone = {
  neutral: "border-transparent bg-muted text-muted-foreground",
  warn: "border-transparent bg-amber-100 text-amber-900",
  good: "border-transparent bg-emerald-100 text-emerald-900",
  bad: "border-transparent bg-red-100 text-red-900",
  brand: "border-transparent bg-primary text-primary-foreground",
};

export function IdReviewBadge({ status }: { status: IdReviewStatus }) {
  const map = {
    id_pending_review: ["ID pending review", tone.warn],
    approved: ["ID approved", tone.good],
    rejected: ["ID rejected", tone.bad],
  } as const;
  const [label, cls] = map[status];
  return <Badge className={cn(cls)}>{label}</Badge>;
}

export function StageBadge({ stage }: { stage: LeadStage }) {
  const map = { form_filled: ["Form filled", tone.neutral], paid: ["Paid", tone.warn], signed: ["Signed", tone.brand] } as const;
  const [label, cls] = map[stage];
  return <Badge className={cn(cls)}>{label}</Badge>;
}

export function PortalBadge({ status }: { status: PortalStatus }) {
  const map = { not_created: ["Portal: not created", tone.neutral], created: ["Portal: created", tone.warn], activated: ["Portal: activated", tone.good] } as const;
  const [label, cls] = map[status];
  return <Badge className={cn(cls)}>{label}</Badge>;
}
