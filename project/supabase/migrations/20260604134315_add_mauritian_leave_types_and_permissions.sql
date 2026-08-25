/*
  # Mauritian Labour Law Leaves, Fractional Leave Support, and Permission Tracking

  ## 1. New Leave Types
  - **Compassionate Leave**: 5 working days/year, statutory Mauritian right for bereavements/critical domestic emergencies. Resets yearly.
  - **Study Leave**: 5 working days/year, statutory Mauritian right for academic exams / professional development.
  - Both leave policies are seeded into leave_policies table.

  ## 2. Fractional Leave Support
  - Changes `working_days` column in `leave_requests` from `integer` to `numeric(6,2)` to support 0.5 day entries.

  ## 3. Study Leave Documents
  - Adds `study_document_url` column to `leave_requests` for Study Leave proof attachments.

  ## 4. Permission Tracking System (New Tables)
  ### permission_requests
  - `id` (uuid, pk)
  - `employee_id` (uuid → profiles.id)
  - `date` (date)
  - `start_time` (time)
  - `end_time` (time)
  - `duration_minutes` (integer) — computed from start/end, determines half-day conversion
  - `reason` (text, nullable)
  - `status` (text): 'Pending' | 'Approved' | 'Declined'
  - `admin_comment` (text, nullable)
  - `converted_to_half_day` (boolean) — set true when duration > 120 min
  - `created_at`, `updated_at` (timestamptz)
  - RLS: employees can read/insert their own; admins can read/update/delete all

  ## 5. Security
  - RLS enabled on permission_requests
  - Policies follow existing is_admin() + auth.uid() pattern
*/

-- ─── 1. Fractional working_days ─────────────────────────────────────────────

ALTER TABLE leave_requests
  ALTER COLUMN working_days TYPE numeric(6,2) USING working_days::numeric(6,2);

-- ─── 2. Study document URL column ────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_requests' AND column_name = 'study_document_url'
  ) THEN
    ALTER TABLE leave_requests ADD COLUMN study_document_url text;
  END IF;
END $$;

-- ─── 3. Update leave_type CHECK constraint to include Compassionate + Study ───

-- Drop the old check constraint if it exists, then recreate it with new types
DO $$
BEGIN
  -- Attempt to drop the old constraint (may vary in name across environments)
  ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_leave_type_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_leave_type_check
  CHECK (leave_type IN ('Annual', 'Sick', 'Maternity', 'Paternity', 'Emergency', 'Unpaid', 'Compassionate', 'Study'));

-- ─── 4. Seed new leave policies ──────────────────────────────────────────────

INSERT INTO leave_policies (leave_type, days_allowed, description, color, is_default)
VALUES
  ('Compassionate', 5, 'Paid leave for bereavement or critical domestic emergencies. 5 days per calendar year, resets annually.', '#7C3AED', false),
  ('Study', 5, 'Paid leave for official academic examinations or professional development. 5 days per calendar year. Proof/timetable required.', '#0284C7', false)
ON CONFLICT (leave_type) DO NOTHING;

-- ─── 5. Permission Requests Table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS permission_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 0,
  reason text,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Declined')),
  admin_comment text,
  converted_to_half_day boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS permission_requests_employee_idx ON permission_requests(employee_id);
CREATE INDEX IF NOT EXISTS permission_requests_date_idx ON permission_requests(date DESC);
CREATE INDEX IF NOT EXISTS permission_requests_status_idx ON permission_requests(status);

ALTER TABLE permission_requests ENABLE ROW LEVEL SECURITY;

-- Employees can read their own permission requests
CREATE POLICY "Employees can view own permissions"
  ON permission_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = employee_id OR is_admin());

-- Employees can insert their own
CREATE POLICY "Employees can submit permission requests"
  ON permission_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = employee_id);

-- Admins can update (approve/decline)
CREATE POLICY "Admins can update permission requests"
  ON permission_requests FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Admins can delete
CREATE POLICY "Admins can delete permission requests"
  ON permission_requests FOR DELETE
  TO authenticated
  USING (is_admin());
