-- Migration 004: Auth hook to inject tenant_id, role, internal_role into JWT app_metadata on login

CREATE OR REPLACE FUNCTION public.handle_auth_login()
RETURNS TRIGGER AS $$
DECLARE
  _tenant_id UUID;
  _role TEXT;
  _internal_role TEXT;
  _meta JSONB;
BEGIN
  -- Check if user is an internal user first
  SELECT iu.tenant_id, iu.role INTO _tenant_id, _internal_role
  FROM internal_users iu
  WHERE iu.user_id = NEW.id
  LIMIT 1;

  IF _tenant_id IS NOT NULL THEN
    _role := 'internal';
  ELSE
    -- Check profiles table for customer
    SELECT p.tenant_id INTO _tenant_id
    FROM profiles p
    WHERE p.id = NEW.id
    LIMIT 1;

    _role := 'customer';
    _internal_role := NULL;
  END IF;

  -- Build metadata payload
  _meta := COALESCE(NEW.raw_app_meta_data, '{}'::JSONB);
  _meta := _meta || jsonb_build_object(
    'tenant_id', _tenant_id,
    'role', _role,
    'internal_role', _internal_role
  );

  -- Update the user's app_metadata
  NEW.raw_app_meta_data := _meta;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users for login (update of last_sign_in_at)
DROP TRIGGER IF EXISTS on_auth_user_login ON auth.users;
CREATE TRIGGER on_auth_user_login
  BEFORE UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_login();

-- Also fire on initial creation so first login has metadata
DROP TRIGGER IF EXISTS on_auth_user_created_tenant ON auth.users;
CREATE TRIGGER on_auth_user_created_tenant
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_login();
