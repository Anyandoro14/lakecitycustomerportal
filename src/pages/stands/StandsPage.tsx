import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WizardFrame } from "@/components/stand-sales/WizardFrame";
import { standSalesApi, type StandCard } from "@/lib/stand-sales/api";
import { formatMoney } from "@/lib/stand-sales/money";
import { cn } from "@/lib/utils";
import spineRoad from "@/assets/stand-sales/luxe/hero-real-spine-road-aerial.jpg";
import standGrid from "@/assets/stand-sales/luxe/real-green-season-stand-grid.jpg";

type Filter = "all" | "A" | "B" | "C";

const SPINE_ALT = "LakeCity aerial, February 2026";
const GRID_ALT = "LakeCity stand grid, aerial, February 2026";

export default function StandsPage() {
  const [stands, setStands] = useState<StandCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  function load() {
    setError(null);
    setStands(null);
    standSalesApi.listStands().then((res) => setStands(res.stands)).catch((err) => setError(err instanceof Error ? err.message : "Could not load the stands."));
  }
  useEffect(load, []);

  const visible = (stands ?? []).filter((stand) => filter === "all" || stand.band === filter);
  const available = (stands ?? []).filter((stand) => stand.available).length;

  return (
    <WizardFrame step={0}>
      <section className="relative overflow-hidden rounded-2xl bg-[hsl(160_70%_10%)]" data-testid="stands-hero">
        <img src={spineRoad} alt={SPINE_ALT} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[hsl(160_70%_8%/0.78)] md:bg-gradient-to-r md:from-[hsl(160_70%_8%/0.9)] md:via-[hsl(160_70%_10%/0.72)] md:to-[hsl(160_40%_16%/0.42)]" />
        <div className="relative max-w-3xl px-6 py-14 md:px-12 md:py-20">
          <p className="font-display text-xl italic leading-snug text-[hsl(40_33%_96%)] md:text-2xl">A place of your own at LakeCity.</p>
          <h1 className="mt-4 max-w-3xl font-display text-[2rem] font-medium leading-[1.15] text-[hsl(40_33%_96%)] md:text-[3.25rem]">Own your stand at LakeCity. $2,250.00 today, the balance over 48 months.</h1>
          <p className="mt-6 max-w-xl font-body text-sm leading-relaxed text-[hsl(40_33%_96%)] md:text-base">Every stand is priced at USD 45 per m², incl. 15.5% VAT. Choose a stand, reserve it, and pay the down payment and legal fee by card.</p>
          <p className="mt-8 font-body text-sm tracking-wide text-[hsl(40_33%_96%)]">{stands === null ? "Checking availability…" : `${available} of ${stands.length} stands available`}</p>
          <p className="mt-6 text-[0.68rem] tracking-[0.16em] text-[hsl(40_33%_96%)]" aria-hidden="true">{SPINE_ALT}</p>
        </div>
      </section>
      <section id="stands" className="mt-12">
        <p className="mb-6 max-w-xl text-sm leading-relaxed text-muted-foreground" aria-hidden="true">{GRID_ALT}</p>
        <div className="mb-8 flex flex-wrap gap-2" data-testid="band-filter">
          {(["all", "A", "B", "C"] as Filter[]).map((key) => (
            <Button
              key={key}
              type="button"
              variant="ghost"
              className={cn(
                "rounded-none px-3 text-sm",
                filter === key ? "border-b border-sl-gold text-primary" : "text-muted-foreground",
              )}
              onClick={() => setFilter(key)}
            >
              {key === "all" ? "All ranges" : `Range ${key}`}
            </Button>
          ))}
        </div>
        {error && (
          <Card data-testid="stands-error">
            <div className="space-y-3 p-6">
              <p>{error}</p>
              <Button onClick={load}>Try again</Button>
            </div>
          </Card>
        )}
        {stands === null && !error && <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading stands" />}
        {stands && visible.length === 0 && !error && <p data-testid="stands-empty">No stands in this range.</p>}
        <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((stand) => (
            <Card key={stand.standNumber} className="overflow-hidden border-border/80" data-testid={`stand-${stand.standNumber}`}>
              <div className="relative aspect-[4/3] overflow-hidden">
                <img
                  src={standGrid}
                  alt={GRID_ALT}
                  className={cn("h-full w-full object-cover", !stand.available && "opacity-80")}
                />
              </div>
              <div className="space-y-3 p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-[1.75rem] leading-none text-primary">Stand {stand.standNumber}</h2>
                  <span className="text-xs tracking-[0.12em] text-muted-foreground">{stand.band ? `Range ${stand.band}` : ""}</span>
                </div>
                <p className="text-sm text-muted-foreground">{stand.phase ? `Phase ${stand.phase}` : "Phase TBC"} · {stand.sizeSqm ?? "—"} m² · {stand.landUse ?? "Residential"}</p>
                <p className="font-medium text-foreground">{formatMoney(stand.priceCents)} <span className="text-xs font-normal text-muted-foreground">incl. 15.5% VAT</span></p>
                {stand.available ? (
                  <Button asChild className="mt-2">
                    <Link to={`/stands/${stand.standNumber}`}>View this stand</Link>
                  </Button>
                ) : (
                  <p className="text-sm">Reserved</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>
    </WizardFrame>
  );
}
