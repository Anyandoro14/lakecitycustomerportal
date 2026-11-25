// Payment schedule per LakeCity policy:
//   monthly instalment = (total price incl. VAT - deposit) / term months
// Amounts are handled in integer cents; the final instalment (and final deposit part) absorbs rounding.

import { CAMPAIGN } from "./campaign.ts";

export interface ScheduleInput {
  priceUsd: number;
  depositUsd: number;
  termMonths: number;
  depositInstalments: 1 | 3;
  dueDay: 1 | 5;
  /** Offer date (YYYY-MM-DD). The deposit (or first deposit part) is due on this date. */
  startDate: string;
  vatRatePercent?: number;
}

export interface ScheduleRow {
  no: number;
  kind: "deposit" | "instalment";
  label: string;
  dueDate: string;
  amountCents: number;
  balanceCents: number;
}

export interface PaymentSchedule {
  rows: ScheduleRow[];
  totalCents: number;
  vatCents: number;
  exVatCents: number;
  depositCents: number;
  financedCents: number;
  monthlyInstalmentCents: number;
  finalInstalmentCents: number;
  termMonths: number;
  dueDay: 1 | 5;
  depositInstalments: 1 | 3;
}

const toCents = (usd: number) => Math.round(usd * 100);

function split(totalCents: number, parts: number): number[] {
  const each = Math.round(totalCents / parts);
  const out = Array.from({ length: parts }, () => each);
  out[parts - 1] = totalCents - each * (parts - 1);
  return out;
}

/** Due date `monthsAfter` months after start, on `dueDay`. Uses UTC to avoid timezone drift. */
export function dueDateFor(startDate: string, monthsAfter: number, dueDay: number): string {
  const [y, m] = startDate.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + monthsAfter, dueDay));
  return d.toISOString().slice(0, 10);
}

export function computeSchedule(input: ScheduleInput): PaymentSchedule {
  const vatRate = input.vatRatePercent ?? CAMPAIGN.vatRatePercent;
  const totalCents = toCents(input.priceUsd);
  const depositCents = toCents(input.depositUsd);
  if (depositCents > totalCents) throw new Error("Deposit exceeds price");
  if (input.termMonths < 1) throw new Error("Term must be at least 1 month");

  const exVatCents = Math.round(totalCents / (1 + vatRate / 100));
  const financedCents = totalCents - depositCents;
  const instalments = split(financedCents, input.termMonths);
  const deposits = split(depositCents, input.depositInstalments);

  const rows: ScheduleRow[] = [];
  let balance = totalCents;
  let no = 1;
  deposits.forEach((amount, i) => {
    balance -= amount;
    rows.push({
      no: no++,
      kind: "deposit",
      label: input.depositInstalments === 1 ? "Initial deposit" : `Deposit ${i + 1} of ${input.depositInstalments}`,
      dueDate: i === 0 ? input.startDate : dueDateFor(input.startDate, i, input.dueDay),
      amountCents: amount,
      balanceCents: balance,
    });
  });
  // Instalments start the month after the deposit is fully paid (assumption TBC with LakeCity).
  instalments.forEach((amount, i) => {
    balance -= amount;
    rows.push({
      no: no++,
      kind: "instalment",
      label: `Instalment ${i + 1} of ${input.termMonths}`,
      dueDate: dueDateFor(input.startDate, input.depositInstalments + i, input.dueDay),
      amountCents: amount,
      balanceCents: balance,
    });
  });

  return {
    rows,
    totalCents,
    vatCents: totalCents - exVatCents,
    exVatCents,
    depositCents,
    financedCents,
    monthlyInstalmentCents: instalments[0],
    finalInstalmentCents: instalments[instalments.length - 1],
    termMonths: input.termMonths,
    dueDay: input.dueDay,
    depositInstalments: input.depositInstalments,
  };
}

export function formatCents(cents: number): string {
  return `USD ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
