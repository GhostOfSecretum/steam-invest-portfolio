/* global React, useT, usePortfolio, useMarketSnapshot, useMarketCatalog, compactUsd */
const { useState, useEffect, useRef, useMemo } = React;

/* ───────────────────────────────────────────────────
   HERO — 4 swappable 3D concepts + dense content
   ─────────────────────────────────────────────────── */

/* Concept: official img2threejs Glock-18 Ghost Protocol showcase factory */
function HeroConcept_GlockGhost() {
  const mountRef = useRef(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el || typeof window.mountHeroGlockGhost !== 'function') return undefined;
    const handle = window.mountHeroGlockGhost(el);
    return () => {
      if (handle && typeof handle.dispose === 'function') handle.dispose();
    };
  }, []);

  return (
    <div className="hero-3d-stage" style={{ perspective: 1400 }}>
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 50% 45%, oklch(0.28 0.08 15 / 0.55), transparent 62%)',
          pointerEvents: 'none',
        }}
      />
      <div
        ref={mountRef}
        className="hero-glock-canvas"
        style={{
          position: 'relative',
          zIndex: 1,
          width: 'min(100%, 560px)',
          height: 'min(100%, 520px)',
          cursor: 'grab',
        }}
        aria-label="Glock-18 Ghost Protocol 3D — img2threejs showcase"
      />
      <div style={{
        position: 'absolute', left: '50%', bottom: 28, transform: 'translateX(-50%)',
        textAlign: 'center', pointerEvents: 'none', zIndex: 2,
      }}>
        <div className="eyebrow" style={{ color: 'var(--accent)' }}>// GLOCK-18 · GHOST PROTOCOL</div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 22, fontWeight: 500, color: 'var(--fg-0)' }}>SKINSHEAD 3D</div>
        <div className="eyebrow" style={{ marginTop: 4 }}>DRAG TO ORBIT</div>
      </div>
    </div>
  );
}

/* Concept 1b: AK-47 Asiimov from reference PNG */
function HeroConcept_Ak47Asiimov() {
  const mountRef = useRef(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el || typeof window.mountHeroAk47Asiimov !== 'function') return undefined;
    const handle = window.mountHeroAk47Asiimov(el);
    return () => {
      if (handle && typeof handle.dispose === 'function') handle.dispose();
    };
  }, []);

  const rings = [
    { r: 250, color: 'oklch(0.78 0.16 150)', label: 'FN', val: '0.00–0.07' },
    { r: 300, color: 'oklch(0.82 0.18 55)', label: 'MW', val: '0.07–0.15' },
    { r: 350, color: 'oklch(0.78 0.18 45)', label: 'FT', val: '0.15–0.38' },
    { r: 400, color: 'oklch(0.72 0.18 35)', label: 'WW', val: '0.38–0.45' },
    { r: 450, color: 'oklch(0.66 0.2 25)', label: 'BS', val: '0.45–1.00' },
  ];

  return (
    <div className="hero-3d-stage" style={{ perspective: 1400 }}>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
        {rings.map((r, i) => (
          <div key={i} style={{
            position: 'absolute', width: r.r, height: r.r, borderRadius: '50%',
            border: `1px solid ${r.color.replace(')', ' / 0.32)')}`,
            boxShadow: `0 0 28px ${r.color.replace(')', ' / 0.12)')} inset`,
            animation: `ringSpin ${20 + i * 4}s linear infinite ${i % 2 ? 'reverse' : ''}`,
          }}>
            <span style={{
              position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
              padding: '2px 8px', borderRadius: 4,
              fontFamily: 'var(--f-mono)', fontSize: 9.5, letterSpacing: '0.18em',
              color: r.color, background: 'var(--bg-0)', border: `1px solid ${r.color.replace(')', ' / 0.4)')}`,
            }}>{r.label} · {r.val}</span>
          </div>
        ))}
      </div>

      <div
        ref={mountRef}
        className="hero-ak47-canvas"
        style={{
          position: 'relative',
          zIndex: 1,
          width: 'min(100%, 560px)',
          height: 'min(100%, 520px)',
          cursor: 'grab',
        }}
        aria-label="AK-47 Asiimov 3D preview"
      />

      <div style={{
        position: 'absolute', left: '50%', bottom: 28, transform: 'translateX(-50%)',
        textAlign: 'center', pointerEvents: 'none', zIndex: 2,
      }}>
        <div className="eyebrow" style={{ color: 'var(--accent)' }}>// AK-47 · ASIIMOV</div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 28, fontWeight: 500, color: 'var(--fg-0)' }}>FIELD-TESTED</div>
        <div className="eyebrow" style={{ marginTop: 4 }}>SKINSHEAD 3D · DRAG TO ORBIT</div>
      </div>
    </div>
  );
}

