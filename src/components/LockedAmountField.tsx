import { Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatUsd } from "@shared/domain/schedule.ts";

/** Auto-populated payment amount. Read-only by design: the customer can never change what is charged. */
export function LockedAmountField({ id, label, amountCents }: { id: string; label: string; amountCents: number }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={id}
          value={formatUsd(amountCents)}
          readOnly
          aria-readonly="true"
          tabIndex={-1}
          onChange={() => undefined}
          className="cursor-not-allowed bg-muted pr-10 text-lg font-semibold tabular-nums"
        />
        <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      </div>
      <p className="text-xs text-muted-foreground">Down payment + legal fee. This amount is set by LakeCity and can't be changed.</p>
    </div>
  );
}
