-- Ensures probation_notification_log exists with the milestone_date column.
-- Safe to run multiple times (IF NOT EXISTS guards).

CREATE TABLE IF NOT EXISTS probation_notification_log (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  milestone_date date        NOT NULL,
  notified_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, milestone_date)
);

ALTER TABLE probation_notification_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'probation_notification_log'
      AND policyname = 'Admins can manage probation notification log'
  ) THEN
    CREATE POLICY "Admins can manage probation notification log"
      ON probation_notification_log FOR SELECT
      TO authenticated
      USING (is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'probation_notification_log'
      AND policyname = 'Admins can insert probation notification log'
  ) THEN
    CREATE POLICY "Admins can insert probation notification log"
      ON probation_notification_log FOR INSERT
      TO authenticated
      WITH CHECK (is_admin());
  END IF;
END $$;
