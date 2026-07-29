/**
 * Mount the official img2threejs Glock-18 Ghost Protocol factory.
 * Includes assemble/explode (same algorithm as showcase Viewer.setExplode).
 * Requires: window.THREE, window.GlockGhostProtocol (glock-bundle.js)
 */
(function (global) {
  'use strict';

  function isRealMesh(o) {
    return Boolean(o && o.isMesh && o.geometry && !o.userData.isHighlight);
  }

  function hasSelectableDescendant(o, isSelectable) {
    return o.children.some((c) => isSelectable(c) || hasSelectableDescendant(c, isSelectable));
  }

  function makeIsSelectable(root) {
    return function isSelectable(o) {
      if (!o.name || o.userData.explodeWithParent || o.userData.isHighlight) return false;
      if (isRealMesh(o)) return true;
      let hasMesh = false;
      o.traverse((c) => { if (isRealMesh(c)) hasMesh = true; });
      return hasMesh && !hasSelectableDescendant(o, isSelectable);
    };
  }

  function resolveOwner(hit, root, isSelectable) {
    let n = hit;
    while (n && n !== root) {
      if (isSelectable(n)) return n;
      n = n.parent;
    }
    return null;
  }

  function explodeUnits(root, isSelectable) {
    const units = [];
    const seen = new Set();
    root.traverse((o) => {
      if (!isRealMesh(o) || o.userData.explodeWithParent) return;
      const owner = resolveOwner(o, root, isSelectable) || o;
      if (seen.has(owner)) return;
      seen.add(owner);
      units.push(owner);
    });
    return units;
  }

  /** Port of showcase Viewer.prepareExplode — offsets in root-local space. */
  function prepareExplode(root) {
    const THREE = global.THREE;
    const isSelectable = makeIsSelectable(root);
    root.updateWorldMatrix(true, true);
    const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const meshes = explodeUnits(root, isSelectable);

    const centres = meshes.map((m) => {
      const box = new THREE.Box3().setFromObject(m);
      return box.getCenter(new THREE.Vector3()).applyMatrix4(rootInv);
    });
    const bounds = new THREE.Box3();
    for (const c of centres) bounds.expandByPoint(c);
    const origin = bounds.getCenter(new THREE.Vector3());
    const span = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(1e-4, bounds.getBoundingSphere(new THREE.Sphere()).radius);

    const thin = span.x <= span.y && span.x <= span.z
      ? new THREE.Vector3(1, 0, 0)
      : span.y <= span.z
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);

    const SCALE = 2.1;
    const base = Math.max(radius * 0.3, 0.18);
    const explodedBounds = new THREE.Box3();
    let concentric = 0;

    const parts = meshes.map((unit, i) => {
      const radial = centres[i].clone().sub(origin);
      let local;
      if (radial.length() < radius * 0.08) {
        const rank = concentric++;
        const step = (Math.floor(rank / 2) + 1) * base * 1.4;
        local = thin.clone().multiplyScalar(rank % 2 === 0 ? step : -step);
      } else {
        local = radial.clone().multiplyScalar(SCALE - 1)
          .addScaledVector(radial.clone().normalize(), base);
      }
      explodedBounds.expandByPoint(centres[i].clone().add(local));

      const toParent = new THREE.Matrix4()
        .multiplyMatrices(rootInv, unit.parent.matrixWorld)
        .invert();
      const len = local.length();
      const offset = local.clone().transformDirection(toParent).multiplyScalar(len);
      return { object: unit, rest: unit.position.clone(), offset };
    });

    const grown = explodedBounds.getBoundingSphere(new THREE.Sphere()).radius;
    const explodeZoom = Math.min(3.4, Math.max(1, grown / radius));
    return { parts, explodeZoom, radius };
  }

  function fitCameraToObject(camera, object, controlsTarget, { pad = 1.35 } = {}) {
    const THREE = global.THREE;
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.01);
    const fov = (camera.fov * Math.PI) / 180;
    const aspect = Math.max(camera.aspect || 1, 0.2);
    const fitHeightDist = maxDim / (2 * Math.tan(fov / 2));
    const fitWidthDist = fitHeightDist / aspect;
    const dist = Math.max(fitHeightDist, fitWidthDist) * pad;

    camera.near = Math.max(0.01, dist / 100);
    camera.far = Math.max(40, dist * 20);
    camera.position.set(center.x + dist * 0.06, center.y + dist * 0.08, center.z + dist);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    if (controlsTarget) controlsTarget.copy(center);
    return { center, dist, size };
  }

  function mountHeroGlockGhost(container) {
    const THREE = global.THREE;
    const API = global.GlockGhostProtocol;
    if (!THREE) {
      console.error('[glock-ghost] THREE missing');
      return { dispose() {}, setExplode() {}, getExplode() { return 0; }, canExplode: false };
    }
    if (!API || typeof API.createGlockGhostProtocolModel !== 'function') {
      console.error('[glock-ghost] GlockGhostProtocol bundle missing');
      return { dispose() {}, setExplode() {}, getExplode() { return 0; }, canExplode: false };
    }
    if (!container) {
      return { dispose() {}, setExplode() {}, getExplode() { return 0; }, canExplode: false };
    }

    const width = container.clientWidth || 520;
    const height = container.clientHeight || 520;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    if ('physicallyCorrectLights' in renderer) renderer.physicallyCorrectLights = true;
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;cursor:grab';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, width / Math.max(height, 1), 0.05, 120);

    if (typeof API.createGlockGhostProtocolLookDevLights === 'function') {
      scene.add(API.createGlockGhostProtocolLookDevLights());
    } else {
      scene.add(new THREE.HemisphereLight(0xffe8e0, 0x12080c, 0.5));
      const key = new THREE.DirectionalLight(0xfff2ee, 2.2);
      key.position.set(1.9, 3.4, 4.6);
      scene.add(key);
    }

    const model = API.createGlockGhostProtocolModel({ shadows: false });
    model.rotation.set(0.1, 0.4, -0.03);
    model.scale.setScalar(1);
    scene.add(model);

    const lookAt = new THREE.Vector3(0, 0, 0);
    let framing = fitCameraToObject(camera, model, lookAt, { pad: 1.5 });
    let baseCamDist = framing.dist;

    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(framing.size.x, framing.size.z) * 0.55, 48),
      new THREE.MeshBasicMaterial({
        color: 0xff3b5c,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(lookAt.x, framing.center.y - framing.size.y * 0.55, lookAt.z);
    scene.add(glow);

    // --- explode state (showcase Viewer port) ---
    let explodeParts = null;
    let explodeZoom = 1;
    let explodeT = 0;
    let explodeTarget = 0;
    let explodeApplied = false;

    const ensureExplodePrepared = () => {
      if (explodeParts) return;
      const prep = prepareExplode(model);
      explodeParts = prep.parts;
      explodeZoom = prep.explodeZoom;
    };

    const applyExplode = () => {
      ensureExplodePrepared();
      for (const p of explodeParts) {
        p.object.position.copy(p.rest).addScaledVector(p.offset, explodeT);
      }
      // Dolly camera back while separated so parts stay in frame
      const dist = baseCamDist * (1 + (explodeZoom - 1) * explodeT);
      const dir = camera.position.clone().sub(lookAt).normalize();
      if (dir.lengthSq() < 1e-8) dir.set(0.06, 0.08, 1).normalize();
      camera.position.copy(lookAt).addScaledVector(dir, dist);
      explodeApplied = explodeT > 0;
    };

    let raf = 0;
    let disposed = false;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let userYaw = 0;
    let userPitch = 0;
    const baseYaw = 0.4;
    const basePitch = 0.1;

    const onPointerDown = (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.style.cursor = 'grabbing';
      renderer.domElement.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e) => {
      if (!dragging) return;
      userYaw += (e.clientX - lastX) * 0.01;
      userPitch += (e.clientY - lastY) * 0.007;
      userPitch = Math.max(-0.65, Math.min(0.65, userPitch));
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerUp = (e) => {
      dragging = false;
      renderer.domElement.style.cursor = 'grab';
      renderer.domElement.releasePointerCapture?.(e.pointerId);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);

    const clock = new THREE.Clock();
    const animate = () => {
      if (disposed) return;
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      model.rotation.y = baseYaw + userYaw + Math.sin(t * 0.25) * 0.04;
      model.rotation.x = basePitch + userPitch + Math.sin(t * 0.35) * 0.012;
      // Don't bob while exploded — offsets are relative to rest positions
      if (explodeT < 0.01) model.position.y = Math.sin(t * 0.6) * 0.012;
      else model.position.y = 0;

      if (typeof model.userData.tick === 'function') model.userData.tick(t);

      // Ease explode AFTER demo tickers (showcase order)
      if (explodeT !== explodeTarget) {
        const k = 1 - Math.exp(-dtSafe(clock) * 5.5);
        explodeT += (explodeTarget - explodeT) * k;
        if (Math.abs(explodeTarget - explodeT) < 0.001) explodeT = explodeTarget;
        applyExplode();
      } else if (explodeT > 0 || explodeApplied) {
        applyExplode();
      }

      camera.lookAt(lookAt);
      if (!dragging) {
        userYaw *= 0.99;
        userPitch *= 0.99;
      }
      glow.material.opacity = 0.08 + Math.sin(t * 1.1) * 0.025;
      renderer.render(scene, camera);
    };

    let lastElapsed = 0;
    function dtSafe(clk) {
      const e = clk.getElapsedTime();
      const d = Math.min(0.05, Math.max(0.001, e - lastElapsed));
      lastElapsed = e;
      return d;
    }

    animate();

    const onResize = () => {
      const w = container.clientWidth || width;
      const h = Math.max(container.clientHeight || height, 1);
      camera.aspect = w / h;
      // Temporarily assemble to measure true bounds for framing
      const wasT = explodeT;
      const wasTarget = explodeTarget;
      if (explodeParts) {
        explodeT = 0;
        explodeTarget = 0;
        for (const p of explodeParts) p.object.position.copy(p.rest);
      }
      framing = fitCameraToObject(camera, model, lookAt, { pad: 1.5 });
      baseCamDist = framing.dist;
      glow.position.set(lookAt.x, framing.center.y - framing.size.y * 0.55, lookAt.z);
      explodeT = wasT;
      explodeTarget = wasTarget;
      if (explodeT > 0) applyExplode();
      renderer.setSize(w, h, false);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    if (ro) ro.observe(container);
    else window.addEventListener('resize', onResize);

    const refitTimer = window.setTimeout(() => {
      if (!disposed) onResize();
    }, 250);

    return {
      canExplode: true,
      getExplode() {
        return explodeTarget;
      },
      setExplode(t) {
        const next = Math.max(0, Math.min(1, Number(t) || 0));
        if (explodeT === 0 && next > 0) {
          baseCamDist = camera.position.distanceTo(lookAt);
          ensureExplodePrepared();
        }
        explodeTarget = next;
      },
      dispose() {
        disposed = true;
        window.clearTimeout(refitTimer);
        cancelAnimationFrame(raf);
        if (ro) ro.disconnect();
        else window.removeEventListener('resize', onResize);
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointermove', onPointerMove);
        renderer.domElement.removeEventListener('pointerup', onPointerUp);
        renderer.domElement.removeEventListener('pointercancel', onPointerUp);
        scene.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((m) => {
              if (!m) return;
              ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap'].forEach((k) => {
                if (m[k] && m[k].dispose) m[k].dispose();
              });
              m.dispose();
            });
          }
        });
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      },
    };
  }

  global.mountHeroGlockGhost = mountHeroGlockGhost;
})(typeof window !== 'undefined' ? window : globalThis);
