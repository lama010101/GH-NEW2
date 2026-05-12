export function LevelUpPanel({ onStart }: { onStart: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
        <span>Level <strong style={{ color: '#fff' }}>5</strong> → Level <strong style={{ color: '#fff' }}>6</strong></span>
        <span>Min accuracy: <strong style={{ color: '#fff' }}>52%</strong></span>
      </div>
      <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)' }}>
        <div style={{ width: '40%', height: '100%', borderRadius: 3, background: 'linear-gradient(90deg,#7c3aed,#a855f7)' }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[['Year range','1776–2025'],['Timer','4:50'],['Rounds','5']].map(([l,v]) => (
          <div key={l} style={{ flex: 1, background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: '8px 6px', textAlign: 'center', border: '0.5px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>{l}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{v}</div>
          </div>
        ))}
      </div>
      <button onClick={onStart} style={{ width: '100%', padding: 13, background: 'linear-gradient(135deg,#5b21b6,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
        Start Level 5
      </button>
    </div>
  )
}
