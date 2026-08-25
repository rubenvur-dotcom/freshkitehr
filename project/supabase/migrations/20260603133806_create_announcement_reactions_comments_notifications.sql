/*
  # Announcement Reactions, Comments & Notification Tracking

  ## New Tables

  ### announcement_reactions
  - Stores per-user emoji reactions on announcements
  - One row per (user, announcement, emoji) — upsert logic enforces uniqueness
  - `emoji`: one of 'like' | 'love' | 'celebrate' | 'applaud' | 'happy' | 'sad'

  ### announcement_comments
  - Threaded comments on announcements
  - Stores author, text, and timestamp
  - Admin-deletable via policy

  ### announcement_read_markers
  - Tracks which users have "seen" each announcement (visited the page)
  - Used to clear the red "new announcement" badge per user

  ### announcement_comment_seen
  - Tracks which users have expanded the comments section on a given announcement
  - Used to clear the blue "new comment" badge per user on a per-post basis

  ## Security
  - RLS enabled on all four tables
  - Authenticated users can manage their own reactions/reads/seen markers
  - Authenticated users can insert comments and read all comments
  - Only admins can delete any comment; users can delete their own
*/

-- ─── Reactions ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS announcement_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('like','love','celebrate','applaud','happy','sad')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (announcement_id, user_id, emoji)
);

ALTER TABLE announcement_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all reactions"
  ON announcement_reactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own reactions"
  ON announcement_reactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own reactions"
  ON announcement_reactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ─── Comments ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS announcement_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) <= 500),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE announcement_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view comments"
  ON announcement_comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert comments"
  ON announcement_comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can delete own comments or admins can delete any"
  ON announcement_comments FOR DELETE
  TO authenticated
  USING (
    auth.uid() = author_id
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ─── Read Markers (clears red badge) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS announcement_read_markers (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id)
);

ALTER TABLE announcement_read_markers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own read marker"
  ON announcement_read_markers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own read marker"
  ON announcement_read_markers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own read marker"
  ON announcement_read_markers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Comment Seen Markers (clears blue badge per post) ───────────────────────

CREATE TABLE IF NOT EXISTS announcement_comment_seen (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, announcement_id)
);

ALTER TABLE announcement_comment_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own comment seen markers"
  ON announcement_comment_seen FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own comment seen markers"
  ON announcement_comment_seen FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comment seen markers"
  ON announcement_comment_seen FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_reactions_announcement ON announcement_reactions(announcement_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user ON announcement_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_announcement ON announcement_comments(announcement_id);
CREATE INDEX IF NOT EXISTS idx_comment_seen_user ON announcement_comment_seen(user_id);
