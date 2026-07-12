/* global React, useT, usePortfolio, useMarketSnapshot, useMarketCatalog, compactUsd */
const { useState, useEffect, useRef, useMemo } = React;

/* ───────────────────────────────────────────────────
   HERO — 4 swappable 3D concepts + dense content
   ─────────────────────────────────────────────────── */

/* Concept 1: Floating Knife with chromatic float-value rings */
function HeroConcept_Knife() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf;
    let t = 0;
    const tick = () => {
      t += 0.4;
      el.style.transform = `rotateY(${t}deg) rotateX(${Math.sin(t / 60) * 12}deg)`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  // chromatic float rings
  const rings = [
    { r: 240, color: 'oklch(0.78 0.16 150)', label: 'FN', val: '0.00–0.07' },
    { r: 290, color: 'oklch(0.82 0.18 130)', label: 'MW', val: '0.07–0.15' },
    { r: 340, color: 'oklch(0.82 0.16 75)', label: 'FT', val: '0.15–0.38' },
    { r: 390, color: 'oklch(0.74 0.18 40)', label: 'WW', val: '0.38–0.45' },
    { r: 440, color: 'oklch(0.66 0.22 25)', label: 'BS', val: '0.45–1.00' },
  ];

  return (
    <div className="hero-3d-stage" style={{ perspective: 1400 }}>
      {/* concentric rings */}
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

      {/* combat blade — bowie/tactical silhouette */}
      <div ref={ref} style={{
        position: 'relative', transformStyle: 'preserve-3d', width: 460, height: 460,
        display: 'grid', placeItems: 'center',
      }}>
        <svg viewBox="0 0 600 200" width="500" height="167" style={{
          filter: 'drop-shadow(0 12px 40px oklch(0.68 0.22 5 / 0.45)) drop-shadow(0 0 20px oklch(0.68 0.22 5 / 0.3))',
          transform: 'rotate(-12deg)',
        }}>
          <defs>
            <linearGradient id="blade" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#e8ecf2" />
              <stop offset="40%" stopColor="#c8cdd6" />
              <stop offset="55%" stopColor="#f6f7fb" />
              <stop offset="80%" stopColor="#7a8090" />
              <stop offset="100%" stopColor="#4a5060" />
            </linearGradient>
            <linearGradient id="bladeEdge" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.92 0.08 5)" />
              <stop offset="100%" stopColor="#fff" />
            </linearGradient>
            <linearGradient id="grip" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#3a3f4c" />
              <stop offset="50%" stopColor="#1a1e28" />
              <stop offset="100%" stopColor="#0a0c11" />
            </linearGradient>
            <linearGradient id="bolster" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.78 0.18 5)" />
              <stop offset="100%" stopColor="oklch(0.5 0.22 5)" />
            </linearGradient>
          </defs>

          {/* Blade — bowie/clip-point shape, pointing right */}
          <path d="M 200 90
                   L 380 80
                   Q 460 78 520 88
                   L 560 100
                   L 510 112
                   Q 460 115 380 110
                   L 200 100
                   Z"
                fill="url(#blade)" stroke="rgba(0,0,0,0.4)" strokeWidth="0.5" />

          {/* Blade tip refinement (clip point) */}
          <path d="M 480 88 L 560 100 L 480 112 Z" fill="url(#blade)" />

          {/* Edge highlight */}
          <path d="M 210 102 Q 380 108 510 110" stroke="url(#bladeEdge)" strokeWidth="1" fill="none" opacity="0.7" />

          {/* Fuller groove */}
          <path d="M 240 96 L 470 92" stroke="rgba(0,0,0,0.25)" strokeWidth="1.5" fill="none" />
          <path d="M 240 98 L 470 94" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" fill="none" />

          {/* Spine line */}
          <path d="M 200 90 L 380 80 Q 460 78 510 88" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" fill="none" />

          {/* Bolster / guard */}
          <path d="M 175 70 L 200 80 L 200 110 L 175 122 Q 165 96 175 70 Z" fill="url(#bolster)" stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />

          {/* Grip / handle */}
          <path d="M 50 80 Q 35 82 30 96 Q 35 110 50 112 L 175 122 L 175 70 Z" fill="url(#grip)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />

          {/* Grip rivets */}
          <circle cx="80" cy="90" r="3" fill="#2a2f3c" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
          <circle cx="120" cy="92" r="3" fill="#2a2f3c" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
          <circle cx="80" cy="103" r="3" fill="#2a2f3c" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
          <circle cx="120" cy="105" r="3" fill="#2a2f3c" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />

          {/* Pommel */}
          <circle cx="32" cy="96" r="6" fill="url(#grip)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />

          {/* Lanyard hole */}
          <circle cx="44" cy="96" r="2.5" fill="#000" />
        </svg>
      </div>

      {/* center readout */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, calc(-50% + 200px))',
        textAlign: 'center', pointerEvents: 'none',
      }}>
        <div className="eyebrow" style={{ color: 'var(--accent)' }}>// FLOAT VALUE</div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 32, fontWeight: 500, color: 'var(--fg-0)' }}>0.0184</div>
        <div className="eyebrow" style={{ marginTop: 4 }}>FACTORY NEW · TIER 4</div>
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
    label: 'Sir Bloody Darryl Royale',
    marketHashName: 'Sir Bloody Darryl Royale | The Professionals',
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

