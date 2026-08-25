-- =============================================
-- System Settings: audit_logs + platform_settings
-- =============================================

-- Audit Logs
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

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs" ON audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Authenticated users can insert audit logs" ON audit_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Platform Settings (key-value store)
CREATE TABLE IF NOT EXISTS platform_settings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT UNIQUE NOT NULL,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage platform settings" ON platform_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Default settings
INSERT INTO platform_settings (key, value) VALUES
  ('company_name',                  'Freshkite HR'),
  ('company_logo_url',              '/freshkite-logo.png'),
  ('admin_email',                   'hr@freshkite.net'),
  ('app_url',                       'https://hr.freshkite.net'),
  ('email_notifications_enabled',   'true'),
  ('notify_leave_submitted',        'true'),
  ('notify_leave_approved',         'true'),
  ('notify_leave_declined',         'true'),
  ('notify_permission_submitted',   'true'),
  ('notify_permission_approved',    'true'),
  ('notify_permission_declined',    'true'),
  ('notify_announcement_posted',    'true'),
  ('email_sender_name',             'Freshkite HR'),
  ('max_permissions_per_month',     '2')
ON CONFLICT (key) DO NOTHING;

-- Index for faster queries
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx    ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx  ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_resource_idx ON audit_logs(resource_type);
