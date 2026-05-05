const { useState, useEffect, useRef, useCallback } = React;

// ---------- Icons ----------
const IconClock = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
const IconBolt = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
  </svg>
);
const IconPin = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M12 22s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12z" />
    <circle cx="12" cy="10" r="2.5" fill="currentColor" stroke="none" />
  </svg>
);
const IconCalendar = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="3.5" y="5" width="17" height="16" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
const IconSearch = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
const IconFullscreen = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
  </svg>
);
const IconGear = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);
const IconSend = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M3 11.5 21 3l-8.5 18-2.2-7.3L3 11.5z" />
  </svg>
);

// ---------- Sample data ----------
const PHOTO_URL = "https://images.unsplash.com/photo-1652289092269-89cb4ea0b9b6?w=800&auto=format&fit=crop"; // archaeology dig — placeholder
// Fallback if external image is blocked: use an SVG placeholder
const PHOTO_FALLBACK = "data:image/svg+xml;utf8," + encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 420'>
  <defs>
    <linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>
      <stop offset='0' stop-color='#6b5b3e'/>
      <stop offset='1' stop-color='#3a2f1f'/>
    </linearGradient>
  </defs>
  <rect width='800' height='420' fill='url(#g)'/>
  <g fill='rgba(255,255,255,0.06)'>
    <circle cx='180' cy='280' r='40'/>
    <circle cx='560' cy='220' r='30'/>
    <rect x='340' y='180' width='80' height='30' rx='4'/>
  </g>
  <text x='400' y='220' text-anchor='middle' fill='rgba(255,255,255,0.55)' font-family='monospace' font-size='18'>[ historical photo ]</text>
