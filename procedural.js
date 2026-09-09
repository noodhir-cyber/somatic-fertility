import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/*  Maths helpers                                                      */
/* ------------------------------------------------------------------ */

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const range = (t, a, b) => clamp((t - a) / (b - a));
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/** Deterministic PRNG so every visitor sees the same arrangement. */
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function randomUnit(rand, out = new THREE.Vector3()) {
  const z = rand() * 2 - 1, a = rand() * Math.PI * 2, r = Math.sqrt(1 - z * z);
  return out.set(r * Math.cos(a), z, r * Math.sin(a));
}
/** Cheap organic noise in [-1, 1]. */
export function fbm(x, y, z) {
  return (
    Math.sin(x * 1.7 + Math.sin(y * 1.3 + z * 0.7)) * 0.5 +
    Math.sin(y * 2.1 + Math.sin(z * 1.9 + x * 0.5)) * 0.3 +
    Math.sin(z * 1.4 + Math.sin(x * 2.2 + y * 0.9)) * 0.2
  );
}

/* ------------------------------------------------------------------ */
/*  Time-driven materials registry                                    */
/* ------------------------------------------------------------------ */

/** Every material with a uTime uniform registers here; main loop ticks them. */
export const animated = new Set();
export function tickMaterials(time) {
  for (const m of animated) m.uniforms.uTime.value = time;
}

/* ------------------------------------------------------------------ */
/*  Fresnel "cell" material                                            */
/* ------------------------------------------------------------------ */

const fresnelVert = /* glsl */ `
  varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vDepth;
  void main() {
    vec4 pos = vec4(position, 1.0);
    vec3 nrm = normal;
    #ifdef USE_INSTANCING
      pos = instanceMatrix * pos;
      nrm = mat3(instanceMatrix) * nrm;
    #endif
    vec4 mv = modelViewMatrix * pos;
    vN = normalize(normalMatrix * nrm);
    vV = normalize(-mv.xyz);
    vP = position;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const fresnelFrag = /* glsl */ `
  uniform vec3 uColor; uniform vec3 uRim;
  uniform float uPower, uOpacity, uRimOpacity, uGlow, uTime, uNoise, uFade;
  uniform float fogNear, fogFar;
  varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vDepth;
  float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  void main() {
    float f = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), uPower);
    float n = uNoise > 0.0 ? (noise(vP * 3.0 + uTime * 0.15) - 0.5) * uNoise : 0.0;
    vec3 col = mix(uColor, uRim, f) * (1.0 + uGlow + n);
    float a = clamp(mix(uOpacity, uRimOpacity, f) + n * 0.5, 0.0, 1.0) * uFade;
    // Fade out with distance instead of tinting, so far-away shells vanish cleanly.
    a *= 1.0 - smoothstep(fogNear, fogFar, vDepth);
    gl_FragColor = vec4(col, a);
  }`;

export function fresnelMaterial(opts = {}) {
  const {
    color = '#ffc7d4', rim = '#ffffff', power = 2.5, opacity = 0.18, rimOpacity = 0.85,
    glow = 0, noise = 0, side = THREE.FrontSide, blending = THREE.NormalBlending, depthWrite = false,
  } = opts;
  const mat = new THREE.ShaderMaterial({
    vertexShader: fresnelVert,
    fragmentShader: fresnelFrag,
    transparent: true,
    depthWrite,
    side,
    blending,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uRim: { value: new THREE.Color(rim) },
      uPower: { value: power },
      uOpacity: { value: opacity },
      uRimOpacity: { value: rimOpacity },
      uGlow: { value: glow },
      uTime: { value: 0 },
      uNoise: { value: noise },
      uFade: { value: 1 },
      fogNear: { value: 16 },
      fogFar: { value: 38 },
    },
  });
  animated.add(mat);
  return mat;
}

/* ------------------------------------------------------------------ */
/*  Particles                                                          */
/* ------------------------------------------------------------------ */

const particleVert = /* glsl */ `
  attribute float aSize; attribute float aPhase; attribute vec3 aColor;
  uniform float uTime, uPixelRatio, uRise, uNear, uFar, uScale;
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y += sin(uTime * 0.3 + aPhase) * 0.4;
    p.x += cos(uTime * 0.2 + aPhase * 1.7) * 0.3;
    if (uRise > 0.0) { p.y += mod(uTime * uRise + aPhase * 3.0, 4.0) - 2.0; }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = max(0.001, -mv.z);
    gl_PointSize = aSize * uScale * uPixelRatio * 60.0 / dist;
    vAlpha = smoothstep(uFar, uNear, dist) * (0.55 + 0.45 * sin(uTime * 0.8 + aPhase * 3.0));
    if (uRise > 0.0) { vAlpha *= 1.0 - abs(p.y - position.y) / 2.0; }
    vColor = aColor;
  }`;

const particleFrag = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor; varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d); a *= a;
    gl_FragColor = vec4(vColor, a * vAlpha * uOpacity);
  }`;

