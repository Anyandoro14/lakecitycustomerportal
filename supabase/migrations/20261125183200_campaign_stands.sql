-- Mark the campaign stands the wizard may sell. NOT applied to the live project.
-- A blank or non-available status on the rest of stand_inventory stays out of /stands.
alter table public.stand_inventory
  add column if not exists campaign_stand boolean not null default false;

update public.stand_inventory
   set campaign_stand = true
 where stand_number in ('3567', '3076', '3034', '3035', '3061', '3060', '3056', '3057', '3058', '3059', '3036', '3037', '3038', '3039', '3049', '3050', '3051', '3052', '3053', '3054', '3055', '3075', '3043', '3041', '3044', '3040', '3042', '3045', '3046', '3062', '3048', '3047', '3033', '3093', '3089', '3095', '3096', '3084');
