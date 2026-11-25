// Collection schedule for one stand:
//   row 1: down payment + legal fee, due on the start date (paid by card at the payment step)
//   rows 2..49: monthly instalments = (price - down payment) / 48, on the due day of each month
// Integer cents throughout; the final instalment absorbs rounding.
// When instalments start (month after payment, assumed) is TBC (OI-TBC-11).

import { CAMPAIGN, quoteForSize, type StandQuote } from "./campaign.ts";

export interface ScheduleRow {
  no: number;
  kind: "due_now" | "instalment";
  label: string;
  dueDate: string;
  amountCents: number;
  /** Outstanding balance of the stand price after this row (legal fee excluded). */
  balanceCents: number;
}

export interface PaymentSchedule {
  quote: StandQuote;
  rows: ScheduleRow[];
  dueDay: 1 | 5;
}

/** Due date `monthsAfter` months after start, on `dueDay`. Uses UTC to avoid timezone drift. */
export function dueDateFor(startDate: string, monthsAfter: number, dueDay: number): string {
  const [y, m] = startDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + monthsAfter, dueDay)).toISOString().slice(0, 10);
}

export function computeSchedule(input: { sizeSqm: number; startDate: string; dueDay?: 1 | 5 }): PaymentSchedule {
  const dueDay = input.dueDay ?? CAMPAIGN.dueDay;
  const quote = quoteForSize(input.sizeSqm);
  let balance = quote.priceCents - quote.downPaymentCents;
  const rows: ScheduleRow[] = [
    {
      no: 1,
      kind: "due_now",
      label: "Down payment + legal fee",
      dueDate: input.startDate,
      amountCents: quote.dueNowCents,
      balanceCents: balance,
    },
  ];
  for (let i = 0; i < quote.termMonths; i++) {
    const amount = i === quote.termMonths - 1 ? quote.finalMonthlyCents : quote.monthlyCents;
    balance -= amount;
    rows.push({
      no: i + 2,
      kind: "instalment",
      label: `Instalment ${i + 1} of ${quote.termMonths}`,
      dueDate: dueDateFor(input.startDate, i + 1, dueDay),
      amountCents: amount,
      balanceCents: balance,
    });
  }
  return { quote, rows, dueDay };
}

export function formatCents(cents: number): string {
  return `USD ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
