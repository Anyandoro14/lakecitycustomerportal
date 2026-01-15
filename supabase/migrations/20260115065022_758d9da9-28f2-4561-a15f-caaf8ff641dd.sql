-- Update the auto_provision_internal_user function to set override approver status for specific emails
CREATE OR REPLACE FUNCTION public.auto_provision_internal_user()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
  is_approver BOOLEAN;
BEGIN
  -- Get the email from the new user
  user_email := NEW.email;
  
  -- Check if email ends with @lakecity.co.zw
  IF user_email ILIKE '%@lakecity.co.zw' THEN
    -- Check if this is one of the override approvers
    is_approver := LOWER(user_email) IN (
      'alex@lakecity.co.zw',
      'brenda@lakecity.co.zw',
      'tapiwa@lakecity.co.zw'
    );
    
    -- Insert into internal_users if not exists
    INSERT INTO public.internal_users (user_id, email, role, is_override_approver)
    VALUES (NEW.id, user_email, 'helpdesk', is_approver)
    ON CONFLICT (user_id) DO UPDATE SET
      email = EXCLUDED.email,
      is_override_approver = is_approver,
      updated_at = now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;