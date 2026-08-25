/*
  # Add submitted_by_admin flag to leave_requests

  ## Changes
  - Adds `submitted_by_admin` boolean column to leave_requests (default false)
  - This flag marks requests that were entered by an admin on behalf of an employee
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_requests' AND column_name = 'submitted_by_admin'
  ) THEN
    ALTER TABLE leave_requests ADD COLUMN submitted_by_admin boolean NOT NULL DEFAULT false;
  END IF;
END $$;
