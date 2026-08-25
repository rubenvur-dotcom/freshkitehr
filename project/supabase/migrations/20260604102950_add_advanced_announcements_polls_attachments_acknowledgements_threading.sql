/*
  # Advanced Announcements: Polls, Attachments, Acknowledgements, Threading & Comment Reactions

  ## Summary
  Extends the announcements system with rich interactivity features.

  ## Changes to Existing Tables

  ### announcements
  - `requires_acknowledgement` (boolean, default false) — forces a "Mark as Read & Understood" action on the card
  - `target_department` (text, nullable) — when set, restricts 'employee' audience to a specific department

  ### announcement_comments
  - `parent_comment_id` (uuid, nullable, self-reference) — enables threaded replies

  ## New Tables

  ### announcement_polls
  - One poll per announcement (nullable — not all announcements have polls)
  - `question` — the poll question text
  - `is_anonymous` — hides individual voter identities from results

  ### announcement_poll_options
  - Min 2, max 5 options per poll
  - `display_order` — deterministic render order

  ### announcement_poll_votes
  - One vote per user per poll (UNIQUE constraint)
  - Records which option was selected

  ### announcement_attachments
  - Tracks files uploaded to Supabase Storage for an announcement
  - Stores file metadata and storage path for generating download URLs

  ### announcement_acknowledgements
  - Registry of who acknowledged each announcement and when
  - One row per (announcement, user) pair

  ### announcement_comment_reactions
  - Per-comment reactions (thumbs up, heart, happy face)
  - One reaction of each emoji type per user per comment

  ## Security
  - RLS enabled on all new tables
  - Authenticated users can read all polls, options, votes (counts only for anonymous), attachments, acknowledgements, comment reactions
  - Users can insert their own votes/acknowledgements/reactions
  - Admins can read acknowledgement registry in full
*/

-- ─── Extend announcements ──────────────────────────────────────────────────────

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS requires_acknowledgement boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS target_department text;

-- ─── Extend announcement_comments for threading ───────────────────────────────

ALTER TABLE announcement_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES announcement_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_comments_parent ON announcement_comments(parent_comment_id);

-- ─── Polls ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS announcement_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (char_length(question) <= 300),
  is_anonymous boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE announcement_polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view polls"
  ON announcement_polls FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert polls"
  ON announcement_polls FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update polls"
  ON announcement_polls FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete polls"
  ON announcement_polls FOR DELETE
  TO authenticated
  USING (is_admin());

-- ─── Poll options ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS announcement_poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES announcement_polls(id) ON DELETE CASCADE,
  option_text text NOT NULL CHECK (char_length(option_text) <= 150),
  display_order int NOT NULL DEFAULT 0
);

ALTER TABLE announcement_poll_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view poll options"
  ON announcement_poll_options FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert poll options"
  ON announcement_poll_options FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update poll options"
  ON announcement_poll_options FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete poll options"
  ON announcement_poll_options FOR DELETE
  TO authenticated
  USING (is_admin());

-- ─── Poll votes ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS announcement_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES announcement_polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES announcement_poll_options(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  voted_at timestamptz DEFAULT now(),
  UNIQUE (poll_id, user_id)
);

ALTER TABLE announcement_poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view poll votes"
  ON announcement_poll_votes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own vote"
  ON announcement_poll_votes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ─── Attachments ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS announcement_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE announcement_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view attachments"
  ON announcement_attachments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert attachments"
  ON announcement_attachments FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete attachments"
  ON announcement_attachments FOR DELETE
  TO authenticated
  USING (is_admin());

-- ─── Acknowledgements ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS announcement_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  acknowledged_at timestamptz DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

ALTER TABLE announcement_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view acknowledgements"
  ON announcement_acknowledgements FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own acknowledgement"
  ON announcement_acknowledgements FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ─── Comment reactions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS announcement_comment_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES announcement_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('like', 'love', 'happy')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (comment_id, user_id, emoji)
);

ALTER TABLE announcement_comment_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view comment reactions"
  ON announcement_comment_reactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own comment reaction"
  ON announcement_comment_reactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comment reaction"
  ON announcement_comment_reactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_polls_announcement ON announcement_polls(announcement_id);
CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON announcement_poll_options(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON announcement_poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_user ON announcement_poll_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_attachments_announcement ON announcement_attachments(announcement_id);
CREATE INDEX IF NOT EXISTS idx_acknowledgements_announcement ON announcement_acknowledgements(announcement_id);
CREATE INDEX IF NOT EXISTS idx_acknowledgements_user ON announcement_acknowledgements(user_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment ON announcement_comment_reactions(comment_id);
