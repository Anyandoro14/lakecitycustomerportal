import { Link, Outlet, useLocation } from "react-router-dom";
import { useSupabase } from "@/config";
import { PlaceholderTag } from "./Placeholder";

export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={
          "grid h-8 w-8 place-items-center rounded-md border-2 border-gold font-serif text-sm font-bold " +
          (inverted ? "text-white" : "text-primary")
        }
        aria-hidden
      >
        LC
      </span>
      <span className={"font-serif text-lg font-semibold tracking-tight " + (inverted ? "text-white" : "text-primary")}>
        LakeCity
      </span>
    </span>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const internal = pathname.startsWith("/internal");
  return (
    <div className="flex min-h-screen flex-col">
      {!useSupabase && (
        <div className="bg-gold/15 px-4 py-1.5 text-center text-xs text-accent-foreground">
          Local demo mode: data stays in this browser. No payments are taken and no emails are sent.
        </div>
      )}
      <header className="border-b bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" aria-label="LakeCity home">
            <Logo />
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {internal ? (
              <>
                <Link className="text-muted-foreground hover:text-foreground" to="/internal">Leads</Link>
                <Link className="text-muted-foreground hover:text-foreground" to="/internal/outbox">Email outbox</Link>
              </>
            ) : (
              <PlaceholderTag>Placeholder design</PlaceholderTag>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t bg-primary text-primary-foreground/80">
        <div className="container flex flex-col gap-2 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span>© LakeCity. PLACEHOLDER footer copy.</span>
          <span>
            Questions? <a className="underline" href="mailto:accounts@lakecity.co.zw">accounts@lakecity.co.zw</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
