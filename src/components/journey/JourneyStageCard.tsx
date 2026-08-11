'use client';

import { useTranslations } from 'next-intl';
import type { JourneyStageWithProgress } from '@/core/journeyTypes';
import styles from './JourneyStageList.module.css';

type JourneyStageCardProps = {
  stage: JourneyStageWithProgress;
  onClick: (stage: JourneyStageWithProgress) => void;
};

export default function JourneyStageCard({ stage, onClick }: JourneyStageCardProps) {
  const t = useTranslations('journey');
  const isLocked = stage.computed_status === 'locked';
  const isCompleted = stage.computed_status === 'completed';

  const handleClick = () => {
    if (!isLocked) {
      onClick(stage);
    }
  };

  const title = stage.title ?? t('stage_title', { number: stage.stage_number });

  let metaText = '';
  if (isCompleted) {
    const accuracy = stage.progress?.best_accuracy_pct ?? 0;
    const badge = stage.progress?.best_badge;
    metaText = badge
      ? t('completed_with_badge', { accuracy, badge: t(`badge_${badge}`) })
      : t('completed', { accuracy });
  } else if (isLocked) {
    metaText = t('locked');
  } else {
    metaText = t('unlocked');
  }

  return (
    <div
      className={`${styles.card} ${isLocked ? styles.cardLocked : styles.cardClickable}`}
      data-testid={`journey-stage-${stage.stage_number}`}
      data-status={stage.computed_status}
    >
      <button
        type="button"
        className={styles.cardInner}
        onClick={handleClick}
        disabled={isLocked}
        aria-label={t('stage_aria', { number: stage.stage_number, status: metaText })}
      >
        <div className={styles.badge} aria-hidden="true">
          {stage.stage_number}
        </div>
        <div className={styles.textCol}>
          <h2 className={styles.stageTitle}>{title}</h2>
          <p className={styles.stageMeta}>{metaText}</p>
        </div>
        {!isLocked && (
          <span className={styles.actionPill} aria-hidden="true">
            {isCompleted ? t('play_again') : t('play')}
          </span>
        )}
      </button>
    </div>
  );
}
