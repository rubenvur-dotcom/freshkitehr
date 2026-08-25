-- H4: fix wrong index column (action_type → action)
DROP INDEX IF EXISTS idx_audit_logs_action_type;
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