</svg>
`);

const PLAYERS = [
  { id: 'p1', name: 'Maya', color: '#ef4444', pic: 'https://i.pravatar.cc/80?img=1', submitted: false },
  { id: 'p2', name: 'Jun',  color: '#3b82f6', pic: 'https://i.pravatar.cc/80?img=12', submitted: true },
  { id: 'p3', name: 'Eli',  color: '#22c55e', pic: 'https://i.pravatar.cc/80?img=33', submitted: false },
  { id: 'p4', name: 'Zoë',  color: '#a855f7', pic: 'https://i.pravatar.cc/80?img=47', submitted: true },
  { id: 'p5', name: 'Rio',  color: '#f59e0b', pic: 'https://i.pravatar.cc/80?img=55', submitted: false },
];

const YEAR_MIN = 1000;
const YEAR_MAX = 2025;
const TICKS = [1000, 1600, 1700, 1800, 1900, 2000];

// ---------- Sub-components ----------

function ScorePill({ accuracy, xp }) {
  const xpFmt = xp.toLocaleString('fr-FR').replace(/\u202f/g, ' '); // "59 325"
  return (
    <div className="score-pill">
      <span className="acc">{accuracy}%</span>
      <span className="sep">|</span>
      <span className="xp-icon"><IconBolt style={{ width: 11, height: 11 }} /></span>
      <span className="xp">{xpFmt} XP</span>
    </div>
  );
}

function Timer({ seconds }) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const urgent = seconds < 10;
  return (
    <div className={`timer ${urgent ? 'urgent' : ''}`}>
      <IconClock />
      <span>{m}:{String(s).padStart(2, '0')}</span>
    </div>
  );
}

function Avatars({ players, soloMode, selfPic }) {
  if (soloMode) {
    return (
      <div className="avatars">
        <div className="avatar">
          <div className="pic" style={{ backgroundImage: `url(${selfPic})` }} />
        </div>
      </div>
    );
  }
  // Reverse rendering so rightmost (last in array) is on top via row-reverse
  return (
    <div className="avatars">
      {[...players].reverse().map(p => (
        <div key={p.id} className={`avatar ${p.submitted ? 'submitted' : ''}`} title={p.name}>
          <div className="pic" style={{ backgroundImage: `url(${p.pic})`, backgroundColor: p.color }}>
            {!p.pic && p.name.slice(0, 1)}
          </div>
          <div className="dot" />
        </div>
      ))}
    </div>
  );
}

// ---- Year slider ----
function YearSlider({ year, onChange }) {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const yearToPct = (y) => ((y - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100;

  const updateFromClientX = useCallback((clientX) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.round(YEAR_MIN + pct * (YEAR_MAX - YEAR_MIN));
    onChange(y);
  }, [onChange]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e) => {
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      updateFromClientX(x);
    };
    const up = () => setDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, [dragging, updateFromClientX]);

  const onPointerDown = (e) => {
    setDragging(true);
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    updateFromClientX(x);
  };

  const pct = year != null ? yearToPct(year) : 0;

  return (
    <div className="slider-wrap">
      <div className="ticks">
        {TICKS.map(t => (
          <div key={t} className="tick">
            <div className="mark" />
            <div className="label">{t}</div>
          </div>
        ))}
      </div>
      <div
        className="slider"
        ref={trackRef}
        onMouseDown={onPointerDown}
        onTouchStart={onPointerDown}
      >
        <div className="track">
          {year != null && <div className="fill" style={{ width: `${pct}%` }} />}
        </div>
        {year != null && (
          <div className="thumb" style={{ left: `${pct}%` }} />
        )}
      </div>
    </div>
  );
}

// ---- Map thumbnail ----
function MapThumb({ pin, onOpen }) {
  return (
    <div className="map-thumb" onClick={onOpen} role="button" aria-label="Open map">
      <MapBackground />
      {!pin && <div className="map-overlay">Tap to place your pin</div>}
      {pin && (
        <div className="map-pin" style={{ left: `${pin.x}%`, top: `${pin.y}%` }}>
          <PinSVG />
        </div>
      )}
    </div>
  );
}

// ---- Modals ----
function MapModal({ initialPin, initialYear, initialScale, onConfirm, onClose }) {
  const [pin, setPin] = useState(initialPin);
  const [year, setYear] = useState(initialYear);
  const [scale, setScale] = useState(initialScale);
  const [search, setSearch] = useState('');

  const onMapClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPin({ x, y });
  };

  const canConfirm = pin && year != null;

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-top">
        <button className="close-btn" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-search">
          <IconSearch />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search a place (city, country)…"
          />
        </div>
      </div>

      <div className="modal-map" onClick={onMapClick}>
        <MapBackground />
        <ZoomControls />
        {pin && (
          <div className="map-pin" style={{ left: `${pin.x}%`, top: `${pin.y}%` }}>
            <PinSVG />
          </div>
        )}
      </div>

      <div className="modal-when">
        <div className="card-head">
          <div className="left"><IconCalendar /> When?</div>
          <div className="right">{year != null ? year : '—'}</div>
        </div>
        <YearSlider year={year} onChange={setYear} />
        <div className="seg">
          {['YEAR', 'DECADE', 'CENTURY'].map(s => (
            <button key={s} className={scale === s ? 'active' : ''} onClick={() => setScale(s)}>{s}</button>
          ))}
        </div>
      </div>

      <button
        className={`modal-confirm ${canConfirm ? '' : 'disabled'}`}
        disabled={!canConfirm}
        onClick={() => canConfirm && onConfirm({ pin, year, scale })}
      >
        Confirm
      </button>
    </div>
  );
}

function SettingsSheet({ onClose }) {
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="grabber" />
        <h3>Settings</h3>
        <div className="row"><span className="lbl">Sound</span><span className="val">On</span></div>
        <div className="row"><span className="lbl">Haptics</span><span className="val">On</span></div>
        <div className="row"><span className="lbl">Show distance unit</span><span className="val">km</span></div>
        <div className="row"><span className="lbl">Quit round</span><span className="val">→</span></div>
      </div>
    </>
  );
}

function ImageModal({ src, onClose }) {
  return (
    <div className="image-modal" onClick={onClose}>
      <img src={src} alt="" />
      <button className="close-btn" aria-label="Close">✕</button>
    </div>
  );
}

// Restructured layout component — fixes scroll wrapper above
function AppFixed() {
  const tweakDefaults = /*EDITMODE-BEGIN*/{
    "mode": "compete",
    "submitted": false,
    "showAnswer": false,
    "timerStart": 60,
    "urgentDemo": false
  }/*EDITMODE-END*/;
  const [tweaks, setTweak] = useTweaks(tweakDefaults);

  const [pin, setPin] = useState({ x: 53, y: 60 });
  const [year, setYear] = useState(2000);
  const [scale, setScale] = useState('CENTURY');
  const [seconds, setSeconds] = useState(60);
  const [mapOpen, setMapOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [imgSrc, setImgSrc] = useState(PHOTO_URL);

  useEffect(() => { setSeconds(tweaks.timerStart); }, [tweaks.timerStart]);

  useEffect(() => {
    if (submitted || tweaks.submitted) return;
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [seconds, submitted, tweaks.submitted]);

  useEffect(() => { setSubmitted(!!tweaks.submitted); }, [tweaks.submitted]);

  const isSubmitted = submitted || tweaks.submitted;
  const showAnswer = isSubmitted || tweaks.showAnswer;
  const canSubmit = pin && year != null && !isSubmitted;
  const soloMode = tweaks.mode === 'solo';
  const displaySeconds = tweaks.urgentDemo ? Math.min(seconds, 7) : seconds;

  const onMakeGuess = () => {
    if (!canSubmit) return;
    setSubmitted(true);
    setTweak('submitted', true);
  };

  return (
    <PhoneShell width={390} height={844}>
      <div className="app">
        <div className="scroll">
          {/* PHOTO */}
          <div className="photo">
            <img src={imgSrc} alt="Round photo" onError={() => setImgSrc(PHOTO_FALLBACK)} />
            <button className="fs-btn" onClick={() => setPhotoOpen(true)} aria-label="Fullscreen photo">
              <IconFullscreen />
            </button>
          </div>

          {/* WHERE */}
          <div className="card where">
            <div className="card-head">
              <div className="left"><IconPin /> Where?</div>
              {showAnswer && pin && (
                <div className="right">Bézaudun-sur-Bîne, France</div>
              )}
            </div>
            <div className="search">
              <IconSearch />
              <input placeholder="Search a place (city, country)…" />
            </div>
            <MapThumb pin={pin} onOpen={() => setMapOpen(true)} />
          </div>

          {/* WHEN */}
          <div className="card when">
            <div className="card-head">
              <div className="left"><IconCalendar /> When?</div>
              <div className="right">{year != null ? year : '—'}</div>
            </div>
            <YearSlider year={year} onChange={setYear} />
            <div className="seg">
              {['YEAR', 'DECADE', 'CENTURY'].map(s => (
                <button key={s} className={scale === s ? 'active' : ''} onClick={() => setScale(s)}>{s}</button>
              ))}
            </div>
          </div>

          <div style={{ height: 16 }} />
        </div>

        {/* TOP BAR overlays photo */}
        <div className="top-bar">
          <ScorePill accuracy={37} xp={59325} />
          <Timer seconds={displaySeconds} />
          <Avatars players={PLAYERS} soloMode={soloMode} selfPic="https://i.pravatar.cc/80?img=5" />
        </div>

        {/* BOTTOM */}
        <div className="bottom">
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            <IconGear />
          </button>
          <button className="hints" aria-label="Hints">
            <span>Hints</span>
            <span className="badge">0/14</span>
          </button>
          <button
            className={`submit ${canSubmit ? '' : 'disabled'}`}
            onClick={onMakeGuess}
            disabled={!canSubmit}
            aria-label="Make guess"
          >
            <IconSend />
            <span>Make Guess</span>
          </button>
        </div>

        {/* TWEAKS */}
        <TweaksPanel title="Tweaks">
          <TweakSection label="Game state" />
          <TweakRadio
            label="Mode"
            value={tweaks.mode}
            options={['compete', 'solo']}
            onChange={(v) => setTweak('mode', v)}
          />
          <TweakToggle label="Submitted" value={!!tweaks.submitted} onChange={(v) => setTweak('submitted', v)} />
          <TweakToggle label="Show answer" value={!!tweaks.showAnswer} onChange={(v) => setTweak('showAnswer', v)} />
          <TweakSection label="Timer" />
          <TweakSlider label="Start seconds" value={tweaks.timerStart} min={1} max={120} step={1} unit="s" onChange={(v) => setTweak('timerStart', v)} />
          <TweakToggle label="Force urgent" value={!!tweaks.urgentDemo} onChange={(v) => setTweak('urgentDemo', v)} />
          <TweakSection label="Reset" />
          <TweakButton label="Clear pin & year" onClick={() => { setPin(null); setYear(null); }} />
          <TweakButton label="Match reference state" onClick={() => {
            setPin({ x: 53, y: 60 });
            setYear(2000);
            setScale('CENTURY');
            setTweak({ submitted: false, showAnswer: true, urgentDemo: true, timerStart: 1 });
          }} />
        </TweaksPanel>

        {mapOpen && (
          <MapModal
            initialPin={pin}
            initialYear={year}
            initialScale={scale}
            onConfirm={({ pin: p, year: y, scale: s }) => {
              setPin(p); setYear(y); setScale(s); setMapOpen(false);
            }}
            onClose={() => setMapOpen(false)}
          />
        )}
        {photoOpen && (<ImageModal src={imgSrc} onClose={() => setPhotoOpen(false)} />)}
        {settingsOpen && (<SettingsSheet onClose={() => setSettingsOpen(false)} />)}
      </div>
    </PhoneShell>
  );
}

// Lightweight phone shell — no nav/status chrome, just a rounded bezel.
function PhoneShell({ children, width = 390, height = 844 }) {
  return (
    <div style={{
      width, height,
      borderRadius: 48,
      overflow: 'hidden',
      background: '#000',
      boxShadow: '0 40px 80px rgba(0,0,0,0.4), 0 0 0 8px #1a1a1a, 0 0 0 9px #2a2a2a',
      position: 'relative',
    }}>
      {children}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <div className="stage">
    <AppFixed />
  </div>
);
