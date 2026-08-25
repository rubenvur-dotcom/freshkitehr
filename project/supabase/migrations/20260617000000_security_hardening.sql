-- ─── Security Hardening ────────────────────────────────────────────────────
-- Fix 1: Prevent employees from tampering with admin-only leave_request fields
-- Fix 2: Restrict notification inserts to admins or self

-- ── Fix 1: Protect leave_request fields from employee tampering ─────────────

CREATE OR REPLACE FUNCTION protect_leave_request_admin_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Allow admins to change anything
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  -- Reject if employee attempts to change status, admin_comment, or submitted_by_admin
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Employees cannot change the status of a leave request.';
  END IF;

  IF NEW.admin_comment IS DISTINCT FROM OLD.admin_comment THEN
    RAISE EXCEPTION 'Employees cannot change the admin comment on a leave request.';
  END IF;

  IF NEW.submitted_by_admin IS DISTINCT FROM OLD.submitted_by_admin THEN
    RAISE EXCEPTION 'Employees cannot change the submitted_by_admin field on a leave request.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_leave_request_admin_fields ON leave_requests;

CREATE TRIGGER trg_protect_leave_request_admin_fields
  BEFORE UPDATE ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION protect_leave_request_admin_fields();

-- ── Fix 2: Restrict notification INSERT to admins or self ───────────────────

DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON notifications;

CREATE POLICY "Admins or self can insert notifications"
  ON notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin() = TRUE
    OR recipient_id = auth.uid()
  );
