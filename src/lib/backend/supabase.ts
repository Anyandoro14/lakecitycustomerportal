import { createClient } from "@supabase/supabase-js";
import { config, useSupabase } from "@/config";
import { rowToLead, rowToStand } from "@shared/domain/rows.ts";
import type { Backend } from "./types";
import type { OutboxEmailRecord } from "./models";
import type { PaymentIssue } from "./types";

const STALE_ATTEMPT_MS = 30 * 60_000;
const unconfirmedReason = (status: string) => `Last seen "${status}" from iVeri, not approved; check iVeri BackOffice`;

// Only constructed when Supabase env vars are present; mock mode never touches it.
const supabase = useSupabase
  ? createClient(config.supabaseUrl, config.supabaseAnonKey)
  : (null as unknown as ReturnType<typeof createClient>);

// Same-device access token per application. Opening the offer link on another device is OI-TBC-19.
const tokenKey = (leadId: string) => `lakecity-lead-token:${leadId}`;

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const parsed = ctx ? await ctx.json().catch(() => null) : null;
    throw new Error(parsed?.error ?? error.message);
  }
  return data as T;
}

async function leadApi<T>(action: string, leadId: string, extra: Record<string, unknown> = {}): Promise<T> {
  const accessToken = localStorage.getItem(tokenKey(leadId));
  if (!accessToken) throw new Error("This application was started on another device or browser.");
  return invoke<T>("lead-api", { action, leadId, accessToken, ...extra });
}

export const supabaseBackend: Backend = {
  mode: "supabase",

  async listStands() {
    const { data, error } = await supabase.from("stands").select("*").order("stand_number");
    if (error) throw error;
    return (data ?? []).map(rowToStand);
  },

  async startApplication(input) {
    const data = await invoke<{ leadId: string; accessToken: string }>("lead-intake", input);
    localStorage.setItem(tokenKey(data.leadId), data.accessToken);
    return { leadId: data.leadId };
  },

  async getLead(leadId) {
    if (!localStorage.getItem(tokenKey(leadId))) return null;
    const { lead } = await leadApi<{ lead: ReturnType<typeof rowToLead> }>("get", leadId);
    return lead;
  },
  async submitOffer(leadId, offer) {
    await leadApi("submit-offer", leadId, { offer });
  },
  startPayment: (leadId) => leadApi("start-payment", leadId),
  paymentResult: (leadId, reference, kind) => leadApi("payment-result", leadId, { reference, kind }),
  checkPayment: (leadId) => leadApi("check-payment", leadId),
  simulateCardResult: (leadId, reference, cardStatus) => leadApi("simulate-payment", leadId, { reference, cardStatus }),
  async enrolPortal(leadId, input) {
    await leadApi("enrol-portal", leadId, input);
  },

  async staffSession() {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const { data: row } = await supabase.from("staff_users").select("email").eq("user_id", user.id).maybeSingle();
    return { email: user.email ?? "", isStaff: !!row };
  },
  async staffSignIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },
  async staffSignOut() {
    await supabase.auth.signOut();
  },
  async listLeads() {
    const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToLead);
  },
  async setOfficialUse(leadId, value) {
    const { error } = await supabase.rpc("set_offer_official_use", { p_lead_id: leadId, p_official_use: value });
    if (error) throw error;
  },
  async listOutbox() {
    const { data, error } = await supabase.from("email_outbox").select("*").order("created_at");
    if (error) throw error;
    return (data ?? []).map(
      (r): OutboxEmailRecord => ({
        id: r.id,
        leadId: r.lead_id,
        template: r.template,
        to: r.to_email,
        subject: r.subject,
        props: r.props,
        attachmentNames: r.attachment_names ?? [],
        status: "queued_dev_only",
        createdAt: r.created_at,
      }),
    );
  },
  async listPaymentIssues() {
    const staleBefore = new Date(Date.now() - STALE_ATTEMPT_MS).toISOString();
    const [attempts, recorded] = await Promise.all([
      supabase
        .from("payment_attempts")
        .select("reference, stand_number, lead_id, status, card_status, created_at")
        .neq("status", "approved")
        .or(`and(status.eq.error,card_status.eq.0),created_at.lt.${staleBefore}`),
      supabase
      .from("payment_events")
      .select("reference, stand_number, lead_id, outcome, reason, created_at")
      .neq("outcome", "applied"),
    ]);
    if (attempts.error) throw attempts.error;
    if (recorded.error) throw recorded.error;
    const fromEvents = (recorded.data ?? []).map(
      (r): PaymentIssue => ({ reference: r.reference, standNumber: r.stand_number, leadId: r.lead_id, outcome: r.outcome, reason: r.reason, createdAt: r.created_at }),
    );
    const seen = new Set(fromEvents.map((i) => i.reference));
    const fromAttempts = (attempts.data ?? [])
      .filter((r) => !seen.has(r.reference))
      .map(
        (r): PaymentIssue => ({
          reference: r.reference,
          standNumber: r.stand_number,
          leadId: r.lead_id,
          outcome: r.status === "error" && r.card_status === 0 ? "needs_check" : "unconfirmed",
          reason: r.status === "error" && r.card_status === 0 ? "AuthoriseInfo details didn't match the attempt" : unconfirmedReason(r.status),
          createdAt: r.created_at,
        }),
      );
    return [...fromEvents, ...fromAttempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};
