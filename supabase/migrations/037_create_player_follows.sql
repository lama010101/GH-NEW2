-- Migration: create_player_follows
-- One-directional follow/favorites. No confirmation required.

CREATE TABLE player_follows (
  follower_id  UUID NOT NULL,
  followed_id  UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followed_id),
  CHECK (follower_id <> followed_id)
);

CREATE INDEX idx_player_follows_follower ON player_follows (follower_id);
CREATE INDEX idx_player_follows_followed ON player_follows (followed_id);

ALTER TABLE player_follows ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own follow rows (both directions)
CREATE POLICY "player_follows_select"
  ON player_follows FOR SELECT
  TO authenticated
  USING (follower_id = auth.uid() OR followed_id = auth.uid());

-- Users can only insert rows where they are the follower
CREATE POLICY "player_follows_insert"
  ON player_follows FOR INSERT
  TO authenticated
  WITH CHECK (follower_id = auth.uid());

-- Users can only delete rows where they are the follower
CREATE POLICY "player_follows_delete"
  ON player_follows FOR DELETE
  TO authenticated
  USING (follower_id = auth.uid());
