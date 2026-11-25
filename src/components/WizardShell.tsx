import { Check, Loader2 } from "lucide-react";
import { Navigate, useParams } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLead } from "@/hooks/useLead";
import type { Lead } from "@/lib/backend";
import { cn } from "@/lib/utils";
import { WIZARD_STEPS, currentStep, stepIndex, type WizardStep } from "@shared/domain/flow.ts";

const ALL_STEPS = [{ key: "stand", label: "Choose stand" }, ...WIZARD_STEPS];

export function WizardProgress({ active }: { active: WizardStep | "stand" }) {
  const activeIdx = ALL_STEPS.findIndex((s) => s.key === active);
  return (
    <ol className="flex w-full items-center gap-1 overflow-x-auto pb-1" aria-label="Progress">
      {ALL_STEPS.map((s, i) => {
        const done = i < activeIdx;
        const current = i === activeIdx;
        return (
          <li key={s.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              <div className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : done || current ? "bg-primary" : "bg-border")} />
              <span
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                  done && "border-primary bg-primary text-primary-foreground",
                  current && "border-gold bg-gold text-gold-foreground",
                  !done && !current && "border-border bg-white text-muted-foreground",
                )}
                aria-current={current ? "step" : undefined}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <div className={cn("h-0.5 flex-1", i === ALL_STEPS.length - 1 ? "bg-transparent" : done ? "bg-primary" : "bg-border")} />
            </div>
            <span className={cn("hidden text-center text-[11px] leading-tight sm:block", current ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

interface Props {
  step: WizardStep;
  wide?: boolean;
  children: (ctx: { lead: Lead; refresh: () => Promise<void> }) => React.ReactNode;
}

/** Loads the lead and prevents skipping ahead: later steps redirect to the current one. */
export function WizardShell({ step, wide, children }: Props) {
  const { leadId } = useParams();
  const { lead, loading, error, refresh } = useLead(leadId);

  if (loading) {
    return (
      <div className="container grid min-h-[50vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }
  if (error || !lead) {
    return (
      <div className="container max-w-xl py-16">
        <Alert variant="destructive">
          <AlertTitle>We couldn't load your application</AlertTitle>
          <AlertDescription>{error ?? "Not found."} Please start again from the stand list.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const allowed = currentStep(lead);
  if (stepIndex(step) > stepIndex(allowed)) {
    return <Navigate to={`/apply/${lead.id}/${allowed}`} replace />;
  }

  return (
    <div className={cn("container py-8 sm:py-12", wide ? "max-w-6xl" : "max-w-3xl")}>
      <div className="mx-auto mb-8 max-w-3xl">
        <WizardProgress active={step} />
      </div>
      {children({ lead, refresh })}
    </div>
  );
}

export function CurrentStepRedirect() {
  const { leadId } = useParams();
  const { lead, loading } = useLead(leadId);
  if (loading) return null;
  if (!lead) return <Navigate to="/" replace />;
  return <Navigate to={`/apply/${lead.id}/${currentStep(lead)}`} replace />;
}
