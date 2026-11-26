import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const runLocal = process.env.RUN_LOCAL_DB_MIGRATION_TEST === "1";
const adminUrl = process.env.LOCAL_PG_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const thisFile = fileURLToPath(import.meta.url);
const thisDir = path.dirname(thisFile);
const repoRoot = path.resolve(thisDir, "../../../");

const migration83000 = path.join(repoRoot, "supabase/migrations/20261125183000_stand_sales_wizard.sql");
const migration83100 = path.join(repoRoot, "supabase/migrations/20261125183100_auth_hook_search_path.sql");
const migration83200 = path.join(repoRoot, "supabase/migrations/20261125183200_campaign_stands.sql");

const liveShapeBootstrapSql = `
create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_app_meta_data jsonb
);

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.tenants (slug, name, is_active)
values ('lakecity', 'Lake City', true)
on conflict (slug) do update
  set name = excluded.name,
      is_active = excluded.is_active;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone_number text,
  stand_number text
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
`;

const repoReplayBootstrapSql = `
create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_app_meta_data jsonb
);

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.tenants (slug, display_name, is_active)
values ('lakecity', 'Lake City', true)
on conflict (slug) do update
  set display_name = excluded.display_name,
      is_active = excluded.is_active;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone_number text,
  stand_number text,
  tenant_id uuid not null references public.tenants(id)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
`;

function execPsql(connectionString: string, sql: string): string {
  return execFileSync(
    "psql",
    ["-v", "ON_ERROR_STOP=1", connectionString, "-X", "--no-psqlrc", "-t", "-A", "-c", sql],
    { encoding: "utf8" },
  );
}

function execPsqlFile(connectionString: string, filePath: string): string {
  return execFileSync(
    "psql",
    ["-v", "ON_ERROR_STOP=1", connectionString, "-X", "--no-psqlrc", "-f", filePath],
    { encoding: "utf8" },
  );
}

function dbUrlFor(dbName: string): string {
  const parsed = new URL(adminUrl);
  parsed.pathname = `/${dbName}`;
  parsed.search = "";
  return parsed.toString();
}

function resetDb(dbName: string): string {
  const dbUrl = dbUrlFor(dbName);
  execPsql(adminUrl, `drop database if exists "${dbName}" with (force);`);
  execPsql(adminUrl, `create database "${dbName}" template template0;`);
  return dbUrl;
}

function applyReworkedMigrations(dbUrl: string) {
  execPsqlFile(dbUrl, migration83000);
  execPsqlFile(dbUrl, migration83100);
  execPsqlFile(dbUrl, migration83200);
}

describe.skipIf(!runLocal)("stand-sales migrations on live-shape schema", () => {
  const dbName = `stand_sales_live_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const repoDbName = `stand_sales_repo_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const tmpDir = mkdtempSync(path.join(tmpdir(), "stand-sales-live-shape-"));
  const liveBootstrapPath = path.join(tmpDir, "bootstrap-live-shape.sql");
  const repoBootstrapPath = path.join(tmpDir, "bootstrap-repo-shape.sql");

  afterAll(() => {
    try {
      execPsql(adminUrl, `drop database if exists "${dbName}" with (force);`);
      execPsql(adminUrl, `drop database if exists "${repoDbName}" with (force);`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("applies reworked migrations and preserves handle_new_user()", () => {
    const dbUrl = resetDb(dbName);
    writeFileSync(liveBootstrapPath, liveShapeBootstrapSql);
    execPsqlFile(dbUrl, liveBootstrapPath);

    const beforeDef = execPsql(dbUrl, "select pg_get_functiondef('public.handle_new_user()'::regprocedure);");
    const beforeTriggerFn = execPsql(
      dbUrl,
      `select p.proname
         from pg_trigger t
         join pg_proc p on p.oid = t.tgfoid
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'auth'
          and c.relname = 'users'
          and t.tgname = 'on_auth_user_created'
          and not t.tgisinternal;`,
    );

    applyReworkedMigrations(dbUrl);
    applyReworkedMigrations(dbUrl);

    const afterDef = execPsql(dbUrl, "select pg_get_functiondef('public.handle_new_user()'::regprocedure);");
    const afterTriggerFn = execPsql(
      dbUrl,
      `select p.proname
         from pg_trigger t
         join pg_proc p on p.oid = t.tgfoid
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'auth'
          and c.relname = 'users'
          and t.tgname = 'on_auth_user_created'
          and not t.tgisinternal;`,
    );

    const inventoryColumns = execPsql(
      dbUrl,
      `select column_name
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'stand_inventory'
          and column_name in ('campaign_stand', 'wizard_sale_status', 'odoo_product_tmpl_id', 'odoo_product_id')
        order by column_name;`,
    );

    const standPolicy = execPsql(
      dbUrl,
      `select policyname
         from pg_policies
        where schemaname = 'public'
          and tablename = 'stand_inventory'
          and policyname = 'staff read campaign stands';`,
    );

    expect(beforeDef.trim()).toBe(afterDef.trim());
    expect(beforeTriggerFn.trim()).toBe("handle_new_user");
    expect(afterTriggerFn.trim()).toBe("handle_new_user");
    expect(standPolicy.trim()).toBe("");
    expect(inventoryColumns).toContain("campaign_stand");
    expect(inventoryColumns).toContain("wizard_sale_status");
    expect(inventoryColumns).toContain("odoo_product_tmpl_id");
    expect(inventoryColumns).toContain("odoo_product_id");
  }, 120000);

  it("keeps legacy handle_new_user working on repo replay shape", () => {
    const dbUrl = resetDb(repoDbName);
    writeFileSync(repoBootstrapPath, repoReplayBootstrapSql);
    execPsqlFile(dbUrl, repoBootstrapPath);

    applyReworkedMigrations(dbUrl);

    execPsql(
      dbUrl,
      "insert into auth.users (id, email, raw_app_meta_data) values ('00000000-0000-4000-8000-000000000001', 'buyer@example.com', '{}'::jsonb);",
    );

    const profileTenant = execPsql(
      dbUrl,
      `select p.tenant_id::text
         from public.profiles p
        where p.id = '00000000-0000-4000-8000-000000000001'::uuid
        limit 1;`,
    );
    const lakecityTenant = execPsql(
      dbUrl,
      "select id::text from public.tenants where slug = 'lakecity' limit 1;",
    );

    expect(profileTenant.trim()).not.toBe("");
    expect(profileTenant.trim()).toBe(lakecityTenant.trim());
  }, 120000);
});
