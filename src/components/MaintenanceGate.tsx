import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle, Clock, X } from "lucide-react";

// ── Schedule (all times UTC — EST is UTC-4) ───────────────────
// Ribbon appears:    12:00 AM EST Apr 9 = 04:00 UTC Apr 9
// Maintenance starts: 2:00 AM EST Apr 9 = 06:00 UTC Apr 9
// Maintenance ends:   2:00 PM EST Apr 9 = 18:00 UTC Apr 9
const RIBBON_START = new Date("2026-04-09T04:00:00Z");
const MAINTENANCE_START = new Date("2026-04-09T06:00:00Z");
const MAINTENANCE_END = new Date("2026-04-09T18:00:00Z");

const MAINTENANCE_MESSAGE =
  "We are doing system maintenance. The site will be unavailable from 2 AM EST – 2 PM EST on April 9. Thank you for your patience.";

const RIBBON_MESSAGE =
  "Scheduled maintenance: April 9, 2 AM – 2 PM EST. The site will be briefly unavailable.";

// Routes that bypass maintenance (internal staff)
const BYPASS_PREFIXES = [
  "/internal",
  "/internal-portal",
  "/internal-login",
  "/internal-signup",
];
// ───────────────────────────────────────────────────────────────

function useSchedule() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const showRibbon = now >= RIBBON_START && now < MAINTENANCE_START;
  const showMaintenance = now >= MAINTENANCE_START && now < MAINTENANCE_END;

  return { showRibbon, showMaintenance };
}

/* ── Ribbon (pre-maintenance alert) ──────────────────────────── */
export function MaintenanceRibbon() {
  const { showRibbon } = useSchedule();
  const [dismissed, setDismissed] = useState(false);
  const { pathname } = useLocation();

  const isBypassed = BYPASS_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (!showRibbon || dismissed || isBypassed) return null;

  return (
    <div className="relative bg-amber-500/90 text-white backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5 text-sm font-medium">
        <Clock className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1">{RIBBON_MESSAGE}</span>
        <button
          onClick={() => setDismissed(true)}
          className="flex-shrink-0 rounded-full p-1 transition-colors hover:bg-white/20"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ── Full-page maintenance gate ──────────────────────────────── */
export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { showMaintenance } = useSchedule();

  if (!showMaintenance) return <>{children}</>;

  const isBypassed = BYPASS_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isBypassed) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Icon */}
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-500/10">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            We'll be right back
          </h1>
          <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            Scheduled Maintenance
          </p>
        </div>

        {/* Message */}
        <p className="text-muted-foreground leading-relaxed text-base">
          {MAINTENANCE_MESSAGE}
        </p>

        {/* Time window */}
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-5 py-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>April 9 · 2 AM – 2 PM EST</span>
        </div>
      </div>
    </div>
  );
}
