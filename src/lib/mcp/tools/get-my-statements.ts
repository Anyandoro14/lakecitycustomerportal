import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForService, supabaseForUser } from "../service-client";

export default defineTool({
  name: "get_my_statements",
  title: "Get my monthly statements",
  description:
    "Return monthly statements for a stand: month, opening balance, payments received, closing balance, and overdue status. Ordered newest first. With LOVABLE_API_KEY, pass stand_number.",
  inputSchema: {
    stand_number: z
      .string()
      .optional()
      .describe("Stand number to load. Required when authenticating with LOVABLE_API_KEY."),
    limit: z
      .number()
      .int()
      .optional()
      .describe("Maximum number of statements to return. Defaults to 24."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ stand_number, limit }, ctx) => {
    let resolvedStand = stand_number?.trim() || "";
    const client = ctx.isAuthenticated() ? supabaseForUser(ctx) : supabaseForService();

    if (ctx.isAuthenticated() && !resolvedStand) {
      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("stand_number")
        .eq("id", ctx.getUserId())
        .maybeSingle();

      if (profileError) {
        return { content: [{ type: "text", text: profileError.message }], isError: true };
      }
      resolvedStand = profile?.stand_number?.toString().trim() || "";
    }

    if (!resolvedStand) {
      return {
        content: [{
          type: "text",
          text: ctx.isAuthenticated()
            ? "No stand number is linked to your account."
            : "stand_number is required when authenticating with LOVABLE_API_KEY",
        }],
        structuredContent: { statements: [] },
      };
    }

    const cap = Math.min(Math.max(limit ?? 24, 1), 120);
    const { data, error } = await client
      .from("monthly_statements")
      .select(
        "statement_month, opening_balance, payments_received, total_payments, closing_balance, is_overdue, days_overdue, generated_at",
      )
      .eq("stand_number", resolvedStand)
      .order("statement_month", { ascending: false })
      .limit(cap);

    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { stand_number: resolvedStand, statements: data ?? [] },
            null,
            2,
          ),
        },
      ],
      structuredContent: { stand_number: resolvedStand, statements: data ?? [] },
    };
  },
});
