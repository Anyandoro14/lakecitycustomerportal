import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WizardFrame } from "@/components/stand-sales/WizardFrame";
import { standSalesApi, type StandCard } from "@/lib/stand-sales/api";
import { formatMoney } from "@/lib/stand-sales/money";

type Filter = "all" | "A" | "B" | "C";

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

  const visible = useMemo(() => (stands ?? []).filter((stand) => filter === "all" || stand.band === filter), [stands, filter]);
  const available = (stands ?? []).filter((stand) => stand.available).length;

  return (
    <WizardFrame step={0}>
      <section className="rounded-2xl bg-primary px-6 py-12 text-primary-foreground" data-testid="stands-hero">
        <h1 className="max-w-2xl font-display text-4xl leading-tight">Own your stand at LakeCity. $2,250.00 today, the balance over 48 months.</h1>
        <p className="mt-4 max-w-xl text-primary-foreground/80">Every stand is priced at USD 45 per m², incl. 15.5% VAT. Choose a stand, complete the offer, and pay the down payment and legal fee by card.</p>
        <p className="mt-6 text-sm">{stands === null ? "Checking availability…" : `${available} of ${stands.length} stands available`}</p>
      </section>
      <section id="stands" className="mt-8">
        <div className="mb-4 flex flex-wrap gap-2" data-testid="band-filter">
          {(["all", "A", "B", "C"] as Filter[]).map((key) => (
            <Button key={key} variant={filter === key ? "default" : "outline"} size="sm" onClick={() => setFilter(key)}>
              {key === "all" ? "All ranges" : `Range ${key}`}
            </Button>
          ))}
        </div>
        {error && (
          <Card data-testid="stands-error">
            <CardContent className="space-y-3 p-6">
              <p>{error}</p>
              <Button onClick={load}>Try again</Button>
            </CardContent>
          </Card>
        )}
        {stands === null && !error && <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading stands" />}
        {stands && visible.length === 0 && !error && <p data-testid="stands-empty">No stands in this range.</p>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((stand) => (
            <Card key={stand.standNumber} data-testid={`stand-${stand.standNumber}`}>
              <CardContent className="space-y-2 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-2xl">Stand {stand.standNumber}</h2>
                  <span className="text-xs uppercase tracking-wide">{stand.band ? `Range ${stand.band}` : ""}</span>
                </div>
                <p className="text-sm text-muted-foreground">{stand.phase ? `Phase ${stand.phase}` : "Phase TBC"} · {stand.sizeSqm ?? "—"} m² · {stand.landUse ?? "Residential"}</p>
                <p className="font-medium">{formatMoney(stand.priceCents)} <span className="text-xs text-muted-foreground">incl. 15.5% VAT</span></p>
                {stand.available ? (
                  <Button asChild>
                    <Link to={`/stands/${stand.standNumber}`}>Select stand</Link>
                  </Button>
                ) : (
                  <p className="text-sm">Reserved</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </WizardFrame>
  );
}
