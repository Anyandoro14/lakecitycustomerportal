-- The login hook looks up internal_users and profiles. Without a fixed search_path,
-- auth.users inserts from the auth admin role fail on a fresh database because
-- those tables are not on that role's search_path. Schema-qualify and pin public.

CREATE OR REPLACE FUNCTION public.handle_auth_login()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id UUID;
  _role TEXT;
  _internal_role TEXT;
  _meta JSONB;
BEGIN
  SELECT iu.tenant_id, iu.role INTO _tenant_id, _internal_role
  FROM public.internal_users iu
  WHERE iu.user_id = NEW.id
  LIMIT 1;

  IF _tenant_id IS NOT NULL THEN
    _role := 'internal';
  ELSE
    SELECT p.tenant_id INTO _tenant_id
    FROM public.profiles p
    WHERE p.id = NEW.id
    LIMIT 1;

    _role := 'customer';
    _internal_role := NULL;
  END IF;

  _meta := COALESCE(NEW.raw_app_meta_data, '{}'::JSONB);
  _meta := _meta || jsonb_build_object(
    'tenant_id', _tenant_id,
    'role', _role,
    'internal_role', _internal_role
  );

  NEW.raw_app_meta_data := _meta;
  RETURN NEW;
END;
$$;

-- profiles.tenant_id is NOT NULL. The original signup trigger inserted only id and email,
-- so creating a portal login failed. Default new profiles to the LakeCity tenant.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, tenant_id)
  VALUES (
    NEW.id,
    NEW.email,
    (SELECT id FROM public.tenants WHERE slug = 'lakecity' LIMIT 1)
  );
  RETURN NEW;
END;
$$;
