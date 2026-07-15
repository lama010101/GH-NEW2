-- MP-FIX-SYNC-LOBBY-ENFORCEMENT-001-BUG2
-- Distinguish kick from graceful disconnect in session_players.
-- kickCompetePlayer sets kicked=TRUE; /leave and disconnect-debounce set only left_at.
-- joinCompeteSession checks kicked=TRUE before the upsert to hard-block rejoin.

ALTER TABLE session_players ADD COLUMN IF NOT EXISTS kicked BOOLEAN NOT NULL DEFAULT FALSE;

-- Allow 'cancelled' status in game_invitations so kick can cancel pending invites.
ALTER TABLE game_invitations DROP CONSTRAINT IF EXISTS game_invitations_status_check;
ALTER TABLE game_invitations ADD CONSTRAINT game_invitations_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled'));
