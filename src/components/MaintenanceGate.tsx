import { useLocation } from "react-router-dom";

// ── Toggle maintenance mode here ──────────────────────────────
const MAINTENANCE_ENABLED = true;

const MAINTENANCE_MESSAGE =
  "We are doing system maintenance. The site will be unavailable from 2 AM EST April 9 – 12 PM EST April 10. Thank you for your patience.";

// Routes that bypass maintenance (internal staff)
const BYPASS_PREFIXES = [
  "/internal",
  "/internal-portal",
  "/internal-login",
  "/internal-signup",
];
// ───────────────────────────────────────────────────────────────

export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();

  if (!MAINTENANCE_ENABLED) return <>{children}</>;

  const isBypassed = BYPASS_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );

  if (isBypassed) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-lg w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-8 h-8 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-foreground">System Maintenance</h1>
        <p className="text-muted-foreground leading-relaxed">{MAINTENANCE_MESSAGE}</p>
      </div>
    </div>
  );
}
