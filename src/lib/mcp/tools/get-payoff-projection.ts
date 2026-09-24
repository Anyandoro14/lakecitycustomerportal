import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  addMonths,
  errorResult,
  fetchMyStands,
  isoDate,
  money,
  pickStand,
  textResult,
  toNumber,
} from "../lib/stand";

export default defineTool({
  name: "get_payoff_projection",
  title: "How long until my stand is paid off",
  description:
    "Estimate how long it will take the signed-in customer to fully pay off their stand: months remaining, projected payoff date, amount still owing, percentage paid, and optional what-if scenarios showing how much sooner the stand is paid off with extra monthly payments. Figures come from the Collection Schedule, the authoritative ledger.",
  inputSchema: {
    stand_number: z
      .string()
      .optional()
      .describe("Stand number to project. Defaults to the customer's first stand."),
    extra_monthly_payment: z
      .number()
      .optional()
      .describe("Optional extra amount paid each month, used for a what-if payoff scenario."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ stand_number, extra_monthly_payment }, ctx) => {
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

    const balance = toNumber(stand.currentBalance ?? stand.standBalance);
    const monthly = toNumber(stand.monthlyPayment);
    const totalPrice = toNumber(stand.totalPrice);
    const totalPaid = toNumber(stand.totalPaid);

    if (monthly <= 0) {
      return textResult({
        stand_number: stand.standNumber,
        balance_outstanding: money(balance),
        note: "No monthly instalment amount is set on your schedule, so a payoff date cannot be projected. Please contact support.",
      });
    }

    const start = new Date();
    const project = (perMonth: number) => {
      if (perMonth <= 0 || balance <= 0) {
        return { months: 0, payoff_date: isoDate(start), final_payment: money(0) };
      }
      const months = Math.ceil(balance / perMonth);
      const remainder = balance - (months - 1) * perMonth;
      return {
        months,
        payoff_date: isoDate(addMonths(start, months)),
        final_payment: money(Math.max(remainder, 0)),
      };
    };

    const base = project(monthly);
    const extra = Math.max(extra_monthly_payment ?? 0, 0);
    const scenarios = [extra, monthly * 0.25, monthly]
      .filter((v, i, arr) => v > 0 && arr.indexOf(v) === i)
      .map((amount) => {
        const scenario = project(monthly + amount);
        return {
          extra_per_month: money(amount),
          new_monthly_payment: money(monthly + amount),
          months_remaining: scenario.months,
          projected_payoff_date: scenario.payoff_date,
          months_saved: Math.max(base.months - scenario.months, 0),
        };
      });

    const payload = {
      stand_number: stand.standNumber,
      currency: "USD",
      purchase_price: money(totalPrice),
      total_paid_to_date: money(totalPaid),
      balance_outstanding: money(balance),
      percent_paid: stand.progressPercentage ?? 0,
      monthly_instalment: money(monthly),
      is_overdue: !!stand.isOverdue,
      days_overdue: stand.daysOverdue ?? 0,
      payments_remaining: base.months,
      projected_payoff_date: base.payoff_date,
      final_payment_amount: base.final_payment,
      what_if_scenarios: scenarios,
      explanation:
        balance <= 0
          ? "Your stand is fully paid up — no further instalments are due."
          : `At ${money(monthly)} per month, ${base.months} more payment(s) clear the remaining ${money(balance)}. This schedule carries no interest, so paying extra shortens the term rather than reducing an interest cost.`,
    };

    return textResult(payload);
  },
});
