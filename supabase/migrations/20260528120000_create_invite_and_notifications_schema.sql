-- TABLE 1: follows
-- Unilateral follow model. follower_id follows followee_id. No symmetry required.
CREATE TABLE public.follows (
  follower_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followee_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CONSTRAINT no_self_follow CHECK (follower_id <> followee_id)
);
CREATE INDEX idx_follows_followee ON public.follows (followee_id);

-- TABLE 2: game_invitations
-- One row per invite. A host invites a player to a specific game session.
CREATE TABLE public.game_invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       UUID NOT NULL,
  inviter_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  CONSTRAINT no_self_invite CHECK (inviter_id <> invitee_id),
  CONSTRAINT unique_active_invite UNIQUE (game_id, invitee_id)
);
CREATE INDEX idx_game_invitations_invitee ON public.game_invitations (invitee_id, status);
CREATE INDEX idx_game_invitations_game ON public.game_invitations (game_id);

-- TABLE 3: notifications
-- In-app notification feed. One row per notification per user.
CREATE TABLE public.notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('lobby_invite', 'friend_joined', 'game_started')),
  payload       JSONB NOT NULL DEFAULT '{}',
  read          BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON public.notifications (user_id, read, created_at DESC);

-- RLS POLICIES
-- Enable RLS on all three tables
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- follows: authenticated users can read follows involving themselves
CREATE POLICY "follows_select" ON public.follows FOR SELECT TO authenticated
  USING (follower_id = auth.uid() OR followee_id = auth.uid());
CREATE POLICY "follows_insert" ON public.follows FOR INSERT TO authenticated
  WITH CHECK (follower_id = auth.uid());
CREATE POLICY "follows_delete" ON public.follows FOR DELETE TO authenticated
  USING (follower_id = auth.uid());

-- game_invitations: inviter and invitee can read; inviter can insert; invitee can update status
CREATE POLICY "invitations_select" ON public.game_invitations FOR SELECT TO authenticated
  USING (inviter_id = auth.uid() OR invitee_id = auth.uid());
CREATE POLICY "invitations_insert" ON public.game_invitations FOR INSERT TO authenticated
  WITH CHECK (inviter_id = auth.uid());
CREATE POLICY "invitations_update" ON public.game_invitations FOR UPDATE TO authenticated
  USING (invitee_id = auth.uid())
  WITH CHECK (invitee_id = auth.uid());

-- notifications: user can only read/update their own
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
-- service role inserts notifications (no INSERT policy for authenticated)
