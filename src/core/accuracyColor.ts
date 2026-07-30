export function getAccuracyColor(pct: number): string {
  if (!Number.isFinite(pct)) return 'var(--gh-text-muted)';
  const clamped = Math.max(0, Math.min(100, pct));
  if (clamped >= 85) return 'var(--gh-success)';
  if (clamped >= 60) return 'var(--gh-gold)';
  if (clamped >= 40) return 'var(--gh-orange)';
  return 'var(--gh-danger)';
}
