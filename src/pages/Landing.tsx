import { ArrowRight, Loader2, RefreshCw, Ruler } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PlaceholderTag } from "@/components/Placeholder";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { backend, type Stand } from "@/lib/backend";
import { cn } from "@/lib/utils";
import { DUE_AT_START_USD, PRICE_VAT_NOTE, PRICING, bandOf, filterByBand, priceBands, standPriceCents, type PriceBandKey } from "@shared/domain/campaign.ts";
import { formatUsd } from "@shared/domain/schedule.ts";

type Filter = PriceBandKey | "all";

export default function Landing() {
  const [stands, setStands] = useState<Stand[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(() => {
    setError(null);
    setStands(null);
    backend
      .listStands()
      .then(setStands)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the stands."));
  }, []);
  useEffect(load, [load]);

  const priced = useMemo(() => (stands ?? []).filter((s) => s.sizeSqm), [stands]);
  // Bands span the whole campaign (all stands, sold or not) so a range keeps its meaning as stands sell.
  const bands = useMemo(() => priceBands(priced.map((s) => standPriceCents(s.sizeSqm!))), [priced]);
  const visible = useMemo(
    () => filterByBand(priced, filter).sort((a, b) => standPriceCents(a.sizeSqm!) - standPriceCents(b.sizeSqm!) || a.standNumber.localeCompare(b.standNumber)),
    [priced, filter],
  );
  const counts = useMemo(() => {
    const c = { A: 0, B: 0, C: 0 } as Record<PriceBandKey, number>;
    if (bands) priced.forEach((s) => c[bandOf(standPriceCents(s.sizeSqm!), bands)]++);
    return c;
  }, [priced, bands]);
  const available = priced.filter((s) => s.status === "available").length;

  return (
    <>
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, hsl(var(--gold)) 0, transparent 35%), radial-gradient(circle at 85% 70%, hsl(var(--gold)) 0, transparent 30%)",
          }}
          aria-hidden
        />
        <div className="container relative py-14 sm:py-20">
          <PlaceholderTag className="mb-5 bg-white/10 text-white">PLACEHOLDER campaign copy</PlaceholderTag>
          <h1 className="max-w-2xl font-serif text-4xl font-semibold leading-tight sm:text-5xl">
            Own your stand at LakeCity. {formatUsd(DUE_AT_START_USD * 100)} today, the balance over 48 months.
          </h1>
          <p className="mt-5 max-w-xl text-base text-primary-foreground/80 sm:text-lg">
            Every stand is priced at USD {PRICING.pricePerSqmUsd} per m², {PRICE_VAT_NOTE}. Pick your stand, complete the offer form and pay{" "}
            {formatUsd(PRICING.downPaymentUsd * 100)} down payment plus the {formatUsd(PRICING.legalFeeUsd * 100)} legal fee online.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button asChild size="lg" className="bg-gold text-gold-foreground hover:bg-gold/90">
              <a href="#stands">
                Browse stands <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <span className="text-sm text-primary-foreground/70">
              {stands === null ? "Checking availability…" : `${available} of ${priced.length} stands available`}
            </span>
          </div>
        </div>
      </section>

      <section id="stands" className="container scroll-mt-20 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl font-semibold sm:text-3xl">Choose your stand</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Filter by price range. All prices are USD {PRICING.pricePerSqmUsd} per m², {PRICE_VAT_NOTE}.
            </p>
          </div>
        </div>

        {bands && (
          <div className="mt-6 grid gap-2 sm:grid-cols-4" role="group" aria-label="Filter by price range">
            <FilterButton active={filter === "all"} onClick={() => setFilter("all")} title="All stands" sub={`${priced.length} stands`} testId="filter-all" />
            {bands.bands.map((b) => (
              <FilterButton
                key={b.key}
                active={filter === b.key}
                onClick={() => setFilter(b.key)}
                title={`Range ${b.key}`}
                sub={`${b.key === "C" ? formatUsd(b.fromCents) + " – " + formatUsd(b.toCents) : formatUsd(b.fromCents) + " – under " + formatUsd(b.toCents)} · ${counts[b.key]} stands`}
                testId={`filter-${b.key}`}
              />
            ))}
          </div>
        )}

        <div className="mt-6">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>We couldn't load the stands</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-3">
                {error}
                <Button size="sm" variant="outline" onClick={load}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" /> Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : stands === null ? (
            <div className="grid place-items-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading stands" />
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No stands in this range right now.</div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="stand-list">
              {visible.map((s) => (
                <StandCard key={s.standNumber} stand={s} band={bands ? bandOf(standPriceCents(s.sizeSqm!), bands) : undefined} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

function FilterButton({ active, onClick, title, sub, testId }: { active: boolean; onClick: () => void; title: string; sub: string; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={cn(
        "rounded-lg border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50",
      )}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className={cn("block text-xs", active ? "text-primary-foreground/80" : "text-muted-foreground")}>{sub}</span>
    </button>
  );
}

function StandCard({ stand, band }: { stand: Stand; band?: PriceBandKey }) {
  const sold = stand.status !== "available";
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Stand</p>
          <p className="font-serif text-2xl font-semibold">{stand.standNumber}</p>
        </div>
        {band && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">Range {band}</span>}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-sm">
        <p className="flex items-center gap-1.5" data-testid="stand-size">
          <Ruler className="h-3.5 w-3.5 text-gold" /> {stand.sizeSqm!.toLocaleString("en-US")} m²
        </p>
        {stand.phase && <p className="text-xs text-muted-foreground" data-testid="stand-phase">Phase {stand.phase}</p>}
      </div>
      <div className="mt-3 flex items-end justify-between border-t pt-3">
        <div>
          <p className="text-xs text-muted-foreground">Total price · {PRICE_VAT_NOTE}</p>
          <p className="font-semibold tabular-nums">{formatUsd(standPriceCents(stand.sizeSqm!))}</p>
        </div>
        {sold ? (
          <span className="text-xs font-semibold uppercase text-muted-foreground">Reserved</span>
        ) : (
          <span className="flex items-center text-sm font-semibold text-primary">
            Select <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </>
  );
  return (
    <li data-stand={stand.standNumber}>
      {sold ? (
        <div className="h-full rounded-xl border bg-muted/40 p-4 opacity-70" aria-disabled>
          {body}
        </div>
      ) : (
        <Link to={`/stands/${stand.standNumber}`} className="block h-full rounded-xl border bg-card p-4 transition-shadow hover:border-primary/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {body}
        </Link>
      )}
    </li>
  );
}
