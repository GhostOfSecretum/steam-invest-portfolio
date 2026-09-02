/* global React, useT, usePortfolio, useMarketSnapshot, useMarketCatalog, compactUsd, tt */
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

/* Hero stage: the actual Portfolio screens — Overview, then Items */
const HERO_APP_SLIDE_MS = 6500;
const HERO_APP_DEMO = {
  uniqueCount: 22,
  totalCount: 74,
  pricedCount: 74,
  totalValue: 4280,
  pnl: 320,
  pnlPct: 8.08,
  totalBasis: 3960,
  topName: '★ Karambit | Autotronic (Minimal Wear)',
  topShare: 41,
  topFiveShare: 73,
  items: [
    { name: '★ Karambit | Autotronic (Minimal Wear)', marketHashName: '★ Karambit | Autotronic (Minimal Wear)', collection: 'The Gamma Collection', qty: 1, basis: 1420, totalValue: 1765, pnlPct: 24.3, tier: 5, iconUrl: 'https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Q7uCvZaZkNM-UHVibwPx3vd5oWj28gQ8ovTSGpYPwJiPTcAMkCJt3QuVY4xXrloHhP-nlsw2Ljo1NzS6ohitJvCc4sOcHAqInqKfJz1aWliaAF_M' },
    { name: 'AWP | Neo-Noir (Factory New)', marketHashName: 'AWP | Neo-Noir (Factory New)', collection: 'The Color of Violence Collection', qty: 1, basis: 760, totalValue: 890, pnlPct: 17.1, tier: 5, iconUrl: 'https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf_jdk7uW-V6poL_6cB3WvzedxuPUnHirrxR4l423SyI39I3KXPwdxWZclQeNZ5EXskYfnNeyw71OMi9lNzDK-0H3r66pOTw' },
    { name: 'M4A1-S | Black Lotus (Field-Tested)', marketHashName: 'M4A1-S | Black Lotus (Field-Tested)', collection: 'The Recoil Collection', qty: 3, basis: 110, totalValue: 282, pnlPct: -14.5, tier: 5, iconUrl: 'https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwjFS4_ega6F_H_3HDzaD_ux6seJicCW8gQg0jDCAnobsLGWTbQQnDsN3QuYOtELqkIazZeLm7lPYj9gQzyj72y8du31i6ulQA6Rx5OSJ2CPXrFUp' },
    { name: 'StatTrak™ USP-S | Ticket to Hell (Minimal Wear)', marketHashName: 'StatTrak™ USP-S | Ticket to Hell (Minimal Wear)', collection: 'The Kilowatt Collection', qty: 2, basis: 58, totalValue: 134, pnlPct: 15.5, tier: 4, iconUrl: 'https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLkjYbf7itX6vytbbZSI-WsG3SA_vp5j-lsQyWMmRQguynLzt_8JXiVOwF2AsF4R-ECshftltKxZe6x41CKjotExST8jn8f7ilr5PFCD_TZVvgG5g' },
    { name: 'Fever Case', marketHashName: 'Fever Case', collection: null, qty: 36, basis: 2.10, totalValue: 67, pnlPct: -11.9, tier: 1, iconUrl: 'https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XsnXwtmkJjSU91dh8bj35VTqVBP4io_frncVtqv7MPE8JaHHCj_Dl-wk4-NtFirikURy4jiGwo2udHqVaAEjDZp3EflK7EeSMnMs4w' },
    { name: 'AK-47 | Slate (Factory New)', marketHashName: 'AK-47 | Slate (Factory New)', collection: 'The Control Collection', qty: 4, basis: 19.50, totalValue: 96, pnlPct: 23.1, tier: 3, iconUrl: 'https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwlcK3wiVI0POlPPNSMOKcCGKD0ud5vuBlcCW6khUz_W3Sytb4cCqTOFUpWJtzTOUD5hPsw9a0Yrnrs1SK3ooXzy6shilM5311o7FVYrIufmI' },
    { name: 'M4A4 | Temukau (Minimal Wear)', marketHashName: 'M4A4 | Temukau (Minimal Wear)', collection: 'The Revolution Collection', qty: 2, basis: 38.00, totalValue: 63, pnlPct: -17.1, tier: 5, iconUrl: 'https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwiFO0P_6afBSNPWeG2yR1NF6ueZhW2ewlBtx5W6AmYv9JS6XaAV1CJEmTeUL4UTpxNzjZO3jtgaIjN9ExCuskGoXuRnyRhBA' },
    { name: 'Glock-18 | Pink DDPAT (Factory New)', marketHashName: 'Glock-18 | Pink DDPAT (Factory New)', collection: 'The Overpass Collection', qty: 6, basis: 7.50, totalValue: 54, pnlPct: 19.4, tier: 3, iconUrl: 'https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL2kpnj9h1T9s2qbLRsNM-DB2mb_uJ_t-l9ASi2lBgjsmjSm4ugeX6WO1AoCsElFuEIuhC6xta2Zbmw5gCMjtlAni3gznQeU26CORw' },
    { name: 'P250 | Visions (Factory New)', marketHashName: 'P250 | Visions (Factory New)', collection: 'The Recoil Collection', qty: 5, basis: 12.40, totalValue: 48, pnlPct: -22.4, tier: 4, iconUrl: 'https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLhzMOwwiVI0OL8PfRSNvmAB2ie0tF6ueZhW2fmzERx5jyHm4v_dXvGaQR2WJF2QrIMsxW_w9PvN-zhtgXXiokWn3_6kGoXuc_iGAKZ' },
    { name: 'Recoil Case', marketHashName: 'Recoil Case', collection: null, qty: 18, basis: 2.55, totalValue: 41, pnlPct: -10.6, tier: 1, iconUrl: 'https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XsnXwtmkJjSU91dh8bj35VTqVBP4io_frnMVu6b-avA-JqSSCjSWwuhz47U9TCzlxh9yt2WGnNqgIi-fbgUkWMNxFPlK7EdIJF6a2Q' },
  ],
  best: [
    { name: 'AK-47 | Slate', marketHashName: 'AK-47 | Slate (Factory New)', pct: 23.1 },
    { name: 'Glock-18 | Pink DDPAT', marketHashName: 'Glock-18 | Pink DDPAT (Factory New)', pct: 19.4 },
    { name: 'Sticker | Vitality (Glitter) | Paris 2023', marketHashName: 'Sticker | Vitality (Glitter) | Paris 2023', pct: 16.8 },
  ],
  worst: [
    { name: 'M4A4 | Temukau', marketHashName: 'M4A4 | Temukau (Minimal Wear)', pct: -17.1 },
    { name: 'P250 | Visions', marketHashName: 'P250 | Visions (Factory New)', pct: -22.4 },
    { name: 'Tec-9 | Flash Out', marketHashName: 'Tec-9 | Flash Out (Factory New)', pct: -19.6 },
  ],
};

