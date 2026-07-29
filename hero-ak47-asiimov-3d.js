/**
 * AK-47 · Asiimov — img2threejs-style reconstruction:
 *   - column silhouette from reference (geo-outline.json)
 *   - extruded hard-surface body (real Z thickness)
 *   - de-lit front/back albedo planar projection (not a billboard)
 *
 * Assets: /assets/ak47-asiimov/{front,back}-delit.png, geo-outline.json
 * Requires global THREE from CDN.
 */
(function (global) {
  'use strict';

  const BASE = '/assets/ak47-asiimov';
  const WORLD_W = 3.2;
  const WORLD_H = 1.35;
  const THICK = 0.14;

  function loadJSON(url) {
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error('failed to load ' + url);
      return r.json();
    });
  }

  function loadTexture(url) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.needsUpdate = true;
          resolve(tex);
        },
        undefined,
        reject
      );
    });
  }

  /** Outline rows: [nx, yTop, yBot] image-space → Shape in world XY. */
  function buildSilhouetteShape(outline) {
    const shape = new THREE.Shape();
    if (!outline || outline.length < 4) {
      shape.moveTo(-1, -0.2);
      shape.lineTo(1, -0.2);
      shape.lineTo(1, 0.2);
      shape.lineTo(-1, 0.2);
      shape.closePath();
      return shape;
    }

    const toX = (nx) => (nx - 0.5) * WORLD_W;
    const toY = (imgY) => (0.5 - imgY) * WORLD_H; // image top → +Y

    // Top edge left → right
    shape.moveTo(toX(outline[0][0]), toY(outline[0][1]));
    for (let i = 1; i < outline.length; i += 1) {
      shape.lineTo(toX(outline[i][0]), toY(outline[i][1]));
    }
    // Bottom edge right → left
    for (let i = outline.length - 1; i >= 0; i -= 1) {
      shape.lineTo(toX(outline[i][0]), toY(outline[i][2]));
    }
    shape.closePath();
    return shape;
  }

  function assignPlanarUVs(geometry) {
    geometry.computeBoundingBox();
    const pos = geometry.attributes.position;
    const uvs = [];
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const u = x / WORLD_W + 0.5;
      const v = y / WORLD_H + 0.5; // Three.js v=0 bottom; our +Y is up → matches
      uvs.push(u, v);
    }
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
  }

  function makeProjectionMaterial(frontMap, backMap) {
    return new THREE.ShaderMaterial({
      uniforms: {
        frontMap: { value: frontMap },
        backMap: { value: backMap },
        uTime: { value: 0 },
        uThreshold: { value: 0.09 },
      },
      lights: false,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: true,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vWorldN;
        void main() {
          vUv = uv;
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldN = normalize(mat3(modelMatrix) * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D frontMap;
        uniform sampler2D backMap;
        uniform float uTime;
        uniform float uThreshold;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vWorldN;

        float luma(vec3 c) {
          return dot(c, vec3(0.299, 0.587, 0.114));
        }

        void main() {
          vec2 uv = clamp(vUv, vec2(0.001), vec2(0.999));
          vec4 front = texture2D(frontMap, uv);
          vec4 back = texture2D(backMap, vec2(1.0 - uv.x, uv.y));

          // World-facing blend: +Z → front reference, -Z → back reference
          float face = smoothstep(-0.15, 0.15, vWorldN.z);
          vec3 albedo = mix(back.rgb, front.rgb, face);
          float aFront = smoothstep(uThreshold, uThreshold + 0.08, luma(front.rgb));
          float aBack = smoothstep(uThreshold, uThreshold + 0.08, luma(back.rgb));
          float alpha = mix(aBack, aFront, face);

          // Edge rim (side faces of extrusion) — dark metal read
          float edge = 1.0 - abs(vWorldN.z);
          vec3 steel = vec3(0.18, 0.2, 0.24);
          albedo = mix(albedo, steel, smoothstep(0.55, 0.95, edge) * 0.85);
          alpha = max(alpha, smoothstep(0.7, 0.95, edge) * 0.95);

          if (alpha < 0.12) discard;

          vec3 N = normalize(vNormal);
          float ndl = max(dot(N, normalize(vec3(0.4, 0.85, 0.5))), 0.0);
          float rim = pow(1.0 - max(dot(N, vView), 0.0), 2.4);
          vec3 col = albedo * (0.42 + 0.58 * ndl);
          col += rim * mix(vec3(1.0, 0.45, 0.18), vec3(0.7), edge) * 0.18;
          col += 0.01 * sin(uTime * 1.3) * vec3(1.0, 0.4, 0.1);

          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
  }

  function addFurniture(root) {
    // Volumetric accents so orbit never collapses to a card.
    // These sit slightly proud of the projected slab and read as real parts.
    const black = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.5, metalness: 0.55 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.35, metalness: 0.8 });
    const orange = new THREE.MeshStandardMaterial({
      color: 0xff6a18,
      roughness: 0.4,
      metalness: 0.12,
      emissive: 0xff6a18,
      emissiveIntensity: 0.08,
    });

    // Barrel tube (extends beyond silhouette visually along +X)
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.026, 1.15, 16), black);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.85, 0.02, 0);
    barrel.castShadow = true;
    root.add(barrel);

    const gas = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.7, 14), steel);
    gas.rotation.z = Math.PI / 2;
    gas.position.set(0.35, 0.14, 0);
    root.add(gas);

    // Front sight post volume
    const fs = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), orange);
    fs.position.set(1.05, 0.14, 0);
    root.add(fs);

    // Muzzle brake
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.12, 12), black);
    muzzle.rotation.z = Math.PI / 2;
    muzzle.position.set(1.45, 0.02, 0);
    root.add(muzzle);

    // Mag thickness block (banana approx under receiver)
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.1), black);
    mag.position.set(-0.2, -0.35, 0);
    mag.rotation.z = -0.35;
    root.add(mag);

    // Grip volume
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.1), black);
    grip.position.set(-0.55, -0.28, 0);
    grip.rotation.z = 0.25;
    root.add(grip);
  }

  function buildFromAssets(outlineData, frontMap, backMap) {
    const root = new THREE.Group();
    root.name = 'AK47AsiimovProjected';

    const shape = buildSilhouetteShape(outlineData.outline);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: THICK,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.01,
      bevelSegments: 2,
      curveSegments: 1,
    });
    // Center Z
    geo.translate(0, 0, -THICK / 2);
    assignPlanarUVs(geo);

    const projMat = makeProjectionMaterial(frontMap, backMap);
    const body = new THREE.Mesh(geo, projMat);
    body.name = 'projectedBody';
    body.castShadow = true;
    body.receiveShadow = true;
    root.add(body);

    addFurniture(root);

    root.rotation.set(0.2, 0.55, -0.08);
    root.position.set(0, 0.05, 0);
    root.scale.setScalar(0.95);

    root.userData.projMat = projMat;
    root.userData.baseYaw = 0.55;
    root.userData.basePitch = 0.2;
    root.userData.tick = (t, userYaw, userPitch) => {
      projMat.uniforms.uTime.value = t;
      root.rotation.y = root.userData.baseYaw + (userYaw || 0) + Math.sin(t * 0.28) * 0.08;
      root.rotation.x = root.userData.basePitch + (userPitch || 0) + Math.sin(t * 0.4) * 0.02;
      root.position.y = 0.05 + Math.sin(t * 0.65) * 0.03;
    };

    return root;
  }

  function mountHeroAk47Asiimov(container) {
    if (!global.THREE) {
      console.error('[hero-ak47-asiimov-3d] THREE is not loaded');
      return { dispose() {} };
    }
    if (!container) return { dispose() {} };

    const width = container.clientWidth || 520;
    const height = container.clientHeight || 520;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;cursor:grab';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 60);
    camera.position.set(0.4, 0.55, 4.0);
    camera.lookAt(0, -0.05, 0);

    scene.add(new THREE.HemisphereLight(0xffe6d4, 0x0e1016, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.45);
    key.position.set(3.0, 4.0, 2.6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9bb7ff, 0.4);
    fill.position.set(-2.4, 0.6, 2.0);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xff6a18, 0.75);
    rim.position.set(-2.6, 1.6, -2.2);
    scene.add(rim);

    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(1.55, 64),
      new THREE.MeshBasicMaterial({ color: 0xff6a18, transparent: true, opacity: 0.12, depthWrite: false })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.9;
    scene.add(glow);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 48),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.89;
    scene.add(shadow);

    let model = null;
    let textures = [];
    let raf = 0;
    let disposed = false;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let userYaw = 0;
    let userPitch = 0;

    // Loading indicator (simple)
    const loading = document.createElement('div');
    loading.textContent = 'Building Asiimov projection…';
    loading.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;color:#ff6a18;font:12px ui-monospace,monospace;letter-spacing:0.12em;pointer-events:none;';
    container.style.position = container.style.position || 'relative';
    container.appendChild(loading);

    Promise.all([
      loadJSON(BASE + '/geo-outline.json'),
      loadTexture(BASE + '/front-delit.png'),
      loadTexture(BASE + '/back-delit.png'),
    ]).then(([outline, front, back]) => {
      if (disposed) {
        front.dispose();
        back.dispose();
        return;
      }
      textures.push(front, back);
      model = buildFromAssets(outline, front, back);
      scene.add(model);
      if (loading.parentNode) loading.parentNode.removeChild(loading);
    }).catch((err) => {
      console.error('[hero-ak47-asiimov-3d] projection build failed', err);
      if (loading.parentNode) {
        loading.textContent = 'Failed to load Asiimov assets';
        loading.style.color = '#f87171';
      }
    });

    const onPointerDown = (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.style.cursor = 'grabbing';
      renderer.domElement.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e) => {
      if (!dragging) return;
      userYaw += (e.clientX - lastX) * 0.009;
      userPitch += (e.clientY - lastY) * 0.006;
      userPitch = Math.max(-0.6, Math.min(0.6, userPitch));
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
      if (model && model.userData.tick) model.userData.tick(t, userYaw, userPitch);
      if (!dragging) {
        userYaw *= 0.988;
        userPitch *= 0.988;
      }
      glow.material.opacity = 0.1 + Math.sin(t * 1.1) * 0.03;
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
        if (loading.parentNode) loading.parentNode.removeChild(loading);
        scene.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else obj.material.dispose();
          }
        });
        textures.forEach((t) => t.dispose());
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      },
    };
  }

  global.mountHeroAk47Asiimov = mountHeroAk47Asiimov;
})(typeof window !== 'undefined' ? window : globalThis);
