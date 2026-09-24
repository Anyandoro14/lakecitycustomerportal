import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "get_my_statements",
  title: "Get my monthly statements",
  description:
    "Return monthly statements for the signed-in customer's stand: month, opening balance, payments received, closing balance, and overdue status. Ordered newest first.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .optional()
      .describe("Maximum number of statements to return. Defaults to 24."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const client = supabaseForUser(ctx);

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("stand_number")
      .eq("id", ctx.getUserId())
      .maybeSingle();

    if (profileError) {
      return { content: [{ type: "text", text: profileError.message }], isError: true };
    }
    if (!profile?.stand_number) {
      return {
        content: [{ type: "text", text: "No stand number is linked to your account." }],
        structuredContent: { statements: [] },
      };
    }

    const cap = Math.min(Math.max(limit ?? 24, 1), 120);
    const { data, error } = await client
      .from("monthly_statements")
      .select(
        "statement_month, opening_balance, payments_received, total_payments, closing_balance, is_overdue, days_overdue, generated_at",
      )
      .eq("stand_number", profile.stand_number)
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
            { stand_number: profile.stand_number, statements: data ?? [] },
            null,
            2,
          ),
        },
      ],
      structuredContent: { stand_number: profile.stand_number, statements: data ?? [] },
    };
  },
});