export function createParticles(opts = {}) {
  const {
    count = 1500, box = [60, 40, 340], center = [0, 0, -150],
    colors = ['#f7b1c4', '#a8e6dc', '#f5d59a', '#ffffff'],
    rise = 0, near = 18, far = 60, scale = 1, seed = 1,
  } = opts;
  const rand = mulberry(seed);
  const pos = new Float32Array(count * 3), size = new Float32Array(count), phase = new Float32Array(count), col = new Float32Array(count * 3);
  const palette = colors.map((c) => new THREE.Color(c));
  for (let i = 0; i < count; i++) {
    pos[i * 3] = center[0] + (rand() - 0.5) * box[0];
    pos[i * 3 + 1] = center[1] + (rand() - 0.5) * box[1];
    pos[i * 3 + 2] = center[2] + (rand() - 0.5) * box[2];
    size[i] = 0.4 + Math.pow(rand(), 2.5) * 1.6;
    phase[i] = rand() * Math.PI * 2;
    const c = palette[Math.floor(rand() * palette.length)];
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    vertexShader: particleVert, fragmentShader: particleFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uRise: { value: rise }, uNear: { value: near }, uFar: { value: far }, uScale: { value: scale }, uOpacity: { value: 1 },
    },
  });
  animated.add(mat);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}

/* ------------------------------------------------------------------ */
/*  Ultrasound scan plane                                              */
/* ------------------------------------------------------------------ */

const scanFrag = /* glsl */ `
  uniform float uTime, uOpacity; uniform vec3 uColor;
  varying vec2 vUv;
  float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 p = vUv - vec2(0.5, 1.0);
    float r = length(p);
    float ang = atan(p.x, -p.y);
    float sector = smoothstep(0.66, 0.6, abs(ang)) * smoothstep(0.06, 0.12, r) * smoothstep(0.98, 0.88, r);
    float speck = hash21(floor(vec2(ang * 160.0, r * 180.0)) + floor(uTime * 6.0));
    speck = pow(speck, 5.0);
    float sweep = exp(-pow((ang - sin(uTime * 0.8) * 0.58) * 10.0, 2.0));
    float lines = 0.5 + 0.5 * sin(r * 160.0 - uTime * 5.0);
    float v = sector * (0.18 + speck * 0.7 + sweep * 1.1 + lines * 0.06);
    gl_FragColor = vec4(uColor * v, v * uOpacity);
  }`;

export function createScanPlane(w = 7, h = 5) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: scanFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#9fe8ff') } },
  });
  animated.add(mat);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

/* ------------------------------------------------------------------ */
/*  Model helpers                                                      */
/* ------------------------------------------------------------------ */

/** Centres a loaded model and scales its largest dimension to `size`. */
export function fitModel(object, { size = 2 } = {}) {
  const box = new THREE.Box3().setFromObject(object);
  const s = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const scale = size / Math.max(s.x, s.y, s.z);
  const inner = new THREE.Group();
  object.position.sub(c);
  inner.add(object);
  inner.scale.setScalar(scale);
  const wrap = new THREE.Group();
  wrap.add(inner);
  wrap.userData.fitScale = scale;
  wrap.userData.inner = inner;
  return wrap;
}

export function setMaterial(object, fn) {
  object.traverse((o) => { if (o.isMesh) { const m = fn(o.material, o); if (m) o.material = m; } });
}

