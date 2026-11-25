import { Check } from "lucide-react";
import type { Lead } from "@/lib/backend";
import { cn } from "@/lib/utils";
import { progressFor } from "@shared/domain/progress.ts";

/** "Progress of your purchase" banner (same stages as the bar in every automated email). */
export function PurchaseProgress({ lead, className }: { lead: Pick<Lead, "offer" | "stage" | "portalStatus">; className?: string }) {
  const stages = progressFor(lead);
  return (
    <section
      data-testid="portal-progress"
      aria-label="Progress of your purchase"
      className={cn("overflow-hidden rounded-2xl border-b-[3px] border-b-[#DDA23C] bg-[#0B412F] px-4 py-5 text-white sm:px-6", className)}
    >
      <p className="font-serif text-base font-semibold text-white">Progress of your purchase</p>
      <ol className="mt-4 grid grid-cols-4 gap-1 sm:gap-2">
        {stages.map((s, i) => (
          <li key={s.key} data-stage={s.key} data-state={s.state} aria-current={s.state === "current" ? "step" : undefined} className="text-center">
            <div className={cn("h-1 rounded-full", s.state === "done" ? "bg-white" : s.state === "current" ? "bg-[#DDA23C]" : "bg-white/20")} />
            <div
              className={cn(
                "mx-auto mt-3 flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-bold",
                s.state === "done" && "border-white bg-white text-[#0B412F]",
                s.state === "current" && "border-[#DDA23C] bg-[#DDA23C] text-[#0B412F]",
                s.state === "pending" && "border-white/30 text-white/60",
              )}
            >
              {s.state === "done" ? <Check className="h-4 w-4" aria-label="done" /> : i + 1}
            </div>
            <p className={cn("mt-2 text-[11px] leading-tight sm:text-xs", s.state === "pending" ? "text-white/60" : "font-semibold text-white", s.state === "current" && "text-[#DDA23C]")}>
              {s.label}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
