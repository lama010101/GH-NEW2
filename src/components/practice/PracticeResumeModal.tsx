"use client";

import { useEffect } from "react";
import modalStyles from "./PracticeSettingsModal.module.css";
import styles from "./PracticeResumeModal.module.css";

interface PracticeResumeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResume: () => void;
  onCreateNew: () => void;
}

export function PracticeResumeModal({ isOpen, onClose, onResume, onCreateNew }: PracticeResumeModalProps) {
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
          <h3>Practice game in progress</h3>
          <button type="button" className={modalStyles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className={styles.message}>You have an unfinished Practice game. What would you like to do?</p>
        <div className={styles.actions}>
          <button type="button" className={`${modalStyles.startBtn} ${styles.resumeBtn}`} data-testid="practice-resume-btn" onClick={onResume}>
            Resume game in progress
          </button>
          <button type="button" className={`${modalStyles.startBtn} ${styles.newBtn}`} data-testid="practice-new-game-btn" onClick={onCreateNew}>
            Create new game
          </button>
        </div>
      </div>
    </div>
  );
}
