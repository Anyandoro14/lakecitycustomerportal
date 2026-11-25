import { StandSummary } from "@/components/StandSummary";
import type { Stand } from "@/lib/backend";
import type { PriceBandKey } from "@shared/domain/campaign.ts";

/** Price breakdown on the left, the customer's side pane on the right (stacked on mobile). */
export function StandLayout({ stand, band, children }: { stand: Stand; band?: PriceBandKey; children: React.ReactNode }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
      <div className="lg:sticky lg:top-20">
        <StandSummary stand={stand} band={band} />
      </div>
      <aside className="min-w-0 rounded-xl border bg-card p-5 shadow-sm sm:p-6" aria-label="Your application">
        {children}
      </aside>
    </div>
  );
}
