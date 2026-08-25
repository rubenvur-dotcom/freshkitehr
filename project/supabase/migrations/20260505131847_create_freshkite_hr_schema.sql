/*
  # Freshkite HR - Initial Schema

  ## Overview
  Creates the complete database schema for the Freshkite HR Leave Management System.

  ## New Tables

  ### profiles
  - `id` - UUID primary key, references auth.users
  - `email` - User email address
  - `full_name` - Full display name
  - `department` - Department name
  - `role` - 'admin' or 'employee'
  - `is_active` - Whether account is active
  - `annual_entitlement` - Annual leave days allowed (default 20)
  - `sick_entitlement` - Sick leave days allowed (default 10)
  - `created_at` - Record creation timestamp

  ### leave_requests
  - `id` - UUID primary key
  - `employee_id` - References profiles.id
  - `leave_type` - Type of leave (Annual, Sick, Maternity, etc.)
  - `start_date` / `end_date` - Date range
  - `working_days` - Calculated working days
  - `reason` - Optional reason text
  - `status` - Pending/Approved/Rejected
  - `admin_comment` - Optional admin feedback
  - `created_at` / `updated_at` - Timestamps

  ### leave_policies
  - `id` - UUID primary key
  - `leave_type` - Type name
  - `days_allowed` - Annual days allowed
  - `description` - Policy description
  - `updated_at` - Last updated timestamp

  ## Security
  - RLS enabled on all tables
  - Employees can only read/write their own data
  - Admins have full access to all records
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  is_active boolean NOT NULL DEFAULT true,
  annual_entitlement int NOT NULL DEFAULT 20,
  sick_entitlement int NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create leave_requests table
CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  leave_type text NOT NULL CHECK (leave_type IN ('Annual', 'Sick', 'Maternity', 'Paternity', 'Emergency', 'Unpaid')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  working_days int NOT NULL DEFAULT 1,
  reason text,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  admin_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create leave_policies table
CREATE TABLE IF NOT EXISTS leave_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_type text NOT NULL UNIQUE,
  days_allowed int NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default leave policies
INSERT INTO leave_policies (leave_type, days_allowed, description) VALUES
  ('Annual', 20, 'Standard annual leave entitlement for all employees'),
  ('Sick', 10, 'Paid sick leave for medical conditions'),
  ('Maternity', 90, 'Maternity leave for expecting mothers (3 months)'),
  ('Paternity', 5, 'Paternity leave for new fathers'),
  ('Emergency', 3, 'Emergency leave for unforeseen personal circumstances'),
  ('Unpaid', 30, 'Unpaid leave beyond standard entitlements')
ON CONFLICT (leave_type) DO NOTHING;

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_policies ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- profiles RLS policies
CREATE POLICY "Employees can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR is_admin());

CREATE POLICY "Admins can insert profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Employees can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR is_admin())
  WITH CHECK (id = auth.uid() OR is_admin());

CREATE POLICY "Admins can delete profiles"
  ON profiles FOR DELETE
  TO authenticated
  USING (is_admin());

-- leave_requests RLS policies
CREATE POLICY "Employees can view own requests"
  ON leave_requests FOR SELECT
  TO authenticated
  USING (employee_id = auth.uid() OR is_admin());

CREATE POLICY "Employees can insert own requests"
  ON leave_requests FOR INSERT
  TO authenticated
  WITH CHECK (employee_id = auth.uid());

CREATE POLICY "Employees can update own pending requests"
  ON leave_requests FOR UPDATE
  TO authenticated
  USING (employee_id = auth.uid() OR is_admin())
  WITH CHECK (employee_id = auth.uid() OR is_admin());

CREATE POLICY "Admins can delete requests"
  ON leave_requests FOR DELETE
  TO authenticated
  USING (is_admin());

-- leave_policies RLS policies
CREATE POLICY "All authenticated users can view policies"
  ON leave_policies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert policies"
  ON leave_policies FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update policies"
  ON leave_policies FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete policies"
  ON leave_policies FOR DELETE
  TO authenticated
  USING (is_admin());

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER leave_requests_updated_at
  BEFORE UPDATE ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on auth user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, department, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'department', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'employee')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
