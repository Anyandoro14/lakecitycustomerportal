-- Drop the broken RLS policy
DROP POLICY IF EXISTS "Users can view their own monthly statements" ON public.monthly_statements;

-- Create a fixed policy using auth.jwt() instead of querying auth.users
CREATE POLICY "Users can view their own monthly statements" 
ON public.monthly_statements 
FOR SELECT 
USING (customer_email = (auth.jwt() ->> 'email')::text);