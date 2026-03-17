import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a training assistant for LakeCity's Finance & Accounting team. You help trainees understand:

- LakeCity's property sales and payment collection system (called StandLedger)
- Accounting concepts as they relate to property sales: receivables, payment schedules, deposits, collections
- Internal controls: segregation of duties, audit trails, reconciliation
- The system's data flow: Google Form → automation → system → collection schedule (ledger)
- User roles and access control in the internal portal
- Quality control processes for payment verification
- Reporting and financial oversight

IMPORTANT RULES:
1. Explain concepts using ACCOUNTING language, not programming/technical language
2. Think in terms of ledgers, journal entries, reconciliation, and controls
3. Use "Alex Nyandoro" as the example customer when needed
4. If you are uncertain about a specific system behavior, say: "I'd recommend confirming this with the training lead. Would you like me to escalate this question?"
5. Do NOT explain code, database schemas, or technical implementation details
6. Focus on: logic, integrity, traceability, and accounting principles
7. Keep answers clear, concise, and professional
8. If asked about something outside LakeCity/accounting scope, politely redirect`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, moduleId, moduleTitle } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("AI service not configured");

    const contextNote = moduleTitle
      ? `\n\nThe trainee is currently studying Module: "${moduleTitle}". Tailor your answers to be relevant to this module's content.`
      : "";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + contextNote },
          ...messages,
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ reply: "I'm receiving too many requests right now. Please try again in a moment." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ reply: "The AI service is temporarily unavailable. Please use the 'Ask a Question' feature to reach the training lead directly." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "I couldn't generate a response. Please try rephrasing your question.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Training AI error:", e);
    return new Response(
      JSON.stringify({ reply: "I'm having trouble right now. Please use the 'Ask a Question' feature below to reach the training lead." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
