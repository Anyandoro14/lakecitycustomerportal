// @vitest-environment node
// Runs every migration in an in-process Postgres (PGlite) and exercises apply_payment_confirmed directly.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");
const SUPABASE_STUBS = `
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql as 'select null::uuid';
  create role anon; create role authenticated; create role service_role;
`;

let db: PGlite;

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  }
}, 60_000);

beforeEach(async () => {
  await db.exec(`
    update public.stands set status = 'available', reserved_lead_id = null, signed_lead_id = null;
    delete from public.email_outbox; delete from public.payment_events; delete from public.payment_attempts; delete from public.leads;
  `);
});

async function newLead(stand = "3076", withOffer = true): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.leads (access_token_hash, full_name, email, phone, stand_number, offer, offer_submitted_at)
     values ('h', 'Tariro Moyo', 'tariro@example.com', '+263771234567', $1, $2, now()) returning id`,
    [stand, withOffer ? { buyer: { fullName: "Tariro Moyo" } } : null],
  );
  await db.query(`insert into public.payment_attempts (reference, lead_id, stand_number, amount_cents) values ($1, $2, $3, 225000)`, [`LC${stand}-${rows[0].id.slice(0, 6)}`, rows[0].id, stand]);
  return rows[0].id;
}

async function apply(reference: string, leadId: string, opts: { stand?: string; amount?: number } = {}) {
  const { rows } = await db.query<{ r: string }>(
    `select public.apply_payment_confirmed($1, $2, $3::uuid, $4, now(), 'mock-iveri', 'tariro@example.com', 'Thank you', '{}'::jsonb, '{}'::text[]) as r`,
    [reference, opts.stand ?? "3076", leadId, opts.amount ?? 225000],
  );
  return rows[0].r;
}

const one = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const count = async (table: string) => Number((await one<{ n: number }>(`select count(*)::int as n from ${table}`)).n);

describe("apply_payment_confirmed (SQL)", () => {
  it("applied: stand leaves inventory, lead is paid, attempt approved, exactly one email queued", async () => {
    const lead = await newLead();
    const ref = `LC3076-${lead.slice(0, 6)}`;
    expect(await apply(ref, lead)).toBe("applied");
    expect(await one(`select status::text, reserved_lead_id from public.stands where stand_number = '3076'`)).toEqual({ status: "paid", reserved_lead_id: lead });
    expect(await one(`select stage::text, payment_reference, payment_amount_cents from public.leads where id = $1`, [lead])).toEqual({
      stage: "paid",
      payment_reference: ref,
      payment_amount_cents: 225000,
    });
    expect(await one(`select status, card_status from public.payment_attempts where reference = $1`, [ref])).toEqual({ status: "approved", card_status: 0 });
    expect(await count("public.email_outbox")).toBe(1);
    expect(await one(`select outcome from public.payment_events where reference = $1`, [ref])).toEqual({ outcome: "applied" });
  });

  it("the same reference twice is a duplicate and changes nothing", async () => {
    const lead = await newLead();
    const ref = `LC3076-${lead.slice(0, 6)}`;
    await apply(ref, lead);
    expect(await apply(ref, lead)).toBe("duplicate");
    expect(await count("public.email_outbox")).toBe(1);
    expect(await count("public.payment_events")).toBe(1);
  });

  it("a second payment for a sold stand is recorded as unmatched and changes nothing else", async () => {
    const first = await newLead();
    await apply(`LC3076-${first.slice(0, 6)}`, first);
    const second = await newLead();
    const ref2 = `LC3076-${second.slice(0, 6)}`;
    expect(await apply(ref2, second)).toBe("unmatched");
    expect(await one(`select outcome, reason, lead_id from public.payment_events where reference = $1`, [ref2])).toEqual({
      outcome: "unmatched",
      reason: "stand_not_available",
      lead_id: second,
    });
    expect(await one(`select reserved_lead_id from public.stands where stand_number = '3076'`)).toEqual({ reserved_lead_id: first });
    expect(await one(`select stage::text from public.leads where id = $1`, [second])).toEqual({ stage: "form_filled" });
    expect(await one(`select status from public.payment_attempts where reference = $1`, [ref2])).toEqual({ status: "started" });
    expect(await count("public.email_outbox")).toBe(1);
    expect(await apply(ref2, second)).toBe("unmatched");
    expect(await count("public.payment_events")).toBe(2);
  });

  it("a wrong amount is recorded as rejected and changes nothing else", async () => {
    const lead = await newLead();
    expect(await apply("LC3076-WRONGAMT", lead, { amount: 100000 })).toBe("rejected");
    expect(await one(`select outcome from public.payment_events where reference = 'LC3076-WRONGAMT'`)).toEqual({ outcome: "rejected" });
    expect(await one(`select status::text from public.stands where stand_number = '3076'`)).toEqual({ status: "available" });
    expect(await count("public.email_outbox")).toBe(0);
  });

  it("a lead without an offer, or a stand mismatch, is recorded as unmatched", async () => {
    const noOffer = await newLead("3076", false);
    expect(await apply("LC3076-NOOFFER", noOffer)).toBe("unmatched");
    const lead = await newLead();
    expect(await apply("LC3077-MISMATCH", lead, { stand: "3077" })).toBe("unmatched");
    expect(await count("public.payment_events")).toBe(2);
    expect(await one(`select count(*)::int as n from public.stands where status <> 'available'`)).toEqual({ n: 0 });
  });

  it("is not executable by anon or authenticated users", async () => {
    const { rows } = await db.query<{ anon: boolean; auth: boolean; svc: boolean }>(`
      select has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as auth,
             has_function_privilege('service_role', p.oid, 'execute') as svc
        from pg_proc p where p.proname = 'apply_payment_confirmed'`);
    expect(rows).toEqual([{ anon: false, auth: false, svc: true }]);
  });
});
