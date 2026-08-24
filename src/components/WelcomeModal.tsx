"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Settings, Loader2 } from "lucide-react";
import styles from "./WelcomeModal.module.css";
import { AvatarPickerModal } from "./AvatarPickerModal";
import { updateCachedDisplayName, updateCachedAvatarUrl } from "@/core/identity";
import { toProxiedImageUrl } from "@/lib/imageProxy";

export interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  avatar: {
    first_name: string;
    last_name: string | null;
    description: string | null;
    birth_city: string | null;
    birth_country: string | null;
    death_city: string | null;
    death_country: string | null;
    birth_day: string | null;
    death_day: string | null;
    image_url: string | null;
  };
  initialDisplayName: string;
  onSaved?: () => void;
}

export function WelcomeModal({ isOpen, onClose, avatar, initialDisplayName, onSaved }: WelcomeModalProps) {
  const router = useRouter();
  const t = useTranslations('welcome');
  const tCommon = useTranslations('common');
  const [isSaving, setIsSaving] = useState(false);
  const [usernameValue, setUsernameValue] = useState(initialDisplayName);
  const [baselineDisplayName, setBaselineDisplayName] = useState(initialDisplayName);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarData, setAvatarData] = useState(avatar);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(avatar.image_url);
  const [imgError, setImgError] = useState(false);
  const [imgRetryCount, setImgRetryCount] = useState(0);
  useEffect(() => { setImgError(false); setImgRetryCount(0) }, [avatarUrl]);

  // The avatar image can be freshly generated at signup time, so the first
  // request or two may race the CDN/storage propagation and 404. Retry a
  // few times with backoff before falling back to the initials placeholder.
  const MAX_IMG_RETRIES = 3;
  useEffect(() => {
    if (!imgError || imgRetryCount >= MAX_IMG_RETRIES) return;
    const delay = 400 * (imgRetryCount + 1);
    const timer = setTimeout(() => {
      setImgError(false);
      setImgRetryCount((n) => n + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [imgError, imgRetryCount]);

  if (!isOpen) return null;

  const fullName = avatarData.first_name + (avatarData.last_name ? ` ${avatarData.last_name}` : "");

  // Build initials fallback
  const initials = avatarData.first_name.slice(0, 1) + (avatarData.last_name ? avatarData.last_name.slice(0, 1) : "");

  // Build bio line only if at least one birth/death field exists
  const hasBirthData = avatarData.birth_day || avatarData.birth_city || avatarData.birth_country;
  const hasDeathData = avatarData.death_day || avatarData.death_city || avatarData.death_country;
  let bioLine = "";
  if (hasBirthData || hasDeathData) {
    const birthParts: string[] = [];
    if (avatarData.birth_day) birthParts.push(avatarData.birth_day);
    if (avatarData.birth_city) birthParts.push(avatarData.birth_city);
    if (avatarData.birth_country) birthParts.push(avatarData.birth_country);

    const deathParts: string[] = [];
    if (avatarData.death_day) deathParts.push(avatarData.death_day);
    if (avatarData.death_city) deathParts.push(avatarData.death_city);
    if (avatarData.death_country) deathParts.push(avatarData.death_country);

    const parts: string[] = [];
    if (birthParts.length > 0) {
      parts.push(`${tCommon('born_prefix')} ${birthParts.join(" ")}`);
    }
    if (deathParts.length > 0) {
      parts.push(`${tCommon('died_prefix')} ${deathParts.join(" ")}`);
    }
    bioLine = parts.join("  •  ");
  }

  const handleSave = () => {
    if (isSaving) return;
    setIsSaving(true);
    const nextName = usernameValue.trim();
    fetch("/api/user/update-username", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: nextName, welcome_completed: true }),
    })
      .then(() => {
        updateCachedDisplayName(nextName);
        if (avatarUrl) updateCachedAvatarUrl(avatarUrl);
        onSaved?.();
      })
      .catch(() => {})
      .finally(() => {
        onClose();
        router.push("/home");
      });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <h2 className={styles.avatarIntro}>{t('your_historical_avatar')}</h2>

        <div className={styles.avatarWrap}>
          {avatarUrl && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={imgRetryCount}
              src={
                imgRetryCount === 0
                  ? toProxiedImageUrl(avatarUrl) ?? ''
                  : `${toProxiedImageUrl(avatarUrl) ?? ''}${(toProxiedImageUrl(avatarUrl) ?? '').includes('?') ? '&' : '?'}retry=${imgRetryCount}`
              }
              alt={fullName}
              className={styles.avatarImg}
              onError={() => setImgError(true)}
            />
          ) : (
            <span className={styles.avatarInitials}>{initials.toUpperCase()}</span>
          )}
          <button
            type="button"
            className={styles.gearButton}
            onClick={() => setAvatarPickerOpen(true)}
            aria-label={t('choose_different_avatar')}
          >
            <Settings className={styles.gearIcon} />
          </button>
        </div>

        {bioLine && <div className={styles.bioLine}>{bioLine}</div>}

        {avatarData.description && (
          <div className={styles.description}>{avatarData.description}</div>
        )}

        <div className={styles.avatarName}>{fullName}</div>

        <button onClick={() => setAvatarPickerOpen(true)} className={styles.skipLink} style={{ marginBottom: 16 }}>
          {t('choose_different_avatar')}
        </button>

        <div className={styles.usernameLabel} aria-label={t('your_username')}>
          <div className={styles.usernameMarqueeTrack}>
            <span>{t('username_label_1')} · {t('username_label_2')} · {t('username_label_3')}</span>
            <span aria-hidden="true">{t('username_label_1')} · {t('username_label_2')} · {t('username_label_3')}</span>
          </div>
        </div>
        <input
          type="text"
          value={usernameValue}
          onChange={(e) => setUsernameValue(e.target.value.slice(0, 40))}
          className={styles.usernameInput}
          maxLength={40}
        />

        <button
          onClick={handleSave}
          className={styles.saveButton}
          disabled={isSaving}
          aria-busy={isSaving}
        >
          {isSaving ? <Loader2 className={styles.saveSpinner} aria-hidden="true" /> : t('lets_play')}
        </button>
      </div>

      <AvatarPickerModal
        isOpen={avatarPickerOpen}
        currentAvatarUrl={avatarUrl}
        showSkip={true}
        onSkip={() => setAvatarPickerOpen(false)}
        onClose={() => setAvatarPickerOpen(false)}
        onSave={async (url) => {
          const untouched = usernameValue.trim() === baselineDisplayName.trim();
          const res = await fetch("/api/user/update-avatar", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ avatar_url: url, regenerate_display_name: untouched }),
          });
          const data = await res.json();
          if (data.avatar) {
            setAvatarData({
              first_name: data.avatar.first_name,
              last_name: data.avatar.last_name,
              description: data.avatar.description,
              birth_city: data.avatar.birth_city,
              birth_country: data.avatar.birth_country,
              death_city: data.avatar.death_city,
              death_country: data.avatar.death_country,
              birth_day: data.avatar.birth_day,
              death_day: data.avatar.death_day,
              image_url: data.avatar.image_url,
            });
            setAvatarUrl(data.avatar.image_url);
          } else {
            setAvatarUrl(url);
          }
          if (untouched && typeof data.display_name === "string" && data.display_name.length > 0) {
            setUsernameValue(data.display_name);
            setBaselineDisplayName(data.display_name);
          }
          onSaved?.();
          setAvatarPickerOpen(false);
        }}
      />
    </div>
  );
}
