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
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneClasses[info.tone],
        className,
      )}
    >
      {info.label}
    </span>
  );
};

export default PaymentStatusBadge;