/* Daily-ish closes: accumulation, case dump, grind, knife jump, late chop. Ends at demo.totalValue. */
const HERO_APP_HISTORY = [
  1920, 1948, 1931, 2010, 1994, 2082, 2065, 2144, 2180, 2160,
  2268, 2305, 2235, 2120, 2038, 2150, 2260, 2348, 2432, 2490,
  2516, 2590, 2650, 2712, 2690, 2770, 2710, 2802, 2796, 2865,
  2890, 2872, 2980, 3040, 3260, 3228, 3370, 3280, 3420, 3310,
  3290, 3440, 3482, 3518, 3664, 3548, 3725, 3768, 3965, 3920,
  4088, 4040, 4180, 4148, 4210, 4280,
];

function heroChartGeometry(values, w = 320, h = 92) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const top = 8;
  const bottom = 6;
  const pts = values.map((value, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = top + (1 - (value - lo) / span) * (h - top - bottom);
    return [x, y];
  });
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return {
    line,
    area: `${line} L${w} ${h} L0 ${h} Z`,
    last: pts[pts.length - 1],
  };
}

const HERO_APP_CHART = heroChartGeometry(HERO_APP_HISTORY);

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

function HeroConcept_PortfolioSlides({ lang }) {
  const t = useT(lang);
  const demo = HERO_APP_DEMO;
  const [slide, setSlide] = useState('overview');
  const [paused, setPaused] = useState(false);
  const money = (value, digits = 0) => compactUsd(value, { digits });
  const sections = [
    { id: 'overview', label: tt(lang, { en: 'Overview', ru: 'Обзор', zh: '总览', 'zh-TW': '總覽' }) },
    { id: 'items', label: tt(lang, { en: 'Items', ru: 'Предметы', zh: '物品', 'zh-TW': '物品' }), count: demo.totalCount },
  ];

  useEffect(() => {
    if (paused) return undefined;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = setInterval(() => {
      setSlide((current) => (current === 'overview' ? 'items' : 'overview'));
    }, HERO_APP_SLIDE_MS);
    return () => clearInterval(timer);
  }, [paused]);

  return (
    <div className="hero-3d-stage hero-desk-stage">
      <div className="hero-operators-glow"></div>
      <HeroOperatorsBackdrop />

      <div
        className="hero-app"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="hero-app-frame">
          <div className="hero-app-chrome">
            <div className="dash-section-tabs" role="tablist" aria-label={tt(lang, { en: 'Portfolio sections', ru: 'Разделы портфеля', zh: '库存分区', 'zh-TW': '庫存分區' })}>
              {sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  aria-selected={slide === section.id}
                  className="dash-section-tab"
                  data-active={slide === section.id}
                  onClick={() => setSlide(section.id)}
                >
                  {section.label}
                  {Number.isFinite(section.count) && <span>{section.count}</span>}
                </button>
              ))}
            </div>
            <i>{tt(lang, { en: 'Your portfolio', ru: 'Твой портфель', zh: '你的库存', 'zh-TW': '你的庫存' })}</i>
          </div>

          <div className="hero-app-stage">
          <div className="hero-app-slide" role="tabpanel" data-active={slide === 'overview' ? 'true' : 'false'} aria-hidden={slide !== 'overview'}>
              <div className="dash-stats">
                <div className="glass dash-stat-card">
                  <div className="dash-stat-accent" />
                  <div className="eyebrow">{t.dash.total}</div>
                  <div className="display dash-stat-value">{money(demo.totalValue)}</div>
                  <div className="dash-stat-delta">{tt(lang, { en: `${demo.pricedCount} of ${demo.totalCount} priced`, ru: `${demo.pricedCount} из ${demo.totalCount} оценено`, zh: `${demo.pricedCount} / ${demo.totalCount} 已估价`, 'zh-TW': `${demo.pricedCount} / ${demo.totalCount} 已估價` })}</div>
                  <div className="dash-stat-sub">{tt(lang, { en: `${demo.uniqueCount} unique positions`, ru: `${demo.uniqueCount} уникальных позиций`, zh: `${demo.uniqueCount} 个独立持仓`, 'zh-TW': `${demo.uniqueCount} 個獨立持倉` })}</div>
                </div>
                <div className="glass dash-stat-card">
                  <div className="eyebrow">{t.dash.pnl}</div>
                  <div className="display dash-stat-value">{`${demo.pnl >= 0 ? '+' : ''}${money(demo.pnl)}`}</div>
                  <div className="dash-stat-delta" style={{ color: demo.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{`${demo.pnlPct >= 0 ? '+' : ''}${demo.pnlPct.toFixed(2)}%`}</div>
                  <div className="dash-stat-sub">{tt(lang, { en: `Cost basis ${money(demo.totalBasis)}`, ru: `Себестоимость ${money(demo.totalBasis)}`, zh: `成本基础 ${money(demo.totalBasis)}`, 'zh-TW': `成本基礎 ${money(demo.totalBasis)}` })}</div>
                </div>
                <div className="glass dash-stat-card">
                  <div className="eyebrow">{tt(lang, { en: 'SELLABLE NOW', ru: 'ДОСТУПНО К ПРОДАЖЕ', zh: '现在可售', 'zh-TW': '現在可售' })}</div>
                  <div className="display dash-stat-value">{money(demo.totalValue)}</div>
                  <div className="dash-stat-delta" style={{ color: 'var(--cyan)' }}>{tt(lang, { en: `${demo.totalCount} of ${demo.totalCount} marketable`, ru: `${demo.totalCount} из ${demo.totalCount} доступны`, zh: `${demo.totalCount} / ${demo.totalCount} 可出售`, 'zh-TW': `${demo.totalCount} / ${demo.totalCount} 可出售` })}</div>
                  <div className="dash-stat-sub">{tt(lang, { en: '0 locked or in storage', ru: '0 заблокировано или в хранилище', zh: '0 锁定或在仓库', 'zh-TW': '0 鎖定或在倉庫' })}</div>
                </div>
                <div className="glass dash-stat-card">
                  <div className="eyebrow">{tt(lang, { en: 'CONCENTRATION', ru: 'КОНЦЕНТРАЦИЯ', zh: '集中度', 'zh-TW': '集中度' })}</div>
                  <div className="display dash-stat-value">{`${demo.topShare}%`}</div>
                  <div className="dash-stat-delta" style={{ color: 'var(--amber)' }}>{demo.topName}</div>
                  <div className="dash-stat-sub">{tt(lang, { en: `Top 5 = ${demo.topFiveShare}% of portfolio`, ru: `Топ-5 = ${demo.topFiveShare}% портфеля`, zh: `前 5 = 库存的 ${demo.topFiveShare}%`, 'zh-TW': `前 5 = 庫存的 ${demo.topFiveShare}%` })}</div>
                </div>
              </div>

              <div className="dash-chart-row">
                <div className="glass dash-panel">
                  <div className="dash-chart-toolbar">
                    <div>
                      <div className="eyebrow">{tt(lang, { en: 'VALUE OVER TIME', ru: 'СТОИМОСТЬ ВО ВРЕМЕНИ', zh: '价值随时间', 'zh-TW': '價值隨時間' })}</div>
                      <div className="hero-app-muted">{tt(lang, { en: 'USD · real price history · 60% coverage · csfloat', ru: 'USD · история реальных цен · покрытие 60% · csfloat', zh: 'USD · 真实价格历史 · 覆盖 60% · csfloat', 'zh-TW': 'USD · 真實價格歷史 · 覆蓋 60% · csfloat' })}</div>
                    </div>
                    <div className="dash-range-switch">
                      {['7d', '30d', '90d', tt(lang, { en: 'ALL', ru: 'ВСЁ', zh: '全部', 'zh-TW': '全部' })].map((label, index) => (
                        <button key={label} type="button" tabIndex={-1} style={{
                          padding: '5px 9px', fontFamily: 'var(--f-mono)', fontSize: 10,
                          color: index === 3 ? 'var(--fg-0)' : 'var(--fg-3)',
                          background: index === 3 ? 'rgba(255,255,255,0.06)' : 'transparent',
                        }}>{label}</button>
                      ))}
                    </div>
                  </div>
                  <svg className="hero-app-chart" viewBox="0 0 320 92" preserveAspectRatio="none" aria-hidden="true">
                    <defs>
                      <linearGradient id="heroAppFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="oklch(0.68 0.22 5)" stopOpacity="0.34" />
                        <stop offset="100%" stopColor="oklch(0.68 0.22 5)" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="heroAppLine" x1="0" x2="1">
                        <stop offset="0%" stopColor="oklch(0.78 0.18 5)" />
                        <stop offset="100%" stopColor="oklch(0.6 0.22 5)" />
                      </linearGradient>
                    </defs>
                    {[23, 46, 69].map((y) => (
                      <line key={y} x1="0" x2="320" y1={y} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="2 4" />
                    ))}
                    <path d={HERO_APP_CHART.area} fill="url(#heroAppFill)" />
                    <path d={HERO_APP_CHART.line} fill="none" stroke="url(#heroAppLine)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
                    <circle cx={HERO_APP_CHART.last[0]} cy={HERO_APP_CHART.last[1]} r="2.4" fill="oklch(0.68 0.22 5)" stroke="#fff" strokeWidth="0.8" />
                  </svg>
                </div>

                <div className="glass dash-panel hero-app-leaders">
                  <div className="eyebrow">{t.dash.leaders}</div>
                  <div className="hero-app-muted">{t.dash.leadersHint}</div>
                  <div className="hero-app-leader-label">{t.dash.bestLeaders}</div>
                  {demo.best.map((row) => (
                    <div className="hero-app-leader" key={row.marketHashName}>
                      <span>{row.name}</span>
                      <b data-positive="true">{`+${row.pct.toFixed(1)}%`}</b>
                    </div>
                  ))}
                  <div className="hero-app-leader-label">{t.dash.worstLeaders}</div>
                  {demo.worst.map((row) => (
                    <div className="hero-app-leader" key={row.marketHashName}>
                      <span>{row.name}</span>
                      <b>{`${row.pct.toFixed(1)}%`}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          <div className="hero-app-slide" role="tabpanel" data-active={slide === 'items' ? 'true' : 'false'} aria-hidden={slide !== 'items'}>
              <div className="glass dash-inventory">
                <div className="dash-inventory-toolbar">
                  <div>
                    <div className="eyebrow">{tt(lang, { en: 'PORTFOLIO ITEMS', ru: 'ПРЕДМЕТЫ ПОРТФЕЛЯ', zh: '库存物品', 'zh-TW': '庫存物品' })}</div>
                    <div className="dash-inventory-meta">{demo.uniqueCount}/{demo.uniqueCount} · {demo.totalCount} {tt(lang, { en: 'items', ru: 'шт.', zh: '件', 'zh-TW': '件' })}</div>
                  </div>
                  <div className="dash-inventory-actions">
                    <span className="dash-inventory-search">{tt(lang, { en: 'Find an item...', ru: 'Найти предмет...', zh: '查找物品...', 'zh-TW': '尋找物品...' })}</span>
                  </div>
                </div>
                <div className="hero-app-grid hero-app-grid-head">
                  <span>#</span>
                  <span>{tt(lang, { en: 'Item', ru: 'Предмет', zh: '物品', 'zh-TW': '物品' })}</span>
                  <span>{tt(lang, { en: 'Qty', ru: 'Кол-во', zh: '数量', 'zh-TW': '數量' })}</span>
                  <span>{tt(lang, { en: 'Basis', ru: 'Покупка', zh: '成本', 'zh-TW': '成本' })}</span>
                  <span>{tt(lang, { en: 'Value', ru: 'Стоимость', zh: '价值', 'zh-TW': '價值' })} ↓</span>
                  <span>P&L</span>
                </div>
                <div className="hero-app-items-body">
                {demo.items.slice().sort((a, b) => b.totalValue - a.totalValue).map((item, index) => (
                  <div
                    className="hero-app-grid hero-app-grid-row"
                    key={item.marketHashName}
                    data-last={index === demo.items.length - 1}
                  >
                    <em>{String(index + 1).padStart(2, '0')}</em>
                    <span className="hero-app-item">
                      {item.iconUrl
                        ? <img src={item.iconUrl} alt="" />
                        : <i data-tier={item.tier} aria-hidden="true" />}
                      <span>
                        <b>{item.name}</b>
                        {item.collection && <small>{item.collection}</small>}
                      </span>
                    </span>
                    <strong>{item.qty}</strong>
                    <strong>{money(item.basis, 2)}</strong>
                    <b className="inv-value-mark">{money(item.totalValue)}</b>
                    <u data-positive={item.pnlPct >= 0}>{`${item.pnlPct >= 0 ? '+' : ''}${item.pnlPct.toFixed(1)}%`}</u>
                  </div>
                ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
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
        <span>{tt(lang, { en: 'MY PORTFOLIO', ru: 'МОЙ ПОРТФЕЛЬ', zh: '我的库存', 'zh-TW': '我的庫存' })}</span>
        <i>{tt(lang, { en: 'LIVE', ru: 'ОБНОВЛЕНО', zh: '实时', 'zh-TW': '即時' })}</i>
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

/* Hero stage: portfolio app slides */
function Hero({ lang, onLink, onPublicProfile, onItemClick, auth }) {
  const t = useT(lang);
  const [profileUrl, setProfileUrl] = useState('');
  const [profileUrlError, setProfileUrlError] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);

  const stage = useMemo(
    () => <HeroConcept_PortfolioSlides lang={lang} />,
    [lang]
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

        {/* Right: portfolio screens */}
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
  return <div className="hero-hud-bracket" style={{ position: 'absolute', width: 20, height: 20, borderColor: 'var(--accent)', opacity: 0.4, ...styles[pos] }}></div>;
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

  const copy = tt(lang, {
    en: {
      eyebrow: '// SKINSHEAD · 3D PREVIEW',
      title: 'Glock-18 · Ghost Protocol',
      sub: 'Interactive CS2 skin preview on SkinsHead. Drag to orbit, explode the model, and inspect the shape up close.',
      hint: 'DRAG TO ORBIT',
      explode: 'Explode',
      assemble: 'Assemble',
    },
    ru: {
      eyebrow: '// SKINSHEAD · 3D PREVIEW',
      title: 'Glock-18 · Ghost Protocol',
      sub: 'Интерактивный 3D-превью скина на SkinsHead. Крутите мышью, разбирайте модель и смотрите форму в деталях.',
      hint: 'ТЯНИТЕ ДЛЯ ОРБИТЫ',
      explode: 'Разобрать',
      assemble: 'Собрать',
    },
    zh: {
      eyebrow: '// SKINSHEAD · 3D PREVIEW',
      title: 'Glock-18 · Ghost Protocol',
      sub: 'SkinsHead 上的交互式 CS2 皮肤预览。拖动旋转、拆解模型并近距离查看外形。',
      hint: '拖动以环绕',
      explode: '拆解',
      assemble: '组装',
    },
    'zh-TW': {
      eyebrow: '// SKINSHEAD · 3D PREVIEW',
      title: 'Glock-18 · Ghost Protocol',
      sub: 'SkinsHead 上的互動式 CS2 皮膚預覽。拖曳旋轉、拆解模型並近距離查看外形。',
      hint: '拖曳以環繞',
      explode: '拆解',
      assemble: '組裝',
    },
  });

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
