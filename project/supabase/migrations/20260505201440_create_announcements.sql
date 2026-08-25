/*
  # Announcements & Notice Board

  ## Overview
  Adds the announcements system for the Freshkite HR notice board.
  Admins create/edit/delete announcements; all authenticated users
  can read those targeted at their role.

  ## New Tables

  ### announcements
  - `id` (uuid, primary key)
  - `title` (text) — announcement headline
  - `body` (text) — full announcement text
  - `priority` (text) — 'normal' | 'important' | 'urgent'
  - `target_audience` (text) — 'all' | 'admin' | 'employee'
  - `author_id` (uuid, references profiles.id)
  - `is_pinned` (boolean, default false) — pinned announcements float to top
  - `expires_at` (timestamptz, nullable) — hidden after this date when set
  - `created_at` (timestamptz, default now())

  ## Security (RLS)
  - Authenticated users can SELECT announcements where:
      target_audience = 'all'
      OR target_audience matches their own role (via profiles lookup)
  - Only admins can INSERT, UPDATE, DELETE

  ## Notes
  - Pinned + urgent announcements sort first on the client
  - The expires_at filter is applied client-side for flexibility,
    but can be enforced server-side with an additional RLS predicate
*/

CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
  target_audience text NOT NULL DEFAULT 'all' CHECK (target_audience IN ('all', 'admin', 'employee')),
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_pinned boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS announcements_created_at_idx ON announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS announcements_author_idx ON announcements(author_id);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- All authenticated users can SELECT announcements visible to their role
CREATE POLICY "Authenticated users can view relevant announcements"
  ON announcements FOR SELECT
  TO authenticated
  USING (
    target_audience = 'all'
    OR target_audience = (
      SELECT role FROM profiles WHERE id = auth.uid()
    )
  );

-- Only admins can INSERT
CREATE POLICY "Admins can insert announcements"
  ON announcements FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- Only admins can UPDATE
CREATE POLICY "Admins can update announcements"
  ON announcements FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Only admins can DELETE
CREATE POLICY "Admins can delete announcements"
  ON announcements FOR DELETE
  TO authenticated
  USING (is_admin());