/* ------------------------------------------------------------------ */
/*  Egg (oocyte)                                                       */
/* ------------------------------------------------------------------ */

export function createZona(R, opts = {}) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(R, 64, 48),
    fresnelMaterial({ color: '#ffe9ef', rim: '#ffffff', power: 3.2, opacity: 0.05, rimOpacity: 0.75, noise: 0.35, ...opts }),
  );
}

export function createEgg(R = 1.5) {
  const group = new THREE.Group();
  const zona = createZona(R * 1.16);
  const cyto = new THREE.Mesh(
    new THREE.SphereGeometry(R, 64, 48),
    fresnelMaterial({ color: '#ffb3c6', rim: '#fff0f4', power: 2.2, opacity: 0.34, rimOpacity: 0.95, noise: 0.5 }),
  );
  const nucleusMat = new THREE.MeshStandardMaterial({ color: '#ffd2dc', emissive: '#ff8fa8', emissiveIntensity: 1.3, roughness: 0.6, transparent: true, opacity: 0.85 });
  const nucleus = new THREE.Mesh(new THREE.SphereGeometry(R * 0.28, 32, 24), nucleusMat);
  nucleus.position.set(R * 0.25, R * 0.2, R * 0.1);

  const N = 700; const pos = new Float32Array(N * 3); const rand = mulberry(7); const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) { randomUnit(rand, v).multiplyScalar(R * 0.92 * Math.cbrt(rand())); pos.set([v.x, v.y, v.z], i * 3); }
  const granules = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
    new THREE.PointsMaterial({ color: '#ffd9e2', size: 0.03, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  group.add(zona, cyto, nucleus, granules);
  return { group, zona, cyto, nucleus, granules, R };
}

/* ------------------------------------------------------------------ */
/*  Embryo: cleavage → morula → blastocyst                             */
/* ------------------------------------------------------------------ */

function buildDivisions(R, rand) {
  const stages = [[new THREE.Vector3()]];
  const dir = new THREE.Vector3(), d = new THREE.Vector3();
  for (let s = 1; s <= 4; s++) {
    const n = 2 ** s;
    const r = R * Math.cbrt(1 / n) * 0.98;
    const prev = stages[s - 1];
    const pts = [];
    for (const p of prev) {
      randomUnit(rand, dir);
      pts.push(p.clone().addScaledVector(dir, r * 0.9), p.clone().addScaledVector(dir, -r * 0.9));
    }
    for (let it = 0; it < 80; it++) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          d.subVectors(pts[j], pts[i]);
          const len = d.length() || 0.001, min = 2 * r * 0.93;
          if (len < min) { d.multiplyScalar(((min - len) / len) * 0.5); pts[j].add(d); pts[i].sub(d); }
        }
        const lim = R - r * 0.98, l = pts[i].length();
        if (l > lim) pts[i].multiplyScalar(lim / l);
      }
    }
    stages.push(pts);
  }
  return stages;
}

