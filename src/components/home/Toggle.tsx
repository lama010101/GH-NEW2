export function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ width: 44, height: 24, borderRadius: 12, background: on ? 'var(--gh-success)' : 'var(--gh-border-medium)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: 'var(--gh-text-primary)', transition: 'left 0.15s', boxShadow: 'var(--gh-shadow-sm)' }} />
    </div>
  )
}
