/*
  # Probation Milestone Notifications Tracking

  Adds a table to track which bi-monthly probation milestones have already had
  notifications sent, preventing duplicate alerts.

  ## New Table: probation_notification_log
  - `id` (uuid, pk)
  - `employee_id` (uuid → profiles.id)
  - `milestone_date` (date) — the 2-month milestone date the notification refers to
  - `notified_at` (timestamptz)
  - Unique constraint on (employee_id, milestone_date)

  ## Purpose
  This log is checked by the client-side notification engine to ensure each
  milestone+employee pair only generates one set of notifications. The engine
  runs on admin login to check for upcoming milestones within 7 days.
*/

CREATE TABLE IF NOT EXISTS probation_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  milestone_date date NOT NULL,
  notified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, milestone_date)
);

ALTER TABLE probation_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage probation notification log"
  ON probation_notification_log FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can insert probation notification log"
  ON probation_notification_log FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());