function HeroConcept_Operators({ portfolio, loading, lang, onItemClick }) {
  const [imageIndex, setImageIndex] = useState(0);
  const [missingByIndex, setMissingByIndex] = useState({});
  const rotateTimerRef = useRef(null);
  const marketPrices = useHeroMarketPrices();
  const totalValue = Number.isFinite(portfolio?.totalValue) ? compactUsd(portfolio.totalValue) : '...';
  const readoutLabel = lang === 'ru' ? '// СТОИМОСТЬ ПОРТФЕЛЯ' : '// PORTFOLIO VALUE';
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
    const updatedAt = price?.updatedAt || marketPrices.updatedAt;
    return {
      ...card,
      price,
      priceLabel: Number.isFinite(value) ? formatItemPrice(price, value, { digits: 2 }) : marketPrices.loading ? '...' : 'N/A',
      provider: price?.provider || (marketPrices.error ? 'offline' : 'market'),
      updatedLabel: updatedAt
        ? new Date(updatedAt).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' })
        : null,
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

  const scheduleAutoRotate = () => {
    if (HERO_OPERATORS_IMAGES.length < 2) return;
    if (rotateTimerRef.current) clearInterval(rotateTimerRef.current);
    rotateTimerRef.current = setInterval(() => {
      setImageIndex((current) => (current + 1) % HERO_OPERATORS_IMAGES.length);
    }, HERO_OPERATORS_IMAGE_DELAY_MS);
  };

  useEffect(() => {
    scheduleAutoRotate();
    return () => {
      if (rotateTimerRef.current) clearInterval(rotateTimerRef.current);
    };
  }, []);

  const selectImage = (nextIndex) => {
    setImageIndex(nextIndex);
    scheduleAutoRotate();
  };

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

      {HERO_OPERATORS_IMAGES.length > 1 ? (
        <div className="hero-operators-picker" role="tablist" aria-label={lang === 'ru' ? 'Картинки героя' : 'Hero images'}>
          {HERO_OPERATORS_IMAGES.map((image, index) => (
            <button
              key={image.src}
              type="button"
              role="tab"
              aria-selected={index === imageIndex}
              aria-label={image.alt}
              className={`hero-operators-picker-dot${index === imageIndex ? ' is-active' : ''}`}
              onClick={() => selectImage(index)}
            />
          ))}
        </div>
      ) : null}

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
                  <span>{pricedCard.provider}</span>
                </div>
                <div className="hero-market-price-value">{pricedCard.priceLabel}</div>
                <div className="hero-market-price-name">{pricedCard.label || pricedCard.marketHashName}</div>
                {pricedCard.updatedLabel ? (
                  <div className="hero-market-price-updated">
                    {lang === 'ru' ? 'обновлено' : 'updated'} {pricedCard.updatedLabel}
                  </div>
                ) : null}
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
                  <span>{pricedCard.provider}</span>
                </div>
                <div className="hero-market-price-value">{pricedCard.priceLabel}</div>
                <div className="hero-market-price-name">{pricedCard.label || pricedCard.marketHashName}</div>
                {pricedCard.updatedLabel ? (
                  <div className="hero-market-price-updated">
                    {lang === 'ru' ? 'обновлено' : 'updated'} {pricedCard.updatedLabel}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <div className="hero-operators-readout">
        <div className="eyebrow" style={{ color: 'var(--accent)' }}>{readoutLabel}</div>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 26, fontWeight: 500, marginTop: 4 }}>{totalValue}</div>
      </div>
    </div>
  );
}

