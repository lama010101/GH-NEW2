"use client";

import { useEffect } from "react";
import { useTranslations } from 'next-intl';
import modalStyles from "./PracticeSettingsModal.module.css";
import styles from "./PracticeResumeModal.module.css";

interface PracticeResumeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResume: () => void;
  onCreateNew: () => void;
}

export function PracticeResumeModal({ isOpen, onClose, onResume, onCreateNew }: PracticeResumeModalProps) {
  const t = useTranslations();

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={modalStyles.overlay}>
      <div className={modalStyles.backdrop} onClick={onClose} />
      <div className={`${modalStyles.card} ${styles.card}`}>
        <div className={modalStyles.header}>
          <h3>{t('practice.title')}</h3>
          <button type="button" className={modalStyles.closeBtn} onClick={onClose} aria-label={t('nav.close')}>✕</button>
        </div>
        <p className={styles.message}>{t('practice.resume_prompt')}</p>
        <div className={styles.actions}>
          <button type="button" className={`${modalStyles.startBtn} ${styles.resumeBtn}`} data-testid="practice-resume-btn" onClick={onResume}>
            {t('practice.resume_game')}
          </button>
          <button type="button" className={`${modalStyles.startBtn} ${styles.newBtn}`} data-testid="practice-new-game-btn" onClick={onCreateNew}>
            {t('practice.create_new_game')}
          </button>
        </div>
      </div>
    </div>
  );
}
