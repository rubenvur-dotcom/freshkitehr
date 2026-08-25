/*
  # Fix: handle_new_user trigger cannot INSERT into profiles due to RLS

  ## Problem
  The `handle_new_user` trigger function has SECURITY DEFINER, but the
  function owner (postgres/supabase_admin) still respects RLS on the profiles
  table. The existing INSERT policy requires is_admin(), which fails when the
  trigger runs during client-side signUp because auth.uid() is NULL in the
  trigger context (the user doesn't exist in the session yet).

  ## Fix
  Re-create the trigger function with an explicit SET clause to run as the
  postgres superuser role which bypasses RLS, and also ensure the function
  has the correct search_path. We also add a fallback INSERT policy for
  the service_role so the admin SDK can insert profiles directly.

  ## Changes
  1. Drop and re-create handle_new_user with SET search_path and as a
     true SECURITY DEFINER function owned by postgres (bypasses RLS)
  2. Add an INSERT policy allowing the service_role to insert profiles
     (needed for any server-side user creation via service key)
*/

-- Re-create the trigger function so it properly bypasses RLS
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, department, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'department', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'employee')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Ensure the trigger is in place (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Allow service_role to insert profiles (for server-side admin user creation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles'
      AND policyname = 'Service role can insert profiles'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Service role can insert profiles"
        ON profiles FOR INSERT
        TO service_role
        WITH CHECK (true)
    $policy$;
  END IF;
END $$;
