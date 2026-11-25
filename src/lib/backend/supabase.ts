import { createClient } from "@supabase/supabase-js";
import { config, useSupabase } from "@/config";
import { rowToLead, rowToStand } from "@shared/domain/rows.ts";
import type { Backend } from "./types";
import type { IdReviewLogEntry, OutboxEmailRecord } from "./models";

// Only constructed when Supabase env vars are present; mock mode never touches it.
const supabase = useSupabase
  ? createClient(config.supabaseUrl, config.supabaseAnonKey)
  : (null as unknown as ReturnType<typeof createClient>);

const tokenKey = (leadId: string) => `lakecity-lead-token:${leadId}`;

async function leadApi<T>(action: string, leadId: string, extra: Record<string, unknown> = {}): Promise<T> {
  const accessToken = localStorage.getItem(tokenKey(leadId));
  if (!accessToken) throw new Error("This application was started on another device or browser.");
  const { data, error } = await supabase.functions.invoke("lead-api", {
    body: { action, leadId, accessToken, ...extra },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const body = ctx ? await ctx.json().catch(() => null) : null;
    throw new Error(body?.error ?? error.message);
  }
  return data as T;
}

export const supabaseBackend: Backend = {
  mode: "supabase",

  async listStands() {
    const { data, error } = await supabase.from("stands").select("*").order("stand_number");
    if (error) throw error;
    return (data ?? []).map(rowToStand);
  },

  async submitIntake(input) {
    const form = new FormData();
    const strip = <T extends { idFront: Blob; idBack: Blob | null }>({ idFront: _f, idBack: _b, ...rest }: T) => rest;
    form.append(
      "payload",
      JSON.stringify({ buyer: strip(input.buyer), coOwners: input.coOwners.map(strip), standNumber: input.standNumber }),
    );
    form.append("buyer_front", input.buyer.idFront);
    if (input.buyer.idBack) form.append("buyer_back", input.buyer.idBack);
    input.coOwners.forEach((c, i) => {
      form.append(`coowner${i + 1}_front`, c.idFront);
      if (c.idBack) form.append(`coowner${i + 1}_back`, c.idBack);
    });
    const { data, error } = await supabase.functions.invoke("lead-intake", { body: form });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      const body = ctx ? await ctx.json().catch(() => null) : null;
      throw new Error(body?.error ?? error.message);
    }
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
  async acceptSchedule(leadId) {
    await leadApi("accept-schedule", leadId);
  },
  startPayment: (leadId) => leadApi("start-payment", leadId),
  async simulatePaymentConfirmed(leadId) {
    await leadApi("simulate-payment", leadId);
  },
  getSigningSession: (leadId, returnUrl) =>
    leadApi("signing-session", leadId, { returnUrl, origin: window.location.origin }),
  async simulateSigningCompleted(leadId) {
    await leadApi("simulate-signing", leadId);
  },
  async activatePortal(leadId, method) {
    await leadApi("activate-portal", leadId, { method });
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
    const { data, error } = await supabase
      .from("leads")
      .select("*, co_owners(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToLead);
  },
  async listReviewLog(leadId) {
    const { data, error } = await supabase
      .from("id_review_log")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at");
    if (error) throw error;
    return (data ?? []).map(
      (r): IdReviewLogEntry => ({
        id: r.id,
        leadId: r.lead_id,
        decision: r.decision,
        reason: r.reason,
        reviewer: r.reviewer,
        createdAt: r.created_at,
      }),
    );
  },
  async getIdDocumentUrl(path) {
    // Private bucket + staff-only storage policy; URL expires after 5 minutes.
    const { data, error } = await supabase.storage.from("id-documents").createSignedUrl(path, 300);
    if (error) return null;
    return data.signedUrl;
  },
  async reviewId(leadId, decision, reason) {
    const { error } = await supabase.rpc("review_id", { p_lead_id: leadId, p_decision: decision, p_reason: reason });
    if (error) throw error;
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
};
