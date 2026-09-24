import type { ToolContext } from "@lovable.dev/mcp-js";

export type PaymentHistoryEntry = {
  date: string;
  amount: string;
  total?: string;
  reference?: string;
  payment_method?: string;
};

export type StandData = {
  standNumber: string;
  customerName: string;
  standBalance: string;
  currentBalance: string;
  totalPrice: string;
  deposit: string;
  monthlyPayment: string;
  totalPaid: string;
  nextPayment: string;
  nextPaymentDate: string;
  paymentStartDate: string;
  isOverdue: boolean;
  daysOverdue: number;
  progressPercentage: number;
  paymentHistory: PaymentHistoryEntry[];
};

/** Money strings from the Collection Schedule look like "$1,234.56" or "-". */
export function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function money(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, daysInMonth));
  return next;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseLooseDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || /^deposit$/i.test(trimmed)) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The Google Sheet "Collection Schedule" is the source of truth for all
 * financial figures, so every insight tool reads through the same edge
 * function the portal dashboard uses.
 */
export async function fetchMyStands(ctx: ToolContext): Promise<StandData[]> {
  const url = `${process.env.SUPABASE_URL}/functions/v1/fetch-google-sheets`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_PUBLISHABLE_KEY!,
      Authorization: `Bearer ${ctx.getToken()}`,
    },
    body: JSON.stringify({}),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error || `Could not load your account data (${response.status})`);
  }
  return (payload?.stands ?? []) as StandData[];
}

export function pickStand(stands: StandData[], standNumber?: string): StandData | null {
  if (!stands.length) return null;
  if (!standNumber) return stands[0];
  const wanted = standNumber.trim().toUpperCase();
  return (
    stands.find((s) => (s.standNumber || "").trim().toUpperCase() === wanted) ?? null
  );
}

export function textResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

export function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}