/* Concept 1: Procedural Three.js Classic Knife · Fade + float rings */
function HeroConcept_Knife() {
  const mountRef = useRef(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el || typeof window.mountHeroKnife !== 'function') return undefined;
    const handle = window.mountHeroKnife(el);
    return () => {
      if (handle && typeof handle.dispose === 'function') handle.dispose();
    };
  }, []);

  const rings = [
    { r: 240, color: 'oklch(0.78 0.16 150)', label: 'FN', val: '0.00–0.07' },
    { r: 290, color: 'oklch(0.82 0.18 130)', label: 'MW', val: '0.07–0.15' },
    { r: 340, color: 'oklch(0.82 0.16 75)', label: 'FT', val: '0.15–0.38' },
    { r: 390, color: 'oklch(0.74 0.18 40)', label: 'WW', val: '0.38–0.45' },
    { r: 440, color: 'oklch(0.66 0.22 25)', label: 'BS', val: '0.45–1.00' },
  ];

  return (
    <div className="hero-3d-stage" style={{ perspective: 1400 }}>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
        {rings.map((r, i) => (
          <div key={i} style={{
            position: 'absolute', width: r.r, height: r.r, borderRadius: '50%',
            border: `1px solid ${r.color.replace(')', ' / 0.35)')}`,
            boxShadow: `0 0 30px ${r.color.replace(')', ' / 0.15)')} inset`,
            animation: `ringSpin ${20 + i * 4}s linear infinite ${i % 2 ? 'reverse' : ''}`,
          }}>
            <span style={{
              position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
              padding: '2px 8px', borderRadius: 4,
              fontFamily: 'var(--f-mono)', fontSize: 9.5, letterSpacing: '0.18em',
              color: r.color, background: 'var(--bg-0)', border: `1px solid ${r.color.replace(')', ' / 0.4)')}`,
            }}>{r.label} · {r.val}</span>
          </div>
        ))}
      </div>

      <div
        ref={mountRef}
        className="hero-knife-canvas"
        style={{
          position: 'relative',
          zIndex: 1,
          width: 'min(100%, 520px)',
          height: 'min(100%, 520px)',
          cursor: 'grab',
        }}
        aria-label="Classic Knife Fade 3D preview"
      />

      <div style={{
        position: 'absolute', left: '50%', bottom: 28, transform: 'translateX(-50%)',
        textAlign: 'center', pointerEvents: 'none', zIndex: 2,
      }}>
        <div className="eyebrow" style={{ color: 'var(--accent)' }}>// CLASSIC KNIFE · FADE</div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 28, fontWeight: 500, color: 'var(--fg-0)' }}>0.0184</div>
        <div className="eyebrow" style={{ marginTop: 4 }}>FACTORY NEW · DRAG TO ORBIT</div>
      </div>
    </div>
  );
}

