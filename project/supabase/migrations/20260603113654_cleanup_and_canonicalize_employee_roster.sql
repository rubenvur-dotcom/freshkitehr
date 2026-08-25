/*
  # Canonicalize Employee Roster

  1. Removes duplicate/legacy demo entries that conflict with the official 22-employee list
  2. The canonical 22 employees already exist with correct full_names and freshkite.net emails
  3. Deactivates legacy placeholder accounts (bilaal@, maxime@, arshad@, veemal@) 
     that predate the full names being added — they are superseded by the canonical entries

  Notes:
  - We do NOT delete any auth users — only mark profiles inactive to avoid FK issues
  - The canonical accounts (jaggeshar.veemal@, badul.muhammad@, salemohamed.bilaal@, etc.) remain active
*/

-- Deactivate legacy placeholder profiles (superseded by canonical full-name records)
UPDATE profiles SET is_active = false
WHERE email IN (
  'bilaal@freshkite.net',    -- superseded by salemohamed.bilaal@freshkite.net
  'maxime@freshkite.net',    -- superseded by blin.philippe@freshkite.net
  'arshad@freshkite.net',    -- superseded by badul.muhammad@freshkite.net
  'veemal@freshkite.net'     -- superseded by jaggeshar.veemal@freshkite.net
);

-- Deactivate the inactive test account
UPDATE profiles SET is_active = false
WHERE email = 'jane@fk.net';

-- Set default employment fields for all active employees that don't have them yet
UPDATE profiles
SET
  has_probation = false,
  probation_status = 'passed',
  total_annual_entitlement = 22,
  annual_entitlement = 22,
  sick_entitlement = 21,
  date_of_hire = '2023-01-01'
WHERE
  role = 'employee'
  AND is_active = true
  AND (date_of_hire IS NULL OR has_probation IS NULL);
