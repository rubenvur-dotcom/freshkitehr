/*
  # Employee Documents

  ## Overview
  Adds document management for employees. Admins upload documents;
  employees can only view their own.

  ## New Tables

  ### employee_documents
  - `id` (uuid, primary key)
  - `employee_id` (uuid, references profiles.id) — the employee this document belongs to
  - `folder` (text) — one of: tax, contract, communication, personal, payslip
  - `file_name` (text) — original filename
  - `file_url` (text) — Supabase Storage object path (used to generate signed URLs)
  - `file_size` (int) — file size in bytes
  - `uploaded_at` (timestamptz, default now())
  - `uploaded_by` (uuid, references profiles.id) — uploader (admin or employee)

  ## Security (RLS)
  - Employees can SELECT only documents where employee_id = auth.uid()
  - Employees cannot INSERT, UPDATE, or DELETE documents
  - Admins can SELECT, INSERT, UPDATE, DELETE all documents
  - Service role has full access (needed for storage operations)

  ## Notes
  - Files are stored in the `employee-documents` Storage bucket
  - File paths follow the pattern: {employee_id}/{folder}/{filename}
  - Signed URLs (60s expiry) are generated client-side via supabase.storage
*/

CREATE TABLE IF NOT EXISTS employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  folder text NOT NULL CHECK (folder IN ('tax', 'contract', 'communication', 'personal', 'payslip')),
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size int NOT NULL DEFAULT 0,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid NOT NULL REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS employee_documents_employee_id_idx ON employee_documents(employee_id);
CREATE INDEX IF NOT EXISTS employee_documents_folder_idx ON employee_documents(employee_id, folder);

ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;

-- Employees: SELECT only their own documents
CREATE POLICY "Employees can view own documents"
  ON employee_documents FOR SELECT
  TO authenticated
  USING (employee_id = auth.uid() OR is_admin());

-- Admins: INSERT documents
CREATE POLICY "Admins can insert documents"
  ON employee_documents FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- Admins: UPDATE documents
CREATE POLICY "Admins can update documents"
  ON employee_documents FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Admins: DELETE documents
CREATE POLICY "Admins can delete documents"
  ON employee_documents FOR DELETE
  TO authenticated
  USING (is_admin());
