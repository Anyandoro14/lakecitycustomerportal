// Supabase adapter for the stand-sales store. Service role only.

import { decorateStands, staffRowFromAttempt, type PaymentAttempt, type SalesApplication, type SalesStore } from "./stand-sales-service.ts";
import type { ApplyPaymentInput, ApplyStatus } from "./iveri.ts";

// Generated database types do not include the wizard tables yet. The client is
// thenable, so the adapter only depends on that shape.
type Thenable = PromiseLike<{ data: unknown; error: { message?: string } | null }>;

interface Query extends Thenable {
  eq(column: string, value: unknown): Query;
  neq(column: string, value: unknown): Query;
  is(column: string, value: null): Query;
  in(column: string, values: unknown[]): Query;
  or(filters: string): Query;
  order(column: string, options: { ascending: boolean }): Query;
  select(columns?: string): Query;
  maybeSingle(): Thenable;
  single(): Thenable;
}

interface Table {
  select(columns?: string): Query;
  insert(row: Record<string, unknown>): Query;
  update(row: Record<string, unknown>): Query;
}

interface Db {
  from(table: string): Table;
  rpc(fn: string, args: Record<string, unknown>): Thenable;
  auth: {
    admin: {
      createUser(input: Record<string, unknown>): Promise<{ data: { user: { id: string } | null }; error: { message?: string } | null }>;
    };
  };
}

function rowApp(row: Record<string, unknown>): SalesApplication {
  return {
    id: String(row.id),
    standNumber: String(row.stand_number),
    standInventoryId: String(row.stand_inventory_id),
    fullName: String(row.full_name),
    email: String(row.email),
    phone: String(row.phone),
    stage: row.stage as SalesApplication["stage"],
    offer: (row.offer as Record<string, unknown> | null) ?? null,
    paidAt: row.paid_at ? String(row.paid_at) : null,
    paymentReference: row.payment_reference ? String(row.payment_reference) : null,
    paymentAmountCents: row.payment_amount_cents == null ? null : Number(row.payment_amount_cents),
    portalUserId: row.portal_user_id ? String(row.portal_user_id) : null,
    accessTokenHash: String(row.access_token_hash),
  };
}

function rowAttempt(row: Record<string, unknown>): PaymentAttempt {
  return {
    reference: String(row.reference),
    applicationId: String(row.application_id),
    standNumber: String(row.stand_number),
    amountCents: Number(row.amount_cents),
    nonce: String(row.nonce),
    status: row.status as PaymentAttempt["status"],
    cardStatus: row.card_status == null ? null : Number(row.card_status),
    createdAt: String(row.created_at),
    dismissedAt: row.dismissed_at ? String(row.dismissed_at) : null,
  };
}

function asRows(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? data.filter((row): row is Record<string, unknown> => !!row && typeof row === "object") : [];
}

function asRow(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
}

async function must(result: { data: unknown; error: { message?: string } | null }, where: string): Promise<unknown> {
  if (result.error) {
    console.error(`[stand-sales] ${where} failed`, result.error.message ?? "unknown");
    throw new Error("Something went wrong. Please try again.");
  }
  return result.data;
}