export function createEmbryo(R = 1.4) {
  const group = new THREE.Group();
  const rand = mulberry(3);
  const stages = buildDivisions(R, rand);
  const radii = stages.map((s) => R * Math.cbrt(1 / s.length) * 0.98);

  const zona = createZona(R * 1.18);
  const cellGeo = new THREE.SphereGeometry(1, 40, 30);
  const cellMat = fresnelMaterial({ color: '#ff9fb9', rim: '#fff3f6', power: 2.2, opacity: 0.22, rimOpacity: 0.62, noise: 0.3 });
  const nucMat = new THREE.MeshStandardMaterial({ color: '#ffd6df', emissive: '#ff6f92', emissiveIntensity: 0.7, transparent: true, opacity: 0.75, roughness: 0.5 });

  const cells = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(cellGeo, cellMat);
    const n = new THREE.Mesh(cellGeo, nucMat); n.scale.setScalar(0.32); m.add(n);
    group.add(m); cells.push(m);
  }

  // Trophectoderm: the outer shell of the blastocyst.
  const TN = 150;
  const troph = new THREE.InstancedMesh(cellGeo, fresnelMaterial({ color: '#ffb3c6', rim: '#fff3f6', power: 2.2, opacity: 0.12, rimOpacity: 0.4 }), TN);
  const trophDirs = [];
  for (let i = 0; i < TN; i++) {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / TN), th = Math.PI * (1 + Math.sqrt(5)) * i;
    trophDirs.push(new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)));
  }
  const cavity = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), fresnelMaterial({ color: '#bfe9ff', rim: '#ffffff', power: 2.5, opacity: 0.1, rimOpacity: 0.3 }));
  group.add(zona, troph, cavity);

  const icm = stages[4].map((p) => p.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, R * 0.48, 0)));
  const dummy = new THREE.Object3D();
  const tmp = new THREE.Vector3();

  /** s in [0, 5]: 0–4 cleavage stages (1,2,4,8,16 cells), 4–5 blastocyst formation. */
  function set(s) {
    s = clamp(s, 0, 5);
    if (s < 4) {
      const k = Math.floor(s), fr = s - k;
      const e = smoothstep(0.3, 0.85, fr);
      const nTo = 2 ** (k + 1);
      for (let j = 0; j < 16; j++) {
        const m = cells[j];
        if (j >= nTo) { m.visible = false; continue; }
        m.visible = true;
        const parent = stages[k][Math.floor(j / 2)];
        m.position.lerpVectors(parent, stages[k + 1][j], e);
        m.scale.setScalar(lerp(radii[k], radii[k + 1], e));
      }
      troph.count = 0; cavity.visible = false;
    } else {
      const e = smoothstep(0.05, 0.95, s - 4);
      for (let j = 0; j < 16; j++) {
        const m = cells[j]; m.visible = true;
        m.position.lerpVectors(stages[4][j], icm[j], e);
        m.scale.setScalar(lerp(radii[4], radii[4] * 0.72, e));
      }
      troph.count = TN; cavity.visible = true;
      const rr = R * 0.9;
      for (let i = 0; i < TN; i++) {
        tmp.copy(trophDirs[i]).multiplyScalar(rr);
        dummy.position.copy(tmp);
        dummy.lookAt(0, 0, 0);
        dummy.scale.set(R * 0.15 * e, R * 0.15 * e, R * 0.09 * e + 0.0001);
        dummy.updateMatrix();
        troph.setMatrixAt(i, dummy.matrix);
      }
      troph.instanceMatrix.needsUpdate = true;
      cavity.scale.setScalar(R * 0.78 * e + 0.001);
    }
  }
  set(0);
  return { group, set, zona, cellMat, R };
}

/* ------------------------------------------------------------------ */
/*  Ovary with follicles                                               */
/* ------------------------------------------------------------------ */

export function createOvary({ follicles = 9 } = {}) {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(1, 128, 96);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm(v.x * 2.3, v.y * 2.3, v.z * 2.3);
    v.multiplyScalar(1 + n * 0.08);
    p.setXYZ(i, v.x * 1.3, v.y * 0.92, v.z * 0.85);
  }
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
    color: '#c9737f', roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.45,
    sheen: 0.6, sheenColor: new THREE.Color('#ffb4c0'), sheenRoughness: 0.7,
  }));
  group.add(body);

  const rand = mulberry(21);
  const follGeo = new THREE.SphereGeometry(1, 40, 30);
  const follMat = fresnelMaterial({ color: '#d8ecff', rim: '#ffffff', power: 2.2, opacity: 0.3, rimOpacity: 0.9 });
  const eggMat = new THREE.MeshStandardMaterial({ color: '#ffe6c2', emissive: '#ffb864', emissiveIntensity: 1.8, roughness: 0.5 });
  const list = [];
  const d = new THREE.Vector3();
  let guard = 0;
  while (list.length < follicles && guard++ < 400) {
    randomUnit(rand, d);
    d.z = Math.abs(d.z) * 0.8 + 0.45; d.normalize();
    if (list.some((f) => f.dir.angleTo(d) < 0.55)) continue;
    const node = new THREE.Group();
    node.position.set(d.x * 1.3, d.y * 0.92, d.z * 0.85).multiplyScalar(0.94);
    const shell = new THREE.Mesh(follGeo, follMat);
    const egg = new THREE.Mesh(follGeo, eggMat); egg.scale.setScalar(0.22);
    node.add(shell, egg);
    group.add(node);
    list.push({ node, shell, egg, dir: d.clone(), maxR: 0.24 + rand() * 0.16 });
  }
  return { group, body, follicles: list };
}

