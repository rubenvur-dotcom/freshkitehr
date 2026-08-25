-- Add extended employee profile fields
-- Run this in Supabase SQL Editor or apply via migration tooling.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS date_of_birth               DATE,
  ADD COLUMN IF NOT EXISTS emergency_contact_name       TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone      TEXT;

-- Update audit_logs table if not already created by prior migration
CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_name    TEXT,
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   TEXT,
  details       JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can read audit logs" ON audit_logs;
CREATE POLICY "Admins can read audit logs"
  ON audit_logs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON audit_logs;
CREATE POLICY "Authenticated users can insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- platform_settings table if not already created
CREATE TABLE IF NOT EXISTS platform_settings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT UNIQUE NOT NULL,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage platform settings" ON platform_settings;
CREATE POLICY "Admins manage platform settings"
  ON platform_settings FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Default platform settings (insert only if missing)
INSERT INTO platform_settings (key, value) VALUES
  ('company_name',                'Freshkite'),
  ('email_notifications_enabled', 'true'),
  ('notify_leave_approved',       'true'),
  ('notify_leave_rejected',       'true'),
  ('notify_leave_submitted',      'true'),
  ('notify_announcement',         'true'),
  ('notify_password_reset',       'true'),
  ('notify_invite',               'true'),
  ('max_permissions_per_month',   '2')
ON CONFLICT (key) DO NOTHING;
