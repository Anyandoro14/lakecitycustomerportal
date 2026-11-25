import { MapPin } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import type { Stand } from "@/lib/backend";
import { cn } from "@/lib/utils";
import { PRICE_VAT_NOTE, PRICING, quoteForSize, type PriceBandKey } from "@shared/domain/campaign.ts";
import { formatUsd } from "@shared/domain/schedule.ts";

function Row({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <p className={cn("text-sm", strong ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <p className={cn("tabular-nums", strong ? "text-lg font-semibold" : "text-sm font-medium")}>{value}</p>
    </div>
  );
}

/** Price breakdown for one stand. All amounts come from the pricing rules in campaign.ts. */
export function StandSummary({ stand, band, className }: { stand: Stand; band?: PriceBandKey; className?: string }) {
  if (!stand.sizeSqm) {
    return <div className={cn("rounded-xl border bg-card p-6 text-sm", className)}>The size of stand {stand.standNumber} is not confirmed yet.</div>;
  }
  const q = quoteForSize(stand.sizeSqm);
  return (
    <section className={cn("overflow-hidden rounded-xl border bg-card", className)} aria-label={`Stand ${stand.standNumber} price breakdown`}>
      <div className="bg-primary p-6 text-primary-foreground">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-primary-foreground/70">
            <MapPin className="h-3.5 w-3.5" /> LakeCity stand
          </p>
          {band && <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-semibold text-gold-foreground">Range {band}</span>}
        </div>
        <h2 className="mt-2 font-serif text-4xl font-semibold" data-testid="stand-number">Stand {stand.standNumber}</h2>
        <p className="mt-1 text-primary-foreground/80">
          {stand.sizeSqm.toLocaleString("en-US")} m²{stand.phase ? ` · Phase ${stand.phase}` : ""}
        </p>
      </div>
      <div className="px-6 py-4">
        <Row label="Total price" hint={`USD ${PRICING.pricePerSqmUsd} × ${stand.sizeSqm.toLocaleString("en-US")} m², ${PRICE_VAT_NOTE}`} value={formatUsd(q.priceCents)} strong />
        <Separator />
        <Row label="Down payment" value={formatUsd(q.downPaymentCents)} />
        <Row label="Legal fee" hint="Agreement of Sale preparation, non-refundable" value={formatUsd(q.legalFeeCents)} />
        <div className="-mx-6 mt-1 flex items-center justify-between bg-accent px-6 py-3">
          <p className="text-sm font-semibold">Due now</p>
          <p className="text-2xl font-semibold tabular-nums text-primary" data-testid="due-now">{formatUsd(q.dueNowCents)}</p>
        </div>
        <p className="pt-3 text-xs text-muted-foreground">
          Then {q.termMonths} monthly payments of about {formatUsd(q.monthlyCents)} for the balance of {formatUsd(q.balanceCents)}.
        </p>
      </div>
    </section>
  );
}
