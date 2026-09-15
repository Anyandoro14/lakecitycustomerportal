import { normalizePaymentStatus, toneClasses } from "@/lib/paynowStatus";
import { cn } from "@/lib/utils";

interface PaymentStatusBadgeProps {
  status?: string | null;
  className?: string;
}

/** Consistent Paynow status badge used anywhere payments are listed. */
const PaymentStatusBadge = ({ status, className }: PaymentStatusBadgeProps) => {
  const info = normalizePaymentStatus(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider",
        toneClasses[info.tone],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {info.label}
    </span>
  );
};

export default PaymentStatusBadge;
