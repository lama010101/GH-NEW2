'use client';

import type { JourneyStageWithProgress } from '@/core/journeyTypes';
import JourneyStageCard from './JourneyStageCard';
import styles from './JourneyStageList.module.css';

type JourneyStageListProps = {
  stages: JourneyStageWithProgress[];
  onStageClick: (stage: JourneyStageWithProgress) => void;
};

export default function JourneyStageList({ stages, onStageClick }: JourneyStageListProps) {
  return (
    <div className={styles.list} role="list">
      {stages.map((stage) => (
        <JourneyStageCard key={stage.id} stage={stage} onClick={onStageClick} />
      ))}
    </div>
  );
}
