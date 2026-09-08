import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForService, supabaseForUser } from "../service-client";

export default defineTool({
  name: "get_my_profile",
  title: "Get my profile",
  description:
    "Return a customer profile: stand number, email, and phone numbers used for 2FA. With a customer JWT this is the signed-in user. With LOVABLE_API_KEY, pass stand_number or email.",
  inputSchema: {
    stand_number: z
      .string()
      .optional()
      .describe("Stand number to look up. Required when authenticating with LOVABLE_API_KEY unless email is set."),
    email: z
      .string()
      .optional()
      .describe("Customer email to look up. Used with LOVABLE_API_KEY when stand_number is omitted."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ stand_number, email }, ctx) => {
    const select = "id, email, stand_number, phone_number, phone_number_2, full_name";
    let query;
    if (ctx.isAuthenticated()) {
      query = supabaseForUser(ctx).from("profiles").select(select).eq("id", ctx.getUserId());
    } else if (stand_number?.trim()) {
      query = supabaseForService()
        .from("profiles")
        .select(select)
        .ilike("stand_number", stand_number.trim());
    } else if (email?.trim()) {
      query = supabaseForService()
        .from("profiles")
        .select(select)
        .ilike("email", email.trim());
    } else {
      return {
        content: [{ type: "text", text: "stand_number or email is required when authenticating with LOVABLE_API_KEY" }],
        isError: true,
      };
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? null, null, 2) }],
      structuredContent: { profile: data ?? null },
    };
  },
});
