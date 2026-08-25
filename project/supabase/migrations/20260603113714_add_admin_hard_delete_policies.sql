/*
  # Add Admin Hard-Delete Policies

  1. Allows admins to permanently delete profile rows
  2. Allows cascaded deletion of leave_requests and notifications for that employee
     (these tables already have employee_id / recipient_id FKs — we add DELETE policies)

  Security: only authenticated admins (role = 'admin' in profiles) can delete.
*/

-- Helper: re-confirm is_admin function exists
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Allow admins to delete profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Admins can delete profiles'
  ) THEN
    CREATE POLICY "Admins can delete profiles"
      ON profiles FOR DELETE
      TO authenticated
      USING (is_admin());
  END IF;
END $$;

-- Allow admins to delete leave_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'leave_requests' AND policyname = 'Admins can delete leave requests'
  ) THEN
    CREATE POLICY "Admins can delete leave requests"
      ON leave_requests FOR DELETE
      TO authenticated
      USING (is_admin());
  END IF;
END $$;

-- Allow admins to delete notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Admins can delete notifications'
  ) THEN
    CREATE POLICY "Admins can delete notifications"
      ON notifications FOR DELETE
      TO authenticated
      USING (is_admin());
  END IF;
END $$;

-- Allow admins to delete employee_documents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'employee_documents' AND policyname = 'Admins can delete employee documents'
  ) THEN
    CREATE POLICY "Admins can delete employee documents"
      ON employee_documents FOR DELETE
      TO authenticated
      USING (is_admin());
  END IF;
END $$;