/* ------------------------------------------------------------------ */
/*  Instruments                                                        */
/* ------------------------------------------------------------------ */

/** Needle with its tip at the local origin, body trailing along -z. Use lookAt(target). */
export function createNeedle({ length = 6, radius = 0.035, color = '#aeb8c2' } = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: 0.38, envMapIntensity: 0.6 });
  const h = radius * 7;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(radius, h, 24), mat);
  tip.rotation.x = Math.PI / 2; tip.position.z = -h / 2;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 24, 1), mat);
  shaft.rotation.x = Math.PI / 2; shaft.position.z = -h - length / 2;
  g.add(tip, shaft);
  return g;
}

/** Glass pipette, tip at origin, trailing along -z. */
export function createPipette({ length = 6, radius = 0.1, opacity = 0.45, flare = 1.6 } = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#3f6f84', roughness: 0.3, metalness: 0, transparent: true, opacity,
    clearcoat: 0.25, clearcoatRoughness: 0.3, envMapIntensity: 0.15,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const taper = new THREE.Mesh(new THREE.CylinderGeometry(radius * flare, radius, length * 0.45, 32, 1, true), mat);
  taper.rotation.x = -Math.PI / 2; taper.position.z = -length * 0.225;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(radius * flare, radius * flare, length * 0.55, 32, 1, true), mat);
  tube.rotation.x = -Math.PI / 2; tube.position.z = -length * 0.45 - length * 0.275;
  g.add(taper, tube);
  return g;
}

/* ------------------------------------------------------------------ */
/*  DNA                                                                */
/* ------------------------------------------------------------------ */

export function createDNA({ pairs = 30, radius = 1.0, rise = 0.34 } = {}) {
  const g = new THREE.Group();
  const sphereGeo = new THREE.SphereGeometry(0.15, 20, 14);
  const matA = new THREE.MeshStandardMaterial({ color: '#f7a8bd', emissive: '#ff6f91', emissiveIntensity: 0.35, roughness: 0.4 });
  const matB = new THREE.MeshStandardMaterial({ color: '#9be3d8', emissive: '#3fc9b5', emissiveIntensity: 0.35, roughness: 0.4 });
  const a = new THREE.InstancedMesh(sphereGeo, matA, pairs);
  const b = new THREE.InstancedMesh(sphereGeo, matB, pairs);
  const rungGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 10, 1);
  const rungMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#c9c2ff', emissiveIntensity: 0.2, roughness: 0.5, transparent: true, opacity: 0.75 });
  const rungs = new THREE.InstancedMesh(rungGeo, rungMat, pairs);
  const d = new THREE.Object3D(), pa = new THREE.Vector3(), pb = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  for (let i = 0; i < pairs; i++) {
    const y = (i - pairs / 2) * rise, ang = i * 0.62;
    pa.set(Math.cos(ang) * radius, y, Math.sin(ang) * radius);
    pb.set(-pa.x, y, -pa.z);
    d.position.copy(pa); d.quaternion.identity(); d.scale.setScalar(1); d.updateMatrix(); a.setMatrixAt(i, d.matrix);
    d.position.copy(pb); d.updateMatrix(); b.setMatrixAt(i, d.matrix);
    d.position.lerpVectors(pa, pb, 0.5);
    dir.subVectors(pb, pa).normalize();
    d.quaternion.setFromUnitVectors(up, dir);
    d.scale.set(1, pa.distanceTo(pb), 1);
    d.updateMatrix(); rungs.setMatrixAt(i, d.matrix);
  }
  g.add(a, b, rungs);
  return g;
}

/* ------------------------------------------------------------------ */
/*  Soft halo (radial gradient plane)                                  */
/* ------------------------------------------------------------------ */

export function createHalo(color = '#ffd9cf', inner = 0.9) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  const col = new THREE.Color(color);
  const rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
  grad.addColorStop(0, `rgba(${rgb},${inner})`);
  grad.addColorStop(0.45, `rgba(${rgb},${inner * 0.35})`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
}
