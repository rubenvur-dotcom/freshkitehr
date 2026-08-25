/*
  # Add color and is_default columns to leave_policies

  1. Changes to leave_policies
    - `color` (text) - hex color code for custom leave types
    - `is_default` (boolean) - marks the 6 built-in types as non-deletable

  2. Seeds
    - Sets is_default = true for the 6 original types
    - Assigns default colors matching existing UI accents
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_policies' AND column_name = 'color'
  ) THEN
    ALTER TABLE leave_policies ADD COLUMN color text DEFAULT '#6B7280';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_policies' AND column_name = 'is_default'
  ) THEN
    ALTER TABLE leave_policies ADD COLUMN is_default boolean DEFAULT false;
  END IF;
END $$;

UPDATE leave_policies SET is_default = true, color = '#1D9E75' WHERE leave_type = 'Annual';
UPDATE leave_policies SET is_default = true, color = '#F59E0B' WHERE leave_type = 'Sick';
UPDATE leave_policies SET is_default = true, color = '#EC4899' WHERE leave_type = 'Maternity';
UPDATE leave_policies SET is_default = true, color = '#3B82F6' WHERE leave_type = 'Paternity';
UPDATE leave_policies SET is_default = true, color = '#EF4444' WHERE leave_type = 'Emergency';
UPDATE leave_policies SET is_default = true, color = '#6B7280' WHERE leave_type = 'Unpaid';
