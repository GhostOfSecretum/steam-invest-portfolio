import * as THREE from 'three';

export const TAU = Math.PI * 2;

export const C = {
  bg: 0x0a0c11,
  panel: 0x161a23,
  accent: 0xff2a8e,
  cyan: 0x7fd9e9,
  green: 0x5fe0a5,
  red: 0xe25a4a,
  amber: 0xf2c15c,
  rarity: [0x4b69ff, 0x8847ff, 0xd32ce6, 0xeb4b4b, 0xffd700],
};

export const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3));
export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function hash(i) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Same curve as useSimulatedLoadProgress in dashboard.jsx (3 -> 96 asymptotic),
// then snaps to 100 and loops so the demo can be watched continuously.
const LOOP_S = 10;
function progressAt(elapsed) {
  const s = elapsed % LOOP_S;
  if (s > 8.6) return 100;
  return Math.min(96, 3 + 93 * (1 - Math.exp(-s / 2.6)));
}

export function createApp({ build, camera: camOpts = {} }) {
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(C.bg, 0.04);

  const camera = new THREE.PerspectiveCamera(camOpts.fov ?? 36, 1, 0.1, 100);
  const camPos = new THREE.Vector3(...(camOpts.position ?? [0, 1.8, 7.5]));
  const camTarget = new THREE.Vector3(...(camOpts.target ?? [0, 0.2, 0]));
  camera.position.copy(camPos);

  scene.add(new THREE.HemisphereLight(0x9db6ff, 0x05060a, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(4, 7, 5);
  scene.add(key);
  const rimA = new THREE.PointLight(C.accent, 40, 24, 2);
  rimA.position.set(-4, 2.5, -3);
  scene.add(rimA);
  const rimB = new THREE.PointLight(C.cyan, 22, 24, 2);
  rimB.position.set(4.5, -1, 3.5);
  scene.add(rimB);

  // Model lives in `stage`; on wide screens it is pushed right of the HUD copy
  // to mirror the two-column dashboard-state card layout.
  const stage = new THREE.Group();
  scene.add(stage);

  const api = build({ THREE, scene, stage, camera, renderer });

  const pctEl = document.querySelector('[data-pct]');
  const fillEl = document.querySelector('[data-fill]');
  const stepLabel = document.querySelector('[data-step-label]');
  const stepEls = [...document.querySelectorAll('[data-step]')];

  const pointer = new THREE.Vector2();
  window.addEventListener('pointermove', (e) => {
    pointer.set((e.clientX / window.innerWidth - 0.5) * 2, (e.clientY / window.innerHeight - 0.5) * 2);
  });

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    stage.position.x = w > 900 ? 1.55 : 0;
    stage.position.y = w > 900 ? 0 : 0.9;
  }
  window.addEventListener('resize', resize);
  resize();

  const t0 = performance.now();
  let last = t0;
  let lastPct = -1;

  function frame(now) {
    const elapsed = (now - t0) / 1000;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const progress = progressAt(elapsed);
    const step = progress < 34 ? 0 : progress < 68 ? 1 : 2;
    const pct = Math.round(progress);
    if (pct !== lastPct) {
      lastPct = pct;
      pctEl.textContent = `${pct}%`;
      fillEl.style.width = `${pct}%`;
      stepEls.forEach((el, i) => el.classList.toggle('is-active', i === step));
      stepLabel.textContent = stepEls[step].textContent;
    }

    camera.position.x += (camPos.x + pointer.x * 0.5 - camera.position.x) * 0.05;
    camera.position.y += (camPos.y - pointer.y * 0.3 - camera.position.y) * 0.05;
    camera.lookAt(camTarget);

    api.update({ t: elapsed, dt, progress: progress / 100, step, pointer });
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
