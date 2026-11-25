import { rowToLead, rowToStand } from "../domain/rows.ts";
import type { Lead, Stand } from "../domain/types.ts";
import { adminClient, HttpError, sha256Hex, timingSafeEqual } from "./http.ts";

export async function loadLead(leadId: string): Promise<Lead> {
  const { data, error } = await adminClient().from("leads").select("*").eq("id", leadId).maybeSingle();
  if (error) throw new HttpError(500, "Could not load application.");
  if (!data) throw new HttpError(404, "Application not found.");
  return rowToLead(data);
}

/** Customers authenticate per lead with the random access token issued when the application starts. */
export async function loadLeadForCustomer(leadId: unknown, accessToken: unknown): Promise<Lead> {
  if (typeof leadId !== "string" || typeof accessToken !== "string") throw new HttpError(400, "Missing credentials.");
  const { data } = await adminClient().from("leads").select("access_token_hash").eq("id", leadId).maybeSingle();
  const hash = await sha256Hex(accessToken);
  if (!data || !timingSafeEqual(data.access_token_hash, hash)) throw new HttpError(403, "Not allowed.");
  return loadLead(leadId);
}

export async function loadStand(standNumber: string): Promise<Stand> {
  const { data } = await adminClient().from("stands").select("*").eq("stand_number", standNumber).single();
  if (!data) throw new HttpError(404, "Stand not found.");
  return rowToStand(data);
}

export async function updateLead(leadId: string, patch: Record<string, unknown>) {
  const { error } = await adminClient().from("leads").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", leadId);
  if (error) throw new HttpError(500, "Could not update application.");
}
