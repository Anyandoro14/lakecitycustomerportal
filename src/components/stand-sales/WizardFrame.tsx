import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import logo from "@/assets/logo-wordmark-sea-green.svg";

export const STEPS = ["Stand", "Reserve", "Pay", "Welcome", "Portal", "Agreement"];

export function WizardFrame({ step, children }: { step: number; children: ReactNode }) {
  return (
    <div className="bg-background font-body text-foreground">
      <header className="border-b bg-card">
        <div className="container flex items-center justify-between py-4">
          <Link to="/stands" className="flex items-center gap-3">
            <img src={logo} alt="LakeCity" className="h-8" />
            <span className="font-display text-lg">Stand sales</span>
          </Link>
          <p className="hidden text-sm text-muted-foreground sm:block">USD 2,250 due at the start</p>
        </div>
      </header>
      <ol className="container flex flex-wrap gap-2 py-4 text-xs">
        {STEPS.map((label, index) => (
          <li key={label} className={index === step ? "rounded-full bg-primary px-3 py-1 text-primary-foreground" : "rounded-full border px-3 py-1 text-muted-foreground"}>
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      <main className="container pb-16">{children}</main>
    </div>
  );
}
