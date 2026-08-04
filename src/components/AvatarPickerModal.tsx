'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { supabaseBrowser } from '@/core/supabaseBrowser';
import { toProxiedImageUrl } from '@/lib/imageProxy';
import avatarPickerStyles from '@/app/profile/avatarPicker.module.css';

type Avatar = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
  firebase_url: string | null;
};

export interface AvatarPickerModalProps {
  isOpen: boolean;
  currentAvatarUrl: string | null;
  onSave: (avatarUrl: string) => Promise<void>;
  onClose: () => void;
  showSkip?: boolean;
  onSkip?: () => void;
}

export function AvatarPickerModal({
  isOpen,
  currentAvatarUrl,
  onSave,
  onClose,
  showSkip = false,
  onSkip,
}: AvatarPickerModalProps) {
  const t = useTranslations('avatar_picker');
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingAvatars, setIsLoadingAvatars] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedAvatar(currentAvatarUrl);
    setSearchQuery('');

    const fetchAvatars = async () => {
      setIsLoadingAvatars(true);
      try {
        const { data } = await supabaseBrowser
          .from('avatars')
          .select('id, first_name, last_name, image_url, firebase_url')
          .eq('ready', true);
        setAvatars(data ?? []);
      } catch (error) {
        console.error('Error fetching avatars:', error);
        setAvatars([]);
      } finally {
        setIsLoadingAvatars(false);
      }
    };

    fetchAvatars();
  }, [isOpen, currentAvatarUrl]);

  if (!isOpen) return null;

  const getAvatarUrl = (avatar: Avatar): string => {
    return avatar.firebase_url || avatar.image_url || '';
  };

  const getAvatarName = (avatar: Avatar): string => {
    const parts: string[] = [];
    if (avatar.first_name) parts.push(avatar.first_name);
    if (avatar.last_name) parts.push(avatar.last_name);
    return parts.join(' ') || t('unknown');
  };

  const filteredAvatars = avatars.filter(avatar => {
    const name = getAvatarName(avatar).toLowerCase();
    return name.includes(searchQuery.toLowerCase());
  });

  const handleSave = async () => {
    if (!selectedAvatar) return;
    setIsSavingAvatar(true);
    try {
      await onSave(selectedAvatar);
    } catch (error) {
      console.error('Error saving avatar:', error);
    } finally {
      setIsSavingAvatar(false);
    }
  };

  return (
    <div className={avatarPickerStyles.modalOverlay}>
      <div className={avatarPickerStyles.modalCard}>
        <div className={avatarPickerStyles.modalHeader}>
          <h3 className={avatarPickerStyles.modalTitle}>{t('title')}</h3>
          <button
            className={avatarPickerStyles.closeButton}
            onClick={onClose}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"/>
              <path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
        <div className={avatarPickerStyles.modalContent}>
          <input
            type="text"
            className={avatarPickerStyles.searchInput}
            placeholder={t('search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {isLoadingAvatars ? (
            <div className={avatarPickerStyles.emptyState}>{t('loading')}</div>
          ) : filteredAvatars.length === 0 ? (
            <div className={avatarPickerStyles.emptyState}>{t('no_avatars')}</div>
          ) : (
            <div className={avatarPickerStyles.avatarGrid}>
              {filteredAvatars.map((avatar) => {
                const url = getAvatarUrl(avatar);
                const name = getAvatarName(avatar);
                return (
                  <div
                    key={avatar.id}
                    className={`${avatarPickerStyles.avatarCell} ${selectedAvatar === url ? avatarPickerStyles.selected : ''}`}
                    onClick={() => setSelectedAvatar(url)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={toProxiedImageUrl(url) ?? ''}
                      alt={name}
                      className={avatarPickerStyles.avatarImage}
                    />
                    <span className={avatarPickerStyles.avatarName}>{name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className={avatarPickerStyles.modalFooter}>
          {showSkip && (
            <button
              className={avatarPickerStyles.saveButton}
              style={{ background: 'transparent', color: 'var(--gh-modal-text-muted)', boxShadow: 'none' }}
              onClick={() => { onSkip?.(); }}
              disabled={isSavingAvatar}
            >
              {t('skip')}
            </button>
          )}
          <button
            className={avatarPickerStyles.saveButton}
            onClick={handleSave}
            disabled={!selectedAvatar || isSavingAvatar}
          >
            {isSavingAvatar ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
