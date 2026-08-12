-- Migration: add_image_status_to_images
-- Task: AIP-BUILD-IMAGEHEALTH-PRACTICELOOP-001
-- Target: PROD (gzvixlvkwjsrtmtybtkf)

ALTER TABLE public.images
  ADD COLUMN IF NOT EXISTS image_status TEXT NOT NULL DEFAULT 'unchecked'
    CONSTRAINT images_image_status_check CHECK (image_status IN ('ok','broken','unchecked')),
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_checked_by_ai_player_id UUID NULL REFERENCES public.ai_players(id);

CREATE INDEX IF NOT EXISTS idx_images_image_status ON public.images (image_status);
CREATE INDEX IF NOT EXISTS idx_images_last_checked_at ON public.images (last_checked_at NULLS FIRST);
