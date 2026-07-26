import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  errorResult,
  fetchMyStands,
  isoDate,
  money,
  parseLooseDate,
  pickStand,
  textResult,
  toNumber,
} from "../lib/stand";

export default defineTool({
  name: "get_my_payment_behaviour",
  title: "What has my payment frequency been",
  description:
    "Analyse the signed-in customer's actual payment history for their stand: how many payments they have made, how often (average and typical gap in days), total and average amount paid, longest gap without a payment, payments in the last 6 and 12 months, and a plain-language consistency rating. Useful for answering 'how regularly have I been paying?'.",
  inputSchema: {
    stand_number: z
      .string()
      .optional()
      .describe("Stand number to analyse. Defaults to the customer's first stand."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ stand_number }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");

    let stands;
    try {
      stands = await fetchMyStands(ctx);
    } catch (e) {
      return errorResult((e as Error).message);
    }

    const stand = pickStand(stands, stand_number);
    if (!stand) {
      return errorResult(
        stand_number
          ? `No stand ${stand_number} is linked to your account.`
          : "No stand data found for your account.",
      );
    }

    const history = stand.paymentHistory ?? [];
    const dated = history
      .map((entry) => ({
        date: parseLooseDate(entry.date),
        amount: toNumber(entry.total ?? entry.amount),
        method: entry.payment_method ?? null,
        reference: entry.reference ?? null,
      }))
      .filter((entry): entry is { date: Date; amount: number; method: string | null; reference: string | null } =>
        entry.date !== null,
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const deposits = history.filter((e) => /^deposit$/i.test(e.date?.trim() ?? ""));
    const totalPaid = toNumber(stand.totalPaid);
    const monthly = toNumber(stand.monthlyPayment);

    const gaps: number[] = [];
    for (let i = 1; i < dated.length; i++) {
      gaps.push(
        Math.round((dated[i].date.getTime() - dated[i - 1].date.getTime()) / 86_400_000),
      );
    }
    const average = (values: number[]) =>
      values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const median = (values: number[]) => {
      if (!values.length) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const now = Date.now();
    const within = (days: number) =>
      dated.filter((e) => now - e.date.getTime() <= days * 86_400_000);
    const last6 = within(182);
    const last12 = within(365);
    const avgGap = Math.round(average(gaps));
    const medianGap = Math.round(median(gaps));
    const daysSinceLast = dated.length
      ? Math.round((now - dated[dated.length - 1].date.getTime()) / 86_400_000)
      : null;

    let cadence = "Not enough payment history to detect a pattern yet.";
    if (medianGap > 0) {
      if (medianGap <= 10) cadence = "Roughly weekly payments.";
      else if (medianGap <= 20) cadence = "Roughly fortnightly payments.";
      else if (medianGap <= 45) cadence = "Roughly monthly payments — in line with the schedule.";
      else if (medianGap <= 100) cadence = "Roughly quarterly payments — slower than monthly.";
      else cadence = "Irregular, infrequent payments.";
    }

    let consistency = "insufficient_data";
    if (gaps.length >= 2) {
      const spread = Math.max(...gaps) - Math.min(...gaps);
      if (medianGap <= 45 && spread <= 20) consistency = "very_consistent";
      else if (medianGap <= 60 && spread <= 45) consistency = "consistent";
      else if (medianGap <= 100) consistency = "somewhat_irregular";
      else consistency = "irregular";
    }

    return textResult({
      stand_number: stand.standNumber,
      currency: "USD",
      monthly_instalment: money(monthly),
      total_paid_to_date: money(totalPaid),
      balance_outstanding: money(toNumber(stand.currentBalance ?? stand.standBalance)),
      payments_recorded: dated.length,
      deposit_recorded: deposits.length > 0,
      first_payment_date: dated.length ? isoDate(dated[0].date) : null,
      last_payment_date: dated.length ? isoDate(dated[dated.length - 1].date) : null,
      days_since_last_payment: daysSinceLast,
      average_days_between_payments: avgGap || null,
      typical_days_between_payments: medianGap || null,
      longest_gap_days: gaps.length ? Math.max(...gaps) : null,
      shortest_gap_days: gaps.length ? Math.min(...gaps) : null,
      average_payment_amount: money(average(dated.map((e) => e.amount))),
      largest_payment: dated.length ? money(Math.max(...dated.map((e) => e.amount))) : money(0),
      payments_last_6_months: last6.length,
      amount_last_6_months: money(last6.reduce((sum, e) => sum + e.amount, 0)),
      payments_last_12_months: last12.length,
      amount_last_12_months: money(last12.reduce((sum, e) => sum + e.amount, 0)),
      cadence_summary: cadence,
      consistency_rating: consistency,
      is_overdue: !!stand.isOverdue,
      days_overdue: stand.daysOverdue ?? 0,
      recent_payments: dated
        .slice(-12)
        .reverse()
        .map((e) => ({
          date: isoDate(e.date),
          amount: money(e.amount),
          method: e.method,
          reference: e.reference,
        })),
    });
  },
});