export function createSupabaseStore(db: Db, tenantId: string): SalesStore {
  return {
    async listStands() {
      const stands = await must(
        await db.from("stand_inventory").select("id, stand_number, phase, land_use, area_sqm, status, wizard_sale_status").eq("tenant_id", tenantId).eq("campaign_stand", true),
        "list stands",
      );
      const paid = await must(
        await db.from("stand_sales_applications").select("stand_number").eq("tenant_id", tenantId).eq("stage", "paid"),
        "list paid",
      );
      const paidSet = new Set(asRows(paid).map((row) => String(row.stand_number)));
      return decorateStands(
        asRows(stands).map((row) => ({
          standNumber: String(row.stand_number),
          phase: row.phase ? String(row.phase) : null,
          landUse: row.land_use ? String(row.land_use) : null,
          sizeSqm: row.area_sqm == null ? null : Number(row.area_sqm),
          status: row.status ? String(row.status) : null,
          wizardSaleStatus: row.wizard_sale_status ? String(row.wizard_sale_status) : null,
          paid: paidSet.has(String(row.stand_number)),
        })),
      );
    },
    async standByNumber(standNumber) {
      const rows = await this.listStands();
      const found = rows.find((row) => row.standNumber === standNumber.trim());
      if (!found) return null;
      const raw = await must(
        await db.from("stand_inventory").select("id").eq("tenant_id", tenantId).eq("stand_number", found.standNumber).maybeSingle(),
        "stand id",
      );
      const record = asRow(raw);
      if (!record) return null;
      return { id: String(record.id), standNumber: found.standNumber, available: found.available, sizeSqm: found.sizeSqm };
    },
    async insertApplication(row) {
      const inserted = await must(
        await db
          .from("stand_sales_applications")
          .insert({
            tenant_id: tenantId,
            stand_inventory_id: row.standInventoryId,
            stand_number: row.standNumber,
            full_name: row.fullName,
            email: row.email,
            phone: row.phone,
            access_token_hash: row.accessTokenHash,
          })
          .select("*")
          .single(),
        "insert application",
      );
      const record = asRow(inserted);
      if (!record) throw new Error("Something went wrong. Please try again.");
      return rowApp(record);
    },
    async getApplication(id) {
      const row = asRow(await must(await db.from("stand_sales_applications").select("*").eq("id", id).maybeSingle(), "get application"));
      return row ? rowApp(row) : null;
    },
    async saveOffer(id, offer, submittedAt) {
      await must(
        await db.from("stand_sales_applications").update({ offer, offer_submitted_at: submittedAt, stage: "offer" }).eq("id", id),
        "save offer",
      );
    },
    async listAttempts(applicationId) {
      const rows = await must(
        await db.from("stand_sales_payment_attempts").select("*").eq("application_id", applicationId).order("created_at", { ascending: true }),
        "list attempts",
      );
      return asRows(rows).map(rowAttempt);
    },
    async holdReason(reference) {
      const row = asRow(await must(await db.from("stand_sales_payment_events").select("reason").eq("reference", reference).maybeSingle(), "hold reason"));
      return row?.reason ? String(row.reason) : null;
    },
    async getAttempt(reference) {
      const row = asRow(await must(await db.from("stand_sales_payment_attempts").select("*").eq("reference", reference).maybeSingle(), "get attempt"));
      return row ? rowAttempt(row) : null;
    },
    async insertAttempt(row) {
      await must(
        await db.from("stand_sales_payment_attempts").insert({
          reference: row.reference,
          application_id: row.applicationId,
          stand_number: row.standNumber,
          amount_cents: 225000,
          nonce: row.nonce,
          merchant_reference: row.reference,
        }),
        "insert attempt",
      );
    },
    async markAttempt(reference, status, cardStatus) {
      const current = await this.getAttempt(reference);
      if (!current || current.dismissedAt || current.status === "approved" || (current.status === "error" && current.cardStatus === 0)) return;
      await must(
        await db.from("stand_sales_payment_attempts").update({ status, card_status: cardStatus }).eq("reference", reference),
        "mark attempt",
      );
    },
    async applyPayment(input: ApplyPaymentInput) {
      const { data, error } = await db.rpc("apply_stand_sales_payment", {
        p_reference: input.reference,
        p_merchant_reference: input.merchantReference,
        p_nonce: input.nonce,
        p_stand_number: input.standNumber,
        p_application_id: input.applicationId,
        p_amount_cents: input.amountCents,
        p_paid_at: input.paidAt,
        p_source: input.source,
        p_email_to: input.emailTo,
        p_email_subject: input.emailSubject,
        p_email_html: input.emailHtml,
      });
      if (error) {
        console.error("[stand-sales] apply failed", error.message ?? "unknown");
        throw new Error("Something went wrong. Please try again.");
      }
      return String(data) as ApplyStatus;
    },
    async queueEmail(applicationId, template, to, subject, html) {
      await must(
        await db.from("stand_sales_email_outbox").insert({ application_id: applicationId, template, to_email: to, subject, html }),
        "queue email",
      );
    },
    async listStaffQueue(nowMs) {
      const rows = await must(
        await db.from("stand_sales_payment_attempts").select("*").is("dismissed_at", null).neq("status", "approved").neq("status", "dismissed"),
        "staff queue",
      );
      return asRows(rows).map(rowAttempt).map((attempt) => staffRowFromAttempt(attempt, nowMs)).filter((row) => row !== null);
    },
    async dismissAttempt(reference, staffUserId) {
      const current = await this.getAttempt(reference);
      if (!current || current.status === "approved" || current.dismissedAt) return null;
      const row = await must(
        await db
          .from("stand_sales_payment_attempts")
          .update({ status: "dismissed", dismissed_at: new Date().toISOString(), dismissed_by: staffUserId })
          .eq("reference", reference)
          .neq("status", "approved")
          .select("*")
          .maybeSingle(),
        "dismiss attempt",
      );
      const record = asRow(row);
      return record ? rowAttempt(record) : null;
    },
    async profileForStand(standNumber) {
      const row = asRow(await must(await db.from("profiles").select("id").eq("stand_number", standNumber).maybeSingle(), "profile"));
      return row ? { id: String(row.id) } : null;
    },
    async createPortalUser(input) {
      const { data, error } = await db.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: { full_name: input.fullName, stand_number: input.standNumber },
      });
      if (error || !data.user) throw new Error(error?.message || "Could not create the portal login.");
      await must(
        await db.from("profiles").update({
          email: input.email,
          full_name: input.fullName,
          phone_number: input.phone,
          stand_number: input.standNumber,
        }).eq("id", data.user.id),
        "profile update",
      );
      return data.user.id;
    },
    async setPortalUser(applicationId, userId) {
      await must(await db.from("stand_sales_applications").update({ portal_user_id: userId }).eq("id", applicationId), "portal user");
    },
    async isStaff(userId) {
      const row = await must(await db.from("internal_users").select("user_id").eq("user_id", userId).maybeSingle(), "staff");
      return Boolean(row);
    },
  };
}

export async function lakecityTenantId(db: Db): Promise<string> {
  const row = asRow(await must(await db.from("tenants").select("id").eq("slug", "lakecity").maybeSingle(), "tenant"));
  if (!row?.id) throw new Error("LakeCity tenant is not configured.");
  return String(row.id);
}
