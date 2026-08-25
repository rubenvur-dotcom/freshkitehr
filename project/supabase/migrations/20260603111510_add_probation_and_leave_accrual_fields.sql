/*
  # Add Probation & Dynamic Leave Accrual Fields

  1. Changes to `profiles` table
    - `date_of_hire` (date) - employee start date
    - `has_probation` (boolean) - whether probation applies
    - `probation_duration_months` (integer) - 3, 6, or custom months
    - `probation_end_date` (date) - calculated or manually set end date
    - `probation_status` (text) - 'in_probation' | 'passed' | 'extended'
    - `total_annual_entitlement` (integer) - default 22 days/year (replaces old annual_entitlement context)

  2. Changes to `leave_requests` table
    - `is_short_notice` (boolean) - flags requests submitted < 2 working days ahead
    - `short_notice_reason` (text) - reason given for short-notice bypass

  3. Security
    - Employees can update short_notice_reason on their own rows
    - Admins can update probation fields on any profile
*/

-- Profiles: probation fields
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='date_of_hire') THEN
    ALTER TABLE profiles ADD COLUMN date_of_hire date;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='has_probation') THEN
    ALTER TABLE profiles ADD COLUMN has_probation boolean DEFAULT true;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='probation_duration_months') THEN
    ALTER TABLE profiles ADD COLUMN probation_duration_months integer DEFAULT 3;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='probation_end_date') THEN
    ALTER TABLE profiles ADD COLUMN probation_end_date date;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='probation_status') THEN
    ALTER TABLE profiles ADD COLUMN probation_status text DEFAULT 'passed'
      CHECK (probation_status IN ('in_probation', 'passed', 'extended'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='total_annual_entitlement') THEN
    ALTER TABLE profiles ADD COLUMN total_annual_entitlement integer DEFAULT 22;
  END IF;
END $$;

-- Leave requests: short-notice fields
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='is_short_notice') THEN
    ALTER TABLE leave_requests ADD COLUMN is_short_notice boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='short_notice_reason') THEN
    ALTER TABLE leave_requests ADD COLUMN short_notice_reason text;
  END IF;
END $$;
