"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Settings } from "lucide-react";
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
  const [baselineDisplayName, setBaselineDisplayName] = useState(initialDisplayName);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarData, setAvatarData] = useState(avatar);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(avatar.image_url);

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
    fetch("/api/user/update-username", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: usernameValue.trim() }),
    })
      .then(() => onSaved?.())
      .catch(() => {});
    onClose();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <h2 className={styles.avatarIntro}>{t('your_historical_avatar')}</h2>

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
          <button
            type="button"
            className={styles.gearButton}
            onClick={() => setAvatarPickerOpen(true)}
            aria-label={t('choose_different_avatar')}
          >
            <Settings className={styles.gearIcon} />
          </button>
        </div>

        <div className={styles.avatarName}>{fullName}</div>

        <button onClick={() => setAvatarPickerOpen(true)} className={styles.skipLink} style={{ marginBottom: 16 }}>
          {t('choose_different_avatar')}
        </button>

        {bioLine && <div className={styles.bioLine}>{bioLine}</div>}

        {avatarData.description && (
          <div className={styles.description}>{avatarData.description}</div>
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
          setAvatarPickerOpen(false);
        }}
      />
    </div>
  );
}
