import { cn } from "@/lib/utils";

/** Visible marker for copy that is not final. */
export function PlaceholderTag({ className, children = "PLACEHOLDER" }: { className?: string; children?: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border border-dashed border-gold bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function TbcValue({ children }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children ?? "TBC"}
      <PlaceholderTag>TBC</PlaceholderTag>
    </span>
  );
}
