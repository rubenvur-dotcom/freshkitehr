/*
  # Employee Handbook, Personal Data & Emergency Contacts

  ## New Tables

  ### handbook_sections
  - Stores editable sections of the Employee Handbook
  - Each section has an order, title, and markdown body content
  - Only admins can create/update/delete sections; all authenticated users can read

  ### employee_personal_data
  - One row per employee (employee_id is unique)
  - Stores: date_of_birth, shirt_size, address, national_id, blood_group, allergies
  - Strictly admin-readable/writable; employee cannot read their own row via RLS

  ### employee_emergency_contacts
  - One row per employee (one primary emergency contact per employee)
  - Stores: contact_name, relationship, phone_primary, phone_alt
  - Strictly admin-readable/writable

  ## Security
  - RLS enabled on all three tables
  - handbook_sections: all authenticated users SELECT; only admins INSERT/UPDATE/DELETE
  - employee_personal_data: only admins can SELECT/INSERT/UPDATE/DELETE
  - employee_emergency_contacts: only admins can SELECT/INSERT/UPDATE/DELETE
*/

-- ─── Handbook Sections ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS handbook_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_order integer NOT NULL DEFAULT 0,
  title text NOT NULL CHECK (char_length(title) <= 200),
  body text NOT NULL DEFAULT '',
  last_updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE handbook_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read handbook"
  ON handbook_sections FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert handbook sections"
  ON handbook_sections FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update handbook sections"
  ON handbook_sections FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete handbook sections"
  ON handbook_sections FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_handbook_order ON handbook_sections(display_order);

-- ─── Employee Personal Data ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employee_personal_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  date_of_birth date,
  shirt_size text CHECK (shirt_size IN ('XS','S','M','L','XL','XXL','3XL')),
  address text DEFAULT '',
  national_id text DEFAULT '',
  blood_group text CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  allergies text DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE employee_personal_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select employee personal data"
  ON employee_personal_data FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert employee personal data"
  ON employee_personal_data FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update employee personal data"
  ON employee_personal_data FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete employee personal data"
  ON employee_personal_data FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─── Employee Emergency Contacts ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employee_emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  contact_name text DEFAULT '',
  relationship text DEFAULT '',
  phone_primary text DEFAULT '',
  phone_alt text DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE employee_emergency_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select emergency contacts"
  ON employee_emergency_contacts FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert emergency contacts"
  ON employee_emergency_contacts FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update emergency contacts"
  ON employee_emergency_contacts FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete emergency contacts"
  ON employee_emergency_contacts FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
