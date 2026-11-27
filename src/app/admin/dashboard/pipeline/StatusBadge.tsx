import { STATUS_LABELS, type PipelineStatus } from "@/core/pipelineRegistry";
import styles from "./pipeline.module.css";

const STATUS_CLASS: Record<PipelineStatus, string> = {
  planned: styles.badgePlanned,
  in_progress: styles.badgeInProgress,
  built_dark: styles.badgeBuiltDark,
  live: styles.badgeLive,
  blocked: styles.badgeBlocked,
  superseded: styles.badgeSuperseded,
};

export function StatusBadge({ status }: { status: PipelineStatus }) {
  return (
    <span className={`${styles.badge} ${STATUS_CLASS[status]}`}>
      <span className={styles.badgeDot} aria-hidden="true" />
      <span>{STATUS_LABELS[status]}</span>
    </span>
  );
}
