-- Migration: Create round_hints table for tracking hint usage per round
-- Task: MP-FEAT-ROUND-HINTS-MIGRATION-001

CREATE TABLE round_hints (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id      UUID    NOT NULL,
  player_id    UUID    NOT NULL,
  round_index  INT     NOT NULL,
  hint_id      UUID    NOT NULL REFERENCES hints(id),
  revealed_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_round_hints_commit
  ON round_hints (game_id, player_id, round_index);

ALTER TABLE round_hints ENABLE ROW LEVEL SECURITY;

CREATE POLICY round_hints_select
  ON round_hints FOR SELECT
  TO authenticated
  USING (player_id = auth.uid());
