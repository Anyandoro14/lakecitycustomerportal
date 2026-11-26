-- Mark the campaign stands the wizard may sell.
-- Kept idempotent and stand_inventory-safe for databases that never ran older stand migrations.

create table if not exists public.stand_inventory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  stand_number text not null,
  status text,
  campaign_stand boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stand_inventory
  add column if not exists stand_number text,
  add column if not exists status text,
  add column if not exists campaign_stand boolean,
  add column if not exists updated_at timestamptz not null default now();

update public.stand_inventory
   set campaign_stand = false
 where campaign_stand is null;

alter table public.stand_inventory
  alter column campaign_stand set default false,
  alter column campaign_stand set not null;

update public.stand_inventory
   set campaign_stand = true
 where stand_number in (
   '3567', '3076', '3034', '3035', '3061', '3060', '3056', '3057', '3058', '3059',
   '3036', '3037', '3038', '3039', '3049', '3050', '3051', '3052', '3053', '3054',
   '3055', '3075', '3043', '3041', '3044', '3040', '3042', '3045', '3046', '3062',
   '3048', '3047', '3033', '3093', '3089', '3095', '3096', '3084'
 );
