/*
  # Offboarding Module

  1. New Tables
    - `offboarding_checklists`
      - `id` (uuid, primary key)
      - `employee_id` (uuid, FK to profiles)
      - `initiated_by` (uuid, FK to profiles — admin who started it)
      - `separation_reason` (text: Resigned / Contract Ended / Terminated)
      - `last_working_day` (date)
      - `final_employment_date` (date)
      - `personal_email` (text)
      - `position` (text)
      - `status` (text: in_progress / complete)
      - `completed_by` (uuid, nullable)
      - `completed_at` (timestamptz, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `offboarding_items`
      - `id` (uuid, primary key)
      - `checklist_id` (uuid, FK to offboarding_checklists)
      - `section` (text — section key)
      - `item_key` (text — unique key per item)
      - `is_checked` (boolean)
      - `is_optional` (boolean — "if applicable" items)
      - `checked_by` (uuid, nullable)
      - `checked_at` (timestamptz, nullable)
      - `notes` (text, nullable)
      - `created_at` (timestamptz)

    - `offboarding_audit_log`
      - `id` (uuid, primary key)
      - `checklist_id` (uuid, FK to offboarding_checklists)
      - `actor_id` (uuid, FK to profiles)
      - `action` (text: initiated / item_checked / item_unchecked / completed)
      - `detail` (text, nullable)
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled on all three tables
    - Admins can read/write all rows
    - Employees can read their own checklist (read-only)

  3. Notes
    - `profiles` table gains a new `offboarding_status` column
      (null = active, 'in_progress' = offboarding started, 'complete' = offboarded)
    - `separation_reason` column added to profiles as well for display convenience
*/

-- ── profiles additions ─────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'offboarding_status'
  ) THEN
    ALTER TABLE profiles ADD COLUMN offboarding_status text
      CHECK (offboarding_status IN ('in_progress', 'complete'))
      DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'separation_reason'
  ) THEN
    ALTER TABLE profiles ADD COLUMN separation_reason text
      CHECK (separation_reason IN ('Resigned', 'Contract Ended', 'Terminated'))
      DEFAULT NULL;
  END IF;
END $$;

-- ── offboarding_checklists ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS offboarding_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id),
  initiated_by uuid NOT NULL REFERENCES profiles(id),
  separation_reason text NOT NULL
    CHECK (separation_reason IN ('Resigned', 'Contract Ended', 'Terminated')),
  last_working_day date,
  final_employment_date date,
  personal_email text DEFAULT '',
  position text DEFAULT '',
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'complete')),
  completed_by uuid REFERENCES profiles(id),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE offboarding_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all offboarding checklists"
  ON offboarding_checklists FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR employee_id = auth.uid()
  );

CREATE POLICY "Admins can insert offboarding checklists"
  ON offboarding_checklists FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update offboarding checklists"
  ON offboarding_checklists FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete offboarding checklists"
  ON offboarding_checklists FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── offboarding_items ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS offboarding_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES offboarding_checklists(id) ON DELETE CASCADE,
  section text NOT NULL,
  item_key text NOT NULL,
  label text NOT NULL,
  is_checked boolean NOT NULL DEFAULT false,
  is_optional boolean NOT NULL DEFAULT false,
  checked_by uuid REFERENCES profiles(id),
  checked_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (checklist_id, item_key)
);

ALTER TABLE offboarding_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and owners can view offboarding items"
  ON offboarding_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM offboarding_checklists
      WHERE id = checklist_id AND employee_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert offboarding items"
  ON offboarding_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update offboarding items"
  ON offboarding_items FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete offboarding items"
  ON offboarding_items FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── offboarding_audit_log ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS offboarding_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES offboarding_checklists(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES profiles(id),
  action text NOT NULL
    CHECK (action IN ('initiated', 'item_checked', 'item_unchecked', 'completed', 'info_updated')),
  detail text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE offboarding_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
  ON offboarding_audit_log FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert audit logs"
  ON offboarding_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
