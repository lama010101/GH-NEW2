"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import styles from "./WelcomeModal.module.css";
import { AvatarPickerModal } from "./AvatarPickerModal";

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
  const t = useTranslations('welcome');
  const tCommon = useTranslations('common');
  const [usernameValue, setUsernameValue] = useState(initialDisplayName);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(avatar.image_url);

  if (!isOpen) return null;

  const fullName = avatar.first_name + (avatar.last_name ? ` ${avatar.last_name}` : "");

  // Build initials fallback
  const initials = avatar.first_name.slice(0, 1) + (avatar.last_name ? avatar.last_name.slice(0, 1) : "");

  // Build bio line only if at least one birth/death field exists
  const hasBirthData = avatar.birth_day || avatar.birth_city || avatar.birth_country;
  const hasDeathData = avatar.death_day || avatar.death_city || avatar.death_country;
  let bioLine = "";
  if (hasBirthData || hasDeathData) {
    const birthParts: string[] = [];
    if (avatar.birth_day) birthParts.push(avatar.birth_day);
    if (avatar.birth_city) birthParts.push(avatar.birth_city);
    if (avatar.birth_country) birthParts.push(avatar.birth_country);

    const deathParts: string[] = [];
    if (avatar.death_day) deathParts.push(avatar.death_day);
    if (avatar.death_city) deathParts.push(avatar.death_city);
    if (avatar.death_country) deathParts.push(avatar.death_country);

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
    fetch("/api/user/update-username", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: usernameValue.trim() }),
    })
      .then(() => onSaved?.())
      .catch(() => {});
    onClose();
  };

  const handleSkip = () => {
    onClose();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <h2 className={styles.greeting}>{t('title')}</h2>

        <p className={styles.avatarIntro}>{t('your_historical_avatar')}</p>

        <div className={styles.avatarWrap}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={fullName}
              className={styles.avatarImg}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget as HTMLImageElement).nextElementSibling?.removeAttribute("hidden"); }}
            />
          ) : null}
          <span className={styles.avatarInitials} style={{ display: avatarUrl ? "none" : "inline" }}>{initials.toUpperCase()}</span>
        </div>

        <div className={styles.avatarName}>{fullName}</div>

        <button onClick={() => setAvatarPickerOpen(true)} className={styles.skipLink} style={{ marginBottom: 16 }}>
          {t('choose_different_avatar')}
        </button>

        {bioLine && <div className={styles.bioLine}>{bioLine}</div>}

        {avatar.description && (
          <div className={styles.description}>{avatar.description}</div>
        )}

        <div className={styles.usernameLabel}>{t('your_username')}</div>
        <input
          type="text"
          value={usernameValue}
          onChange={(e) => setUsernameValue(e.target.value.slice(0, 40))}
          className={styles.usernameInput}
          maxLength={40}
        />

        <button onClick={handleSave} className={styles.saveButton}>
          {t('lets_play')}
        </button>

        <span onClick={handleSkip} className={styles.skipLink}>
          {t('skip_for_now')}
        </span>
      </div>

      <AvatarPickerModal
        isOpen={avatarPickerOpen}
        currentAvatarUrl={avatarUrl}
        showSkip={true}
        onSkip={() => setAvatarPickerOpen(false)}
        onClose={() => setAvatarPickerOpen(false)}
        onSave={async (url) => {
          await fetch("/api/user/update-avatar", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ avatar_url: url }),
          });
          setAvatarUrl(url);
          setAvatarPickerOpen(false);
        }}
      />
    </div>
  );
}
