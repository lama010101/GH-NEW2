// Stylized "map" graphic — schematic Europe-ish shapes for the thumbnail.
// Not a real map; deliberately abstract.
const MapBackground = ({ centered = false }) => (
  <svg className="map-bg" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#c1dde6" />
        <stop offset="100%" stopColor="#a9cdd8" />
      </linearGradient>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M40 0 L0 0 0 40" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" />
      </pattern>
    </defs>
    <rect width="400" height="200" fill="url(#sea)" />
    <rect width="400" height="200" fill="url(#grid)" />

    {/* Abstract land masses */}
    <g fill="#f5efe6" stroke="rgba(0,0,0,0.08)" strokeWidth="0.5">
      {/* Iberia */}
      <path d="M120,120 Q110,108 118,98 Q132,92 148,98 Q160,108 158,122 Q150,134 138,134 Q124,132 120,120 Z" />
      {/* France / Central Europe blob */}
      <path d="M158,82 Q175,70 200,72 Q225,72 240,82 Q255,92 258,108 Q252,124 240,130 Q220,138 200,134 Q180,130 168,120 Q156,108 158,82 Z" />
      {/* British Isles */}
      <path d="M150,52 Q160,46 168,52 Q172,62 168,72 Q160,78 154,72 Q148,62 150,52 Z" />
      <path d="M138,58 Q144,56 148,62 Q146,70 140,72 Q134,68 138,58 Z" />
      {/* Scandinavia */}
      <path d="M218,28 Q232,22 246,28 Q252,40 248,58 Q240,72 230,68 Q224,58 222,46 Q218,38 218,28 Z" />
      {/* Italy */}
      <path d="M232,108 Q238,108 242,118 Q244,132 240,144 Q234,148 232,142 Q230,130 230,118 Z" />
      {/* Eastern Europe */}
      <path d="M260,72 Q300,68 340,80 Q360,92 358,112 Q350,128 320,132 Q290,130 268,118 Q258,100 260,72 Z" />
      {/* Greece / Balkans */}
      <path d="M250,124 Q270,128 282,140 Q278,152 264,150 Q250,142 250,124 Z" />
      {/* North Africa edge */}
      <path d="M120,158 Q170,154 220,160 Q280,164 340,162 L400,164 L400,200 L0,200 L0,168 Q60,160 120,158 Z" />
      {/* Russia/east */}
      <path d="M340,38 Q380,32 400,40 L400,98 Q380,104 360,100 Q346,82 340,60 Q336,46 340,38 Z" />
    </g>

    {/* Continent label */}
    <text x="200" y="115" textAnchor="middle"
          fill="rgba(80,80,80,0.5)"
          fontFamily="Inter, sans-serif"
          fontWeight="700"
          fontSize="22"
          letterSpacing="4">EUROPE</text>
  </svg>
);

// Zoom controls overlay (shown only in fullscreen modal — kept minimal)
const ZoomControls = () => (
  <div style={{
    position: 'absolute', top: 10, left: 10,
    display: 'flex', flexDirection: 'column',
    background: '#fff',
    borderRadius: 6,
    overflow: 'hidden',
    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
  }}>
    <button style={{ width: 32, height: 32, border: 0, background: '#fff', fontSize: 18, cursor: 'pointer', borderBottom: '1px solid #e5e7eb', color: '#111' }}>+</button>
    <button style={{ width: 32, height: 32, border: 0, background: '#fff', fontSize: 18, cursor: 'pointer', color: '#111' }}>−</button>
  </div>
);

// Pin
const PinSVG = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="pin-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fdba74" />
        <stop offset="100%" stopColor="#ea580c" />
      </linearGradient>
    </defs>
    <path d="M12 2 C7.6 2 4 5.6 4 10 C4 16 12 22 12 22 C12 22 20 16 20 10 C20 5.6 16.4 2 12 2 Z"
          fill="url(#pin-grad)" stroke="rgba(0,0,0,0.25)" strokeWidth="0.6" />
    <circle cx="12" cy="10" r="3" fill="#fff" />
  </svg>
);

window.MapBackground = MapBackground;
window.ZoomControls = ZoomControls;
window.PinSVG = PinSVG;
