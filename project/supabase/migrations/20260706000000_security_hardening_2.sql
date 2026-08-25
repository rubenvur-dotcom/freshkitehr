-- Security Hardening Phase 2
-- Adds missing RLS policies, performance indexes on audit tables,
-- and tightens employee data access.

-- ─────────────────────────────────────────────────────────────────
-- 1. Indexes for audit_logs (high-volume, frequently filtered)
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id    ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs (action_type);

-- ─────────────────────────────────────────────────────────────────
-- 2. Indexes for leave_requests / permission_requests (common filters)
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_id  ON leave_requests (employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status       ON leave_requests (status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_start_date   ON leave_requests (start_date);
CREATE INDEX IF NOT EXISTS idx_perm_requests_employee_id   ON permission_requests (employee_id);
CREATE INDEX IF NOT EXISTS idx_perm_requests_date          ON permission_requests (date);

-- ─────────────────────────────────────────────────────────────────
-- 3. Indexes for notifications (recipient-based queries)
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications (recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at   ON notifications (created_at DESC);

-- ─────────────────────────────────────────────────────────────────
-- 4. RLS: profiles
--    Employees can read all active profiles (needed for org chart,
--    birthday widget, out-of-office widget). Employees may only
--    UPDATE their own row. Only admins may INSERT or DELETE.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can view active profiles"   ON profiles;
DROP POLICY IF EXISTS "Employees can update own profile"     ON profiles;
DROP POLICY IF EXISTS "Admins have full access to profiles"  ON profiles;

CREATE POLICY "Admins have full access to profiles"
  ON profiles FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Employees can view active profiles"
  ON profiles FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = true);

CREATE POLICY "Employees can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ─────────────────────────────────────────────────────────────────
-- 5. RLS: employee_emergency_contacts
--    Employees see/edit only their own. Admins have full access.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE employee_emergency_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees manage own emergency contacts" ON employee_emergency_contacts;
DROP POLICY IF EXISTS "Admins manage all emergency contacts"    ON employee_emergency_contacts;

CREATE POLICY "Admins manage all emergency contacts"
  ON employee_emergency_contacts FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Employees manage own emergency contacts"
  ON employee_emergency_contacts FOR ALL
  USING (auth.uid() = employee_id)
  WITH CHECK (auth.uid() = employee_id);

-- ─────────────────────────────────────────────────────────────────
-- 6. RLS: employee_personal_data
--    Sensitive — employees see only their own row. Admins full access.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE employee_personal_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees view own personal data" ON employee_personal_data;
DROP POLICY IF EXISTS "Admins manage all personal data"  ON employee_personal_data;

CREATE POLICY "Admins manage all personal data"
  ON employee_personal_data FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Employees view own personal data"
  ON employee_personal_data FOR SELECT
  USING (auth.uid() = employee_id);

-- ─────────────────────────────────────────────────────────────────
-- 7. RLS: audit_logs
--    Admins can read all. Employees cannot read audit_logs at all.
--    Inserts allowed from server via service role (bypasses RLS).
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read audit logs" ON audit_logs;

CREATE POLICY "Admins can read audit logs"
  ON audit_logs FOR SELECT
  USING (is_admin());

-- ─────────────────────────────────────────────────────────────────
-- 8. RLS: offboarding_checklists / items / audit_log
--    Only admins. Employees have no business accessing offboarding data.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE offboarding_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage offboarding checklists" ON offboarding_checklists;
CREATE POLICY "Admins manage offboarding checklists"
  ON offboarding_checklists FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

ALTER TABLE offboarding_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage offboarding items" ON offboarding_items;
CREATE POLICY "Admins manage offboarding items"
  ON offboarding_items FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

ALTER TABLE offboarding_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage offboarding audit log" ON offboarding_audit_log;
CREATE POLICY "Admins manage offboarding audit log"
  ON offboarding_audit_log FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ─────────────────────────────────────────────────────────────────
-- 9. RLS: announcements — employees read published, admins manage all
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees read published announcements" ON announcements;
DROP POLICY IF EXISTS "Admins manage all announcements"        ON announcements;

CREATE POLICY "Admins manage all announcements"
  ON announcements FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Employees read published announcements"
  ON announcements FOR SELECT
  USING (auth.uid() IS NOT NULL AND status = 'active');

-- ─────────────────────────────────────────────────────────────────
-- 10. Prevent employees from updating their own is_admin / is_active flags.
--     These columns must only be changed by an admin.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prevent_privilege_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_admin() THEN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      RAISE EXCEPTION 'Forbidden: cannot change is_admin';
    END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Forbidden: cannot change is_active';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Forbidden: cannot change role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_privilege_escalation ON profiles;
CREATE TRIGGER trg_prevent_privilege_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_privilege_escalation();
