UPDATE profiles p
SET avatar_url = a.firebase_url,
    updated_at = now()
FROM avatars a
WHERE a.image_url = p.avatar_url
  AND a.firebase_url IS NOT NULL
  AND a.firebase_url <> '';
