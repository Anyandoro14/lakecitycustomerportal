-- Update existing director users to have the 'director' role
-- Directors: alex@lakecity.co.zw, brenda@lakecity.co.zw, tapiwa@lakecity.co.zw
UPDATE public.internal_users 
SET role = 'director'::internal_role
WHERE LOWER(email) IN ('alex@lakecity.co.zw', 'brenda@lakecity.co.zw', 'tapiwa@lakecity.co.zw');

-- Update cynthia to have 'admin' role
UPDATE public.internal_users 
SET role = 'admin'::internal_role
WHERE LOWER(email) = 'cynthia@lakecity.co.zw';