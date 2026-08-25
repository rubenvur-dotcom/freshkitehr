/*
  # Create policy_notes and notifications tables

  ## New Tables

  ### policy_notes
  Stores editable company policy notes displayed on the Leave Policies page.
  - `id` (uuid, primary key)
  - `note_text` (text) — the policy note content
  - `display_order` (int) — ordering index
  - `created_at` / `updated_at` (timestamptz)

  Seeded with 5 default notes.

  ### notifications
  Stores in-app notifications for each user.
  - `id` (uuid, primary key)
  - `recipient_id` (uuid, references profiles.id)
  - `type` (text) — leave_submitted | leave_approved | leave_rejected | leave_admin_added | announcement | document_uploaded | leave_cancelled
  - `title` (text)
  - `body` (text)
  - `is_read` (boolean, default false)
  - `related_type` (text, nullable) — leave_request | announcement | document | employee
  - `related_id` (text, nullable)
  - `created_at` (timestamptz, default now())

  ## Security
  - policy_notes: all authenticated users SELECT; only admins INSERT/UPDATE/DELETE
  - notifications: users can only SELECT/UPDATE their own; service_role can INSERT
*/

-- ── policy_notes ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS policy_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_text text NOT NULL DEFAULT '',
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE policy_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view policy notes"
  ON policy_notes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert policy notes"
  ON policy_notes FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update policy notes"
  ON policy_notes FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete policy notes"
  ON policy_notes FOR DELETE
  TO authenticated
  USING (is_admin());

-- Seed default notes
INSERT INTO policy_notes (note_text, display_order) VALUES
  ('Leave requests must be submitted at least 3 working days in advance for annual leave.', 1),
  ('Sick leave beyond 2 consecutive days requires a medical certificate.', 2),
  ('Unused annual leave up to 5 days may be carried forward to the next year.', 3),
  ('Emergency leave is granted at management discretion. Notify your line manager immediately.', 4),
  ('Public holidays in Mauritius are excluded from leave calculations as per the Employment Rights Act.', 5)
ON CONFLICT DO NOTHING;

-- ── notifications ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  related_type text,
  related_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications(recipient_id, is_read, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "Service role can insert notifications"
  ON notifications FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Also allow authenticated users (admins/triggers via client) to insert notifications
CREATE POLICY "Authenticated users can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);