/* Hero locked to Operators concept */
function Hero({ lang, onLink, onPublicProfile, onItemClick, auth }) {
  const t = useT(lang);
  const [profileUrl, setProfileUrl] = useState('');
  const [profileUrlError, setProfileUrlError] = useState('');
  const portfolio = usePortfolio(auth);
  const market = useMarketSnapshot({ ticker: [], cases: [] });
  const catalog = useMarketCatalog({ page: 1, pageSize: 1, sort: 'name-asc' });

  const heroCopy = useMemo(() => {
    const catalogTotal = Number(catalog.data?.totalCount);
    const ticker = Array.isArray(market.data?.ticker) ? market.data.ticker : [];
    const cases = Array.isArray(market.data?.cases) ? market.data.cases : [];
    const watchlistVolume = ticker.reduce((sum, item) => {
      const price = Number(item.price);
      const volume = Number(item.volume24h);
      if (!Number.isFinite(price) || !Number.isFinite(volume) || price <= 0 || volume <= 0) return sum;
      return sum + price * volume;
    }, 0);
    const portfolioValue = Number(portfolio.data?.totalValue);
    const hasPortfolio = Boolean(auth?.connected) && Number.isFinite(portfolioValue) && portfolioValue > 0;

    const formatCount = (value) => {
      if (!Number.isFinite(value) || value <= 0) return '—';
      if (value >= 1e6) return `${(value / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
      if (value >= 1e3) return `${(value / 1e3).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, '')}K`;
      return String(Math.round(value));
    };

    return [
      {
        key: 'stat-1',
        v: formatCount(catalogTotal),
        l: t.hero.stat1,
      },
      {
        key: 'stat-2',
        v: watchlistVolume > 0 ? compactUsd(watchlistVolume, { digits: 1, compact: true }) : '—',
        l: t.hero.stat2,
      },
      hasPortfolio
        ? {
          key: 'stat-3',
          v: compactUsd(portfolioValue, { digits: 1, compact: true }),
          l: t.hero.stat3,
        }
        : {
          key: 'stat-3',
          v: formatCount(cases.length),
          l: t.hero.stat3Fallback,
        },
    ];
  }, [auth?.connected, catalog.data?.totalCount, market.data, portfolio.data?.totalValue, t.hero]);

  const stage = useMemo(
    () => <HeroConcept_Operators portfolio={portfolio.data} loading={portfolio.loading} auth={auth} lang={lang} onItemClick={onItemClick} />,
    [auth, lang, onItemClick, portfolio.data, portfolio.loading]
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
              <SteamGlyph /> {t.hero.cta1}
            </button>
            <button className="btn btn-ghost" onClick={onLink}>{t.nav.dashboard}</button>
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
          </div>

          <div className="hero-stats">
            {heroCopy.map((s) => (
              <div key={s.key}>
                <div className="display" style={{ fontSize: 28, fontWeight: 500 }}>{s.v}</div>
                <div className="eyebrow" style={{ marginTop: 6 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: 3D stage */}
        <div className="hero-stage-wrap">
          {stage}
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

Object.assign(window, { Hero });