/* Concept 2: Exploded Orbit */
function HeroConcept_Orbit({ scrollProgress = 0 }) {
  const parts = [
    { x: -180, y: -60, w: 90, h: 28, rot: -22, label: 'BARREL' },
    { x: 170, y: -110, w: 70, h: 32, rot: 30, label: 'STOCK' },
    { x: -200, y: 110, w: 60, h: 22, rot: 14, label: 'GRIP' },
    { x: 210, y: 60, w: 50, h: 50, rot: 0, label: 'OPTIC' },
    { x: -50, y: 180, w: 80, h: 24, rot: -8, label: 'MAG' },
    { x: 60, y: -180, w: 40, h: 40, rot: 45, label: 'HANDGUARD' },
  ];
  const rot = scrollProgress * 60;
  return (
    <div className="hero-3d-stage" style={{ perspective: 1600 }}>
      <div style={{
        position: 'relative', transformStyle: 'preserve-3d',
        transform: `rotateY(${rot}deg) rotateX(${-rot * 0.4}deg)`,
        transition: 'transform 200ms ease-out',
        width: 500, height: 500, display: 'grid', placeItems: 'center',
      }}>
        {/* center mass */}
        <div style={{
          position: 'absolute', width: 180, height: 50,
          background: 'linear-gradient(180deg, #2a2f3c, #0a0c11)',
          border: '1px solid var(--line-strong)', borderRadius: 6,
          boxShadow: '0 12px 40px oklch(0.68 0.22 5 / 0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}>
          <div style={{ position: 'absolute', inset: 4, border: '1px dashed rgba(255,255,255,0.06)', borderRadius: 4 }}></div>
          <div style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.15em', color: 'var(--accent)',
          }}>CORE · S/N 0824-A</div>
        </div>
        {parts.map((p, i) => (
          <div key={i} style={{
            position: 'absolute', left: '50%', top: '50%',
            width: p.w, height: p.h,
            transform: `translate(calc(-50% + ${p.x}px), calc(-50% + ${p.y}px)) rotate(${p.rot}deg) translateZ(${(i % 3) * 30}px)`,
            background: `linear-gradient(180deg, #3a4050, #1a1e28)`,
            border: '1px solid var(--line-strong)', borderRadius: 4,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}>
            <div style={{ position: 'absolute', inset: 2, borderRadius: 2,
              background: `repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 3px, transparent 3px 6px)` }}></div>
            {/* connecting dotted line back to center */}
            <span style={{
              position: 'absolute', top: '110%', left: 0, fontFamily: 'var(--f-mono)', fontSize: 8.5,
              letterSpacing: '0.16em', color: 'var(--fg-3)',
            }}>· {p.label}</span>
          </div>
        ))}

        {/* faint connecting lines */}
        <svg viewBox="-250 -250 500 500" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {parts.map((p, i) => (
            <line key={i} x1="0" y1="0" x2={p.x} y2={p.y}
                  stroke="oklch(0.68 0.22 5 / 0.25)" strokeWidth="0.5" strokeDasharray="2 3" />
          ))}
        </svg>
      </div>
    </div>
  );
}

/* Concept 3: Spin Carousel — 3D cylinder of items */
function HeroConcept_Carousel() {
  const [angle, setAngle] = useState(0);
  const dragRef = useRef({ active: false, lastX: 0, vel: 0 });
  useEffect(() => {
    let raf;
    const tick = () => {
      if (!dragRef.current.active) {
        dragRef.current.vel *= 0.94;
        setAngle(a => a + 0.12 + dragRef.current.vel);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  const itemNames = ['AK · Redline', 'M4 · Asiimov', 'AWP · Dragon', 'Glock · Fade', 'Karambit · Doppler',
    'USP · Confirmed', 'Deagle · Blaze', 'AK · Vulcan', 'AWP · Lightning',
    'M4A1 · Beast', 'Five-Seven · CH', 'Tec-9 · Decimator',
    'P250 · Whiteout', 'MP9 · Bulldozer'];
  const items = Array.from({ length: 12 }, (_, i) => ({
    name: itemNames[i],
    tier: (i % 4) + 2,
    price: (Math.random() * 4000 + 200).toFixed(2),
  }));
  const cardW = 180;
  const cardH = 220;
  const N = items.length;
  // radius derived so cards don't overlap: r >= cardW / (2 * tan(π/N))
  const radius = Math.ceil(cardW / (2 * Math.tan(Math.PI / N))) + 40;
  return (
    <div className="hero-3d-stage" style={{ perspective: 1600 }}
         onMouseDown={(e) => { dragRef.current = { active: true, lastX: e.clientX, vel: 0 }; }}
         onMouseUp={() => { dragRef.current.active = false; }}
         onMouseLeave={() => { dragRef.current.active = false; }}
         onMouseMove={(e) => {
           if (dragRef.current.active) {
             const dx = e.clientX - dragRef.current.lastX;
             dragRef.current.lastX = e.clientX;
             dragRef.current.vel = dx * 0.12;
             setAngle(a => a + dx * 0.12);
           }
         }}>
      <div style={{
        position: 'relative', width: cardW, height: cardH,
        transformStyle: 'preserve-3d',
        transform: `rotateY(${angle}deg) rotateX(-6deg)`,
      }}>
        {items.map((it, i) => {
          const a = (i / N) * 360;
          // compute card-facing angle vs viewer to fade back-side
          const facing = Math.cos(((a + angle) % 360) * Math.PI / 180);
          const opacity = facing < -0.2 ? 0.15 : (facing < 0.3 ? 0.55 : 1);
          return (
            <div key={i} style={{
              position: 'absolute', inset: 0,
              transform: `rotateY(${a}deg) translateZ(${radius}px)`,
              background: 'linear-gradient(180deg, rgba(28,33,45,0.9), rgba(10,12,17,0.95))',
              borderRadius: 10,
              border: '1px solid var(--line-strong)',
              padding: 10,
              boxShadow: '0 20px 50px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
              backfaceVisibility: 'hidden',
              opacity,
              transition: 'opacity 200ms',
            }}>
              {/* tier strip */}
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `var(--rar-${it.tier})`, borderRadius: '10px 0 0 10px', opacity: 0.9 }}></div>
              {/* item art */}
              <div style={{
                aspectRatio: '16/10', borderRadius: 6, marginBottom: 10,
                background: `
                  repeating-linear-gradient(115deg, rgba(255,255,255,0.04) 0 5px, rgba(255,255,255,0) 5px 11px),
                  radial-gradient(120% 120% at 30% 25%, var(--rar-${it.tier}), transparent 55%),
                  linear-gradient(180deg, #1c2230, #0a0d14)
                `,
                position: 'relative', overflow: 'hidden',
                border: '1px solid var(--line)',
              }}>
                <svg viewBox="0 0 100 60" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.5 }}>
                  <circle cx="50" cy="30" r="11" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" fill="none" />
                  <line x1="50" y1="14" x2="50" y2="22" stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" />
                  <line x1="50" y1="38" x2="50" y2="46" stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" />
                  <line x1="34" y1="30" x2="42" y2="30" stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" />
                  <line x1="58" y1="30" x2="66" y2="30" stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" />
                </svg>
                <div style={{ position: 'absolute', left: 6, top: 6, fontFamily: 'var(--f-mono)', fontSize: 8, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' }}>T{it.tier}</div>
              </div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 12, fontWeight: 500, color: 'var(--fg-0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
              <div style={{ marginTop: 4, fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.06em' }}>FN · 0.0{(10+i).toString().padStart(3,'0')}</div>
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>{formatUsd(it.price)}</div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--green)' }}>▲ {(Math.random()*4+0.5).toFixed(1)}%</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{
        position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg-3)',
      }}>
        <span className="kbd">DRAG</span>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11 }}>spin to browse</span>
      </div>
    </div>
  );
}

/* Concept 4: Vault Door */
function HeroConcept_Vault({ portfolio, loading, auth, lang }) {
  return (
    <div className="hero-3d-stage" style={{ perspective: 1400 }}>
      <div style={{
        position: 'relative', width: 480, height: 480, transformStyle: 'preserve-3d',
        transform: 'rotateX(-6deg)',
      }}>
        <div style={{
          position: 'absolute',
          inset: 10,
          borderRadius: 36,
          background: 'radial-gradient(120% 120% at 50% 10%, rgba(255,255,255,0.08), rgba(255,255,255,0) 38%), linear-gradient(180deg, rgba(23,28,39,0.82), rgba(10,12,17,0.96))',
          border: '1px solid var(--line-strong)',
          boxShadow: '0 34px 90px rgba(0,0,0,0.56), inset 0 1px 0 rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute',
            inset: 18,
            borderRadius: 28,
            background: 'radial-gradient(circle at 50% 18%, rgba(255,255,255,0.12), rgba(255,255,255,0) 28%), radial-gradient(circle at 50% 65%, oklch(0.68 0.22 5 / 0.16), rgba(0,0,0,0) 42%), linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
            border: '1px solid rgba(255,255,255,0.08)',
          }}></div>
          <img
            src="/assets/hero-agents.png"
            alt="Three featured agents"
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 456,
              height: 456,
              objectFit: 'contain',
              transform: 'translate(-50%, -48%)',
              filter: 'drop-shadow(0 26px 40px rgba(0,0,0,0.45))',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0) 18%, rgba(0,0,0,0) 72%, rgba(0,0,0,0.2))',
            pointerEvents: 'none',
          }}></div>
        </div>
      </div>
    </div>
  );
}

