import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  addMonths,
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
  name: "get_payment_schedule",
  title: "Show my payment schedule",
  description:
    "Return the signed-in customer's remaining instalment schedule for their stand: each upcoming due date, the amount due, and the balance left after that payment, plus a summary of the purchase price, deposit, amount paid and instalments already completed.",
  inputSchema: {
    stand_number: z
      .string()
      .optional()
      .describe("Stand number to show. Defaults to the customer's first stand."),
    months: z
      .number()
      .int()
      .optional()
      .describe("How many upcoming instalments to list. Defaults to 12, maximum 120."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ stand_number, months }, ctx) => {
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
    const cap = Math.min(Math.max(months ?? 12, 1), 120);
    const firstDue = parseLooseDate(stand.nextPaymentDate) ?? new Date();

    const schedule: Array<Record<string, unknown>> = [];
    let remaining = balance;
    for (let i = 0; i < cap && remaining > 0.01 && monthly > 0; i++) {
      const due = Math.min(monthly, remaining);
      remaining = Math.max(remaining - due, 0);
      schedule.push({
        installment: i + 1,
        due_date: isoDate(addMonths(firstDue, i)),
        amount_due: money(due),
        balance_after: money(remaining),
        is_final_payment: remaining <= 0.01,
      });
    }

    const completed = stand.paymentHistory?.length ?? 0;

    return textResult({
      stand_number: stand.standNumber,
      currency: "USD",
      purchase_price: money(toNumber(stand.totalPrice)),
      deposit: money(toNumber(stand.deposit)),
      total_paid_to_date: money(toNumber(stand.totalPaid)),
      balance_outstanding: money(balance),
      monthly_instalment: money(monthly),
      percent_paid: stand.progressPercentage ?? 0,
      payments_recorded_to_date: completed,
      next_payment_due: stand.nextPaymentDate || null,
      next_payment_amount: money(toNumber(stand.nextPayment)),
      is_overdue: !!stand.isOverdue,
      days_overdue: stand.daysOverdue ?? 0,
      upcoming_schedule: schedule,
      schedule_truncated: monthly > 0 && remaining > 0.01,
      note: "This schedule is interest-free: each instalment reduces the outstanding balance directly.",
    });
  },
});
