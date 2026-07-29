/**
 * Procedural Classic Knife · Fade for the hero stage.
 * Inspired by img2threejs showcase demos — self-contained (no textures/geo.json).
 * Requires global THREE from CDN.
 */
(function (global) {
  'use strict';

  function makeFadeMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec3 vPos;
        varying vec3 vNormal;
        void main() {
          vPos = position;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPos;
        varying vec3 vNormal;
        uniform float uTime;

        // Classic Knife Fade stops (approx CS palette)
        vec3 fadeAt(float t) {
          t = clamp(t, 0.0, 1.0);
          vec3 purple = vec3(0.42, 0.12, 0.72);
          vec3 magenta = vec3(0.85, 0.18, 0.55);
          vec3 coral = vec3(0.95, 0.38, 0.22);
          vec3 gold = vec3(0.98, 0.78, 0.18);
          vec3 tip = vec3(0.98, 0.92, 0.55);
          if (t < 0.28) return mix(purple, magenta, t / 0.28);
          if (t < 0.52) return mix(magenta, coral, (t - 0.28) / 0.24);
          if (t < 0.78) return mix(coral, gold, (t - 0.52) / 0.26);
          return mix(gold, tip, (t - 0.78) / 0.22);
        }

        void main() {
          // Blade runs +X tip; Fade reads tip → butt along length
          float t = smoothstep(-0.55, 1.35, vPos.x);
          // Soft wavy lower boundary like real Fade seed
          float wave = 0.035 * sin(vPos.x * 9.0 + uTime * 0.4) * smoothstep(0.1, 0.9, t);
          t = clamp(t + wave * step(vPos.y, 0.02), 0.0, 1.0);

          vec3 base = fadeAt(t);
          vec3 N = normalize(vNormal);
          vec3 L = normalize(vec3(0.45, 0.85, 0.55));
          float ndl = max(dot(N, L), 0.0);
          float rim = pow(1.0 - max(dot(N, vec3(0.0, 0.2, 1.0)), 0.0), 2.4);
          float spec = pow(ndl, 48.0) * 0.55;

          // Steel grind near edge (lower Y)
          float edge = smoothstep(0.02, -0.12, vPos.y);
          vec3 steel = vec3(0.72, 0.74, 0.78);
          vec3 col = mix(base, steel, edge * 0.35);

          col = col * (0.35 + 0.55 * ndl) + vec3(spec) + rim * 0.18 * base;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }

  function makeMetal(color, roughness, metalness) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: roughness ?? 0.35,
      metalness: metalness ?? 0.85,
    });
  }

  function buildKnife() {
    const root = new THREE.Group();
    root.name = 'ClassicKnifeFade';

    // --- Blade silhouette (XZ plane extruded): tip +X ---
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-0.05, 0.09);
    bladeShape.lineTo(0.55, 0.095);
    bladeShape.quadraticCurveTo(0.95, 0.09, 1.28, 0.02);
    bladeShape.lineTo(1.38, -0.01);
    bladeShape.quadraticCurveTo(1.15, -0.07, 0.7, -0.085);
    bladeShape.lineTo(0.15, -0.07);
    // choil
    bladeShape.quadraticCurveTo(0.02, -0.05, -0.02, 0.0);
    bladeShape.lineTo(-0.05, 0.09);

    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.055,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.006,
      bevelSegments: 2,
      curveSegments: 12,
    });
    bladeGeo.translate(0, 0, -0.0275);
    bladeGeo.computeVertexNormals();

    const fadeMat = makeFadeMaterial();
    const blade = new THREE.Mesh(bladeGeo, fadeMat);
    blade.castShadow = true;
    blade.receiveShadow = true;
    blade.name = 'blade';
    root.add(blade);

    // --- Guard / bolster ---
    const guardGeo = new THREE.BoxGeometry(0.1, 0.22, 0.09);
    guardGeo.translate(-0.1, 0.01, 0);
    const guard = new THREE.Mesh(guardGeo, makeMetal(0xc9a227, 0.28, 0.9));
    guard.name = 'guard';
    root.add(guard);

    // --- Tang / handle core ---
    const tangGeo = new THREE.BoxGeometry(0.55, 0.085, 0.045);
    tangGeo.translate(-0.42, 0.01, 0);
    const tang = new THREE.Mesh(tangGeo, makeMetal(0x2a2e36, 0.55, 0.4));
    tang.name = 'tang';
    root.add(tang);

    // --- Grip scales ---
    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x1a1410,
      roughness: 0.72,
      metalness: 0.05,
    });
    [-1, 1].forEach((side) => {
      const scale = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.1, 0.018),
        gripMat
      );
      scale.position.set(-0.42, 0.01, side * 0.032);
      scale.name = side > 0 ? 'gripFront' : 'gripBack';
      root.add(scale);
    });

    // Rivets
    const rivetMat = makeMetal(0xb8bcc4, 0.3, 0.95);
    [-0.55, -0.38, -0.22].forEach((x, i) => {
      const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 12), rivetMat);
      rivet.rotation.x = Math.PI / 2;
      rivet.position.set(x, 0.01, 0);
      rivet.name = `rivet${i}`;
      root.add(rivet);
    });

    // Pommel
    const pommel = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.12, 0.08),
      makeMetal(0xc9a227, 0.3, 0.9)
    );
    pommel.position.set(-0.72, 0.01, 0);
    pommel.name = 'pommel';
    root.add(pommel);

    // Center the group on blade mass
    root.rotation.z = -0.18;
    root.rotation.y = 0.35;
    root.position.set(0.05, 0, 0);
    root.scale.setScalar(1.15);

    root.userData.fadeMat = fadeMat;
    root.userData.baseYaw = 0.35;
    root.userData.tick = (t, userYaw) => {
      fadeMat.uniforms.uTime.value = t;
      root.rotation.y = root.userData.baseYaw + (userYaw || 0) + Math.sin(t * 0.35) * 0.12;
      root.position.y = Math.sin(t * 0.7) * 0.04;
    };

    return root;
  }

  function mountHeroKnife(container) {
    if (!global.THREE) {
      console.error('[hero-knife-3d] THREE is not loaded');
      return { dispose() {} };
    }
    if (!container) return { dispose() {} };

    const width = container.clientWidth || 480;
    const height = container.clientHeight || 520;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 40);
    camera.position.set(0.35, 0.55, 3.1);
    camera.lookAt(0, 0, 0);

    const hemi = new THREE.HemisphereLight(0xffe8d6, 0x1a1420, 1.1);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(2.2, 3.4, 2.8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff6a3d, 0.55);
    rim.position.set(-2.5, 0.8, -1.5);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0x7aa7ff, 0.35);
    fill.position.set(-1.2, -0.5, 2.5);
    scene.add(fill);

    const knife = buildKnife();
    scene.add(knife);

    // Soft floor glow disc
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 48),
      new THREE.MeshBasicMaterial({
        color: 0xff4d2e,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.55;
    scene.add(glow);

    let raf = 0;
    let disposed = false;
    let dragging = false;
    let lastX = 0;
    let userYaw = 0;

    const onPointerDown = (e) => {
      dragging = true;
      lastX = e.clientX;
      renderer.domElement.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      userYaw += dx * 0.01;
    };
    const onPointerUp = (e) => {
      dragging = false;
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
      if (knife.userData.tick) knife.userData.tick(t, userYaw);
      if (!dragging) userYaw *= 0.985;
      glow.material.opacity = 0.1 + Math.sin(t * 1.2) * 0.03;
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = container.clientWidth || width;
      const h = container.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    if (ro) ro.observe(container);
    else window.addEventListener('resize', onResize);

    return {
      dispose() {
        disposed = true;
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
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else obj.material.dispose();
          }
        });
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      },
    };
  }

  global.mountHeroKnife = mountHeroKnife;
  global.buildHeroKnifeModel = buildKnife;
})(typeof window !== 'undefined' ? window : globalThis);