/* Concept 5: Operators squad readout */
const HERO_AGENT_PRICE_CARDS = [
  {
    label: 'B Squadron Officer',
    marketHashName: 'B Squadron Officer | SAS',
    category: 'agents',
    type: 'Agent',
  },
  {
    label: 'Sir Bloody Miami Darryl',
    marketHashName: 'Sir Bloody Miami Darryl | The Professionals',
    category: 'agents',
    type: 'Agent',
  },
  {
    label: 'Osiris',
    marketHashName: 'Osiris | Elite Crew',
    category: 'agents',
    type: 'Agent',
  },
];

const HERO_OPERATORS_IMAGES = [
  {
    src: '/assets/hero-agents.png',
    alt: 'Three featured CS2 operators',
    label: 'Featured agents',
    priceCards: HERO_AGENT_PRICE_CARDS,
  },
  {
    src: '/assets/hero-ak47-gpt-transparent.png',
    alt: 'AK-47 Wild Lotus high-detail render',
    label: 'AK-47 Wild Lotus',
    marketHashName: 'AK-47 | Wild Lotus (Minimal Wear)',
    category: 'weapons',
    type: 'Covert Rifle',
    wear: 'MW',
  },
  {
    src: '/assets/hero-m4-red-gpt-transparent.png',
    alt: 'M4 red flame high-detail render',
    label: 'M4A4 Howl',
    marketHashName: 'M4A4 | Howl (Minimal Wear)',
    category: 'weapons',
    type: 'Contraband Rifle',
    wear: 'MW',
  },
  {
    src: '/assets/hero-awp-dragon-gpt-transparent.png',
    alt: 'AWP Dragon Lore high-detail render',
    label: 'AWP Dragon Lore',
    marketHashName: 'AWP | Dragon Lore (Minimal Wear)',
    category: 'weapons',
    type: 'Covert Sniper Rifle',
    wear: 'MW',
  },
];
const HERO_OPERATORS_IMAGE_DELAY_MS = 4200;
const HERO_MARKET_PRICE_REFRESH_MS = 2 * 60 * 1000;

