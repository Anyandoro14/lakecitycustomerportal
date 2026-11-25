import { Check, Copy, Lock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatUsd } from "@shared/domain/schedule.ts";

/** Auto-populated value the customer copies into ZikiMall. Read-only by design: it can never be changed here. */
export function LockedField({ id, label, value, hint, copyLabel }: { id: string; label: string; value: string; hint?: string; copyLabel: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={id}
            name={id}
            value={value}
            readOnly
            aria-readonly="true"
            tabIndex={-1}
            onChange={() => undefined}
            className="cursor-not-allowed bg-muted pr-10 text-lg font-semibold tabular-nums"
          />
          <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        </div>
        <Button type="button" variant="outline" className="h-10 shrink-0" onClick={() => void copy()} aria-label={copyLabel} data-testid={`${id}-copy`}>
          {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
          <span className="ml-1.5 hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Auto-populated payment amount: the customer can never change what is charged. */
export function LockedAmountField({ id, label, amountCents }: { id: string; label: string; amountCents: number }) {
  return (
    <LockedField
      id={id}
      label={label}
      value={formatUsd(amountCents)}
      copyLabel="Copy amount"
      hint="Down payment + legal fee. This amount is set by LakeCity and can't be changed."
    />
  );
}
