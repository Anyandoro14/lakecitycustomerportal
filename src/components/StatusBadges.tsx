import { Badge } from "@/components/ui/badge";
import type { Lead, PortalStatus } from "@/lib/backend";
import { reportStatus, reportStatusLabel } from "@shared/domain/report.ts";
import { cn } from "@/lib/utils";

const tone = {
  neutral: "border-transparent bg-muted text-muted-foreground",
  warn: "border-transparent bg-amber-100 text-amber-900",
  good: "border-transparent bg-emerald-100 text-emerald-900",
  brand: "border-transparent bg-primary text-primary-foreground",
};

export function PortalBadge({ status }: { status: PortalStatus }) {
  const map = { not_started: ["Portal: not started", tone.neutral], prepopulated: ["Portal: records ready", tone.good] } as const;
  const [label, cls] = map[status];
  return <Badge className={cn(cls)}>{label}</Badge>;
}

/** Valerie's report status: exactly one of three per signed-up lead. */
export function ReportStatusBadge({ lead }: { lead: Pick<Lead, "offer" | "stage"> }) {
  const status = reportStatus(lead);
  if (!status) return <Badge className={cn(tone.neutral)}>Not signed up yet</Badge>;
  const cls = { signed_up: tone.neutral, signed_up_paid: tone.warn, signed_up_paid_signed: tone.brand }[status];
  return <Badge className={cn(cls)} data-status={status}>{reportStatusLabel(status)}</Badge>;
}