function useHeroMarketPrices() {
  const [state, setState] = useState({ loading: true, prices: {}, updatedAt: null, error: null });
  const [currency, setCurrency] = useState(() => getActiveCurrency());
  const names = useMemo(() => {
    const marketHashNames = HERO_OPERATORS_IMAGES.flatMap((image) => [
      image.marketHashName,
      ...(image.priceCards || []).map((card) => card.marketHashName),
    ]);
    return [...new Set(marketHashNames.filter(Boolean))];
  }, []);

  useEffect(() => {
    let active = true;
    let timer;

    const load = async () => {
      try {
        const search = new URLSearchParams();
        names.forEach((name) => search.append('names', name));
        const data = await apiFetch(`/api/market/prices?${search.toString()}`);
        if (!active) return;
        setState({ loading: false, prices: data.prices || {}, updatedAt: data.updatedAt || null, error: null });
      } catch (error) {
        if (active) setState((current) => ({ ...current, loading: false, error }));
      }
    };

    load();
    timer = setInterval(load, HERO_MARKET_PRICE_REFRESH_MS);
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [names]);

  useEffect(() => {
    const syncCurrency = () => setCurrency(getActiveCurrency());
    window.addEventListener('currency-change', syncCurrency);
    return () => window.removeEventListener('currency-change', syncCurrency);
  }, []);

  return { ...state, currency };
}

function HeroOperatorsBackdrop() {
  return (
    <div className="hero-backdrop hb-reticle" aria-hidden="true">
      <div className="hb-reticle-ticks"></div>
      <div className="hb-reticle-arc"></div>
      <div className="hb-reticle-arc hb-reticle-arc-2"></div>
      <div className="hb-reticle-cross"></div>
    </div>
  );
}

function HeroConcept_Operators({ lang, onItemClick }) {
  const [imageIndex, setImageIndex] = useState(0);
  const [missingByIndex, setMissingByIndex] = useState({});
  const rotateTimerRef = useRef(null);
  const marketPrices = useHeroMarketPrices();
  const activeImage = HERO_OPERATORS_IMAGES[imageIndex] || HERO_OPERATORS_IMAGES[0];
  const imageMissing = Boolean(missingByIndex[imageIndex]);
  const activePriceCards = activeImage.priceCards || [
    {
      label: activeImage.label || activeImage.marketHashName,
      marketHashName: activeImage.marketHashName,
      category: activeImage.category,
      type: activeImage.type,
      wear: activeImage.wear,
      rarity: activeImage.rarity,
    },
  ];
  const getPriceCard = (card) => {
    const price = card.marketHashName ? marketPrices.prices[card.marketHashName] : null;
    const value = Number.isFinite(price?.price) ? price.price : price?.medianPrice;
    return {
      ...card,
      price,
      priceLabel: Number.isFinite(value) ? formatItemPrice(price, value, { digits: 0 }) : marketPrices.loading ? '...' : 'N/A',
    };
  };
  const openPriceCard = (card) => {
    if (!onItemClick || !card.marketHashName) return;
    const price = card.price || {};
    const itemPrice = Number.isFinite(price.price) ? price.price
      : Number.isFinite(price.medianPrice) ? price.medianPrice
      : 0;
    onItemClick({
      assetid: `hero-${card.marketHashName}`,
      assetIds: [`hero-${card.marketHashName}`],
      marketHashName: card.marketHashName,
      name: card.label || card.marketHashName,
      price: itemPrice,
      value: itemPrice,
      totalValue: itemPrice,
      priceRub: price.priceRub,
      medianPrice: price.medianPrice,
      medianPriceRub: price.medianPriceRub,
      qty: 1,
      basis: itemPrice,
      totalBasis: itemPrice,
      pnl: 0,
      pnlPct: 0,
      tradable: true,
      tradableQty: 1,
      marketable: true,
      rarity: card.rarity || (card.category === 'agents' ? 'Extraordinary' : 'Covert'),
      category: card.category || 'collectibles',
      type: card.type || 'Collectible',
      wear: card.wear || 'N/A',
      special: 'normal',
      tier: 5,
      currencyCode: price.currencyCode || 'USD',
      priceProvider: price.provider,
    });
  };

  useEffect(() => {
    if (HERO_OPERATORS_IMAGES.length < 2) return undefined;
    rotateTimerRef.current = setInterval(() => {
      setImageIndex((current) => (current + 1) % HERO_OPERATORS_IMAGES.length);
    }, HERO_OPERATORS_IMAGE_DELAY_MS);
    return () => {
      if (rotateTimerRef.current) clearInterval(rotateTimerRef.current);
    };
  }, []);

  return (
    <div
      className="hero-3d-stage"
      style={{ perspective: 1400, '--image-delay': `${HERO_OPERATORS_IMAGE_DELAY_MS}ms` }}
    >
      <div className="hero-operators-glow"></div>
      <HeroOperatorsBackdrop />
      <div className="hero-operators-shadow"></div>

      <div className="hero-operators-image-wrap">
        {!imageMissing ? (
          <img
            key={activeImage.src}
            src={activeImage.src}
            alt={activeImage.alt}
            className="hero-operators-image"
            onError={() => setMissingByIndex((current) => ({ ...current, [imageIndex]: true }))}
          />
        ) : (
          <div className="hero-operators-fallback" aria-hidden="true">
            <div className="hero-operators-card" data-slot="left"></div>
            <div className="hero-operators-card" data-slot="center"></div>
            <div className="hero-operators-card" data-slot="right"></div>
          </div>
        )}
      </div>

      {activePriceCards.length > 1 ? (
        <div className="hero-agent-price-layout">
          {activePriceCards.map((card, index) => {
            const pricedCard = getPriceCard(card);
            const slot = index === 0 ? 'left' : index === 1 ? 'center' : 'right';
            return (
              <button
                type="button"
                className={`hero-operators-badge hero-market-agent-card hero-market-agent-card-${slot}`}
                key={pricedCard.marketHashName || index}
                onClick={() => openPriceCard(pricedCard)}
                title={pricedCard.marketHashName}
              >
                <div className="hero-market-price-head">
                  <span>{lang === 'ru' ? 'Агент' : 'Agent'}</span>
                </div>
                <div className="hero-market-price-value">{pricedCard.priceLabel}</div>
                <div className="hero-market-price-name">{pricedCard.label || pricedCard.marketHashName}</div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="hero-market-single-wrap">
          {activePriceCards.map((card, index) => {
            const pricedCard = getPriceCard(card);
            return (
              <button
                type="button"
                className="hero-operators-badge hero-market-price-card"
                key={pricedCard.marketHashName || index}
                onClick={() => openPriceCard(pricedCard)}
                title={pricedCard.marketHashName}
              >
                <div className="hero-market-price-head">
                  <span>{lang === 'ru' ? 'Рыночная цена' : 'Market price'}</span>
                </div>
                <div className="hero-market-price-value">{pricedCard.priceLabel}</div>
                <div className="hero-market-price-name">{pricedCard.label || pricedCard.marketHashName}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HeroPortfolioPreview({ lang, data }) {
  const totalValue = Number.isFinite(data?.totalValue) && data.totalValue > 0 ? data.totalValue : 12840;
  const pnl = Number.isFinite(data?.pnl) ? data.pnl : 2140;
  const pnlPct = Number.isFinite(data?.pnlPct) ? data.pnlPct : 20;
  const items = Array.isArray(data?.items) && data.items.length
    ? data.items.slice(0, 3)
    : [
      { name: 'AK-47 | Redline', totalValue: 2840, pnlPct: 18.4 },
      { name: 'Karambit | Doppler', totalValue: 1985, pnlPct: 7.2 },
      { name: 'AWP | Asiimov', totalValue: 1240, pnlPct: -2.1 },
    ];

  return (
    <div className="hero-portfolio-preview" aria-hidden="true">
      <div className="hero-preview-head">
        <span>{lang === 'ru' ? 'МОЙ ПОРТФЕЛЬ' : 'MY PORTFOLIO'}</span>
        <i>{lang === 'ru' ? 'ОБНОВЛЕНО' : 'LIVE'}</i>
      </div>
      <div className="hero-preview-value">{compactUsd(totalValue)}</div>
      <div className="hero-preview-delta" data-positive={pnl >= 0}>
        {pnl >= 0 ? '+' : ''}{compactUsd(pnl)} · {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
      </div>
      <svg className="hero-preview-chart" viewBox="0 0 320 72" preserveAspectRatio="none">
        <defs>
          <linearGradient id="heroPreviewFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.68 0.22 5)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="oklch(0.68 0.22 5)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 61 C32 58 42 45 70 49 S116 36 143 40 S178 18 205 29 S252 17 320 6 L320 72 L0 72 Z" fill="url(#heroPreviewFill)" />
        <path d="M0 61 C32 58 42 45 70 49 S116 36 143 40 S178 18 205 29 S252 17 320 6" fill="none" stroke="var(--accent)" strokeWidth="2" />
      </svg>
      <div className="hero-preview-items">
        {items.map((item) => {
          const value = Number.isFinite(item.totalValue) ? item.totalValue : (Number(item.value) || 0);
          const change = Number.isFinite(item.pnlPct) ? item.pnlPct : 0;
          return (
            <div key={item.marketHashName || item.name}>
              <span>{item.name || item.marketHashName}</span>
              <b>{compactUsd(value)}</b>
              <i data-positive={change >= 0}>{change >= 0 ? '+' : ''}{change.toFixed(1)}%</i>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Hero stage: Operators concept */
function Hero({ lang, onLink, onPublicProfile, onItemClick, auth }) {
  const t = useT(lang);
  const [profileUrl, setProfileUrl] = useState('');
  const [profileUrlError, setProfileUrlError] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);

  const stage = useMemo(
    () => <HeroConcept_Operators lang={lang} onItemClick={onItemClick} />,
    [lang, onItemClick]
  );
  const submitProfileUrl = (event) => {
    event.preventDefault();
    const nextProfileUrl = profileUrl.trim();
    if (!nextProfileUrl) {
      setProfileUrlError(t.hero.profileUrlError);
      return;
    }

    setProfileUrlError('');
    if (onPublicProfile) onPublicProfile(nextProfileUrl);
  };

  return (
    <section className="hero scanlines hero-shell">
      <div className="container hero-layout">
        {/* Left: copy */}
        <div className="fade-up hero-copy">
          <div className="eyebrow hero-eyebrow">{t.hero.eyebrow}</div>
          <h1 className="display hero-title" style={{ fontWeight: 500, letterSpacing: '-0.04em' }}>
            {t.hero.title1}<br />
            {t.hero.title2}{' '}
            <span style={{
              background: 'linear-gradient(180deg, var(--accent), oklch(0.5 0.22 5))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>{t.hero.title3}</span>
          </h1>
          <p className="hero-sub">
            {t.hero.sub}
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={onLink}>
              <SteamGlyph /> {auth?.connected ? t.hero.ctaConnected : t.hero.cta1}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              aria-expanded={profileOpen}
              onClick={() => {
                setProfileOpen((open) => !open);
                setProfileUrlError('');
              }}
            >
              {t.hero.profileToggle}
            </button>
          </div>
          <div className="hero-trust-line">
            <span>✓</span> {t.hero.trust}
          </div>
          {profileOpen && (
            <form className="hero-profile-form" onSubmit={submitProfileUrl}>
              <input
                value={profileUrl}
                onChange={(event) => {
                  setProfileUrl(event.target.value);
                  if (profileUrlError) setProfileUrlError('');
                }}
                placeholder={t.hero.profileUrlPlaceholder}
                aria-label={t.hero.profileUrlCta}
              />
              <button className="btn btn-ghost" type="submit">{t.hero.profileUrlCta}</button>
              {profileUrlError && <div className="hero-profile-error">{profileUrlError}</div>}
            </form>
          )}

        </div>

        {/* Right: 3D stage */}
        <div className="hero-stage-wrap">
          {stage}
          {/* Portfolio preview temporarily hidden */}
        </div>
      </div>

      {/* Bottom corner brackets, HUD-style */}
      <Bracket pos="tl" />
      <Bracket pos="tr" />
      <Bracket pos="bl" />
      <Bracket pos="br" />
    </section>
  );
}

function SteamGlyph() {
  // Generic gamepad/connect glyph — NOT the Steam logo.
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
      <path d="M8 1.5 V 4 M8 12 V 14.5 M1.5 8 H 4 M12 8 H 14.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function Bracket({ pos }) {
  const styles = {
    tl: { top: 16, left: 16, borderTop: '1px solid', borderLeft: '1px solid' },
    tr: { top: 16, right: 16, borderTop: '1px solid', borderRight: '1px solid' },
    bl: { bottom: 16, left: 16, borderBottom: '1px solid', borderLeft: '1px solid' },
    br: { bottom: 16, right: 16, borderBottom: '1px solid', borderRight: '1px solid' },
  };
  return <div style={{ position: 'absolute', width: 20, height: 20, borderColor: 'var(--accent)', opacity: 0.4, ...styles[pos] }}></div>;
}

/* Full-page Glock Ghost Protocol viewer (img2threejs showcase) */
function Glock3DPage({ lang }) {
  const mountRef = useRef(null);
  const handleRef = useRef(null);
  const [exploded, setExploded] = useState(false);

  useEffect(() => {
    const el = mountRef.current;
    if (!el || typeof window.mountHeroGlockGhost !== 'function') return undefined;
    const handle = window.mountHeroGlockGhost(el);
    handleRef.current = handle;
    return () => {
      handleRef.current = null;
      if (handle && typeof handle.dispose === 'function') handle.dispose();
    };
  }, []);

  const toggleExplode = () => {
    const next = !exploded;
    setExploded(next);
    if (handleRef.current && typeof handleRef.current.setExplode === 'function') {
      handleRef.current.setExplode(next ? 1 : 0);
    }
  };

  const copy = lang === 'ru'
    ? {
      eyebrow: '// SKINSHEAD · 3D PREVIEW',
      title: 'Glock-18 · Ghost Protocol',
      sub: 'Интерактивный 3D-превью скина на SkinsHead. Крутите мышью, разбирайте модель и смотрите форму в деталях.',
      hint: 'ТЯНИТЕ ДЛЯ ОРБИТЫ',
      explode: 'Разобрать',
      assemble: 'Собрать',
    }
    : {
      eyebrow: '// SKINSHEAD · 3D PREVIEW',
      title: 'Glock-18 · Ghost Protocol',
      sub: 'Interactive CS2 skin preview on SkinsHead. Drag to orbit, explode the model, and inspect the shape up close.',
      hint: 'DRAG TO ORBIT',
      explode: 'Explode',
      assemble: 'Assemble',
    };

  return (
    <section className="glock3d-page" style={{ padding: '32px 0 64px', minHeight: 'calc(100vh - 90px)' }}>
      <div className="container" style={{ maxWidth: 1100 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div className="eyebrow" style={{ color: 'var(--accent)', marginBottom: 10 }}>{copy.eyebrow}</div>
            <h1 className="display" style={{ fontSize: 36, fontWeight: 500, letterSpacing: '-0.03em', margin: 0 }}>{copy.title}</h1>
            <p style={{ color: 'var(--fg-2)', maxWidth: 560, marginTop: 10, lineHeight: 1.5 }}>{copy.sub}</p>
          </div>
          <button
            type="button"
            className={`btn ${exploded ? 'btn-ghost' : 'btn-primary'}`}
            onClick={toggleExplode}
            style={{ flexShrink: 0 }}
          >
            {exploded ? copy.assemble : copy.explode}
          </button>
        </div>

        <div
          className="glass"
          style={{
            marginTop: 28,
            padding: 8,
            position: 'relative',
            height: 'min(72vh, 680px)',
            minHeight: 420,
            overflow: 'hidden',
            background: 'radial-gradient(ellipse at 50% 42%, oklch(0.28 0.08 15 / 0.45), transparent 65%), var(--bg-1)',
          }}
        >
          <div
            ref={mountRef}
            style={{ width: '100%', height: '100%', cursor: 'grab' }}
            aria-label={copy.title}
          />
          <div style={{
            position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)',
            fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.16em',
            color: 'var(--fg-3)', pointerEvents: 'none',
          }}>{copy.hint}</div>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { Hero, Glock3DPage });
