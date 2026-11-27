import { useLayoutEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import logo from "@/assets/logo-wordmark-sea-green.svg";
import texture from "@/assets/stand-sales/luxe/texture-linen-stone.jpg";
import { cn } from "@/lib/utils";
import "./luxe.css";

export const STEPS = ["Stand", "Reserve", "Pay", "Welcome", "Portal", "Agreement"];

export function WizardFrame({ step, children }: { step: number; children: ReactNode }) {
  useLayoutEffect(() => {
    document.body.classList.add("stand-sales-luxe-active");
    return () => document.body.classList.remove("stand-sales-luxe-active");
  }, []);

  const progress = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <div className="stand-sales-luxe relative font-body text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.06]"
        style={{ backgroundImage: `url(${texture})`, backgroundSize: "720px auto" }}
      />
      <div className="relative z-10">
        <header className="border-b border-border/80">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5 md:px-8 md:py-7">
            <Link to="/stands" className="flex min-h-11 min-w-0 items-center gap-3">
              <img src={logo} alt="LakeCity" className="h-8 w-auto shrink-0 md:h-9" />
              <span className="hidden font-body text-[0.68rem] tracking-[0.16em] text-muted-foreground sm:inline">Stand sales</span>
            </Link>
            <p className="max-w-[9.5rem] shrink-0 text-right text-[0.7rem] leading-snug text-muted-foreground sm:max-w-none sm:text-xs">USD 2,250 due at the start</p>
          </div>
        </header>
        <nav aria-label="Reservation progress" className="mx-auto w-full max-w-6xl px-5 pt-8 md:px-8 md:pt-12">
          <div className="xl:hidden" aria-hidden="true">
            <p className="font-body text-sm text-primary">
              {STEPS[step]}
              <span className="text-muted-foreground"> · {step + 1} of {STEPS.length}</span>
            </p>
            <div className="mt-3 h-px w-full bg-[hsl(36_16%_84%)]">
              <div className="h-px bg-sl-gold" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <ol className="sr-only xl:not-sr-only xl:flex xl:items-center">
            {STEPS.map((label, index) => {
              const current = index === step;
              const done = index < step;
              return (
                <li key={label} aria-current={current ? "step" : undefined} className="flex min-w-0 flex-1 items-center">
                  <span
                    className={cn(
                      "inline-flex items-center gap-2 whitespace-nowrap border-b pb-1 text-[0.72rem] tracking-[0.04em]",
                      current ? "border-sl-gold text-primary" : "border-transparent text-muted-foreground",
                      done && "text-primary",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        current ? "bg-sl-gold" : done ? "bg-primary" : "bg-[hsl(36_12%_72%)]",
                      )}
                    />
                    {index + 1}. {label}
                  </span>
                  {index < STEPS.length - 1 && <span aria-hidden="true" className="mx-2 h-px min-w-3 flex-1 bg-[hsl(36_16%_82%)]" />}
                </li>
              );
            })}
          </ol>
        </nav>
        <main key={step} className="stand-sales-step mx-auto w-full max-w-6xl px-5 pb-20 pt-8 md:px-8 md:pt-12">
          {children}
        </main>
      </div>
    </div>
  );
}
