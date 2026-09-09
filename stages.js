import * as THREE from 'three';
import {
  clamp, lerp, range, smoothstep, easeInOut, mulberry,
  fresnelMaterial, createParticles, createScanPlane, fitModel, setMaterial,
  createEgg, createEmbryo, createOvary, createNeedle, createPipette, createDNA, createHalo,
} from './procedural.js';

/*
  Each stage returns:
    { name, group, lights: [{ pos, color, intensity, distance }], update(ctx) }
  ctx = { phase, t, time, dt }
    phase : which of the stage's chapters is active (0-based)
    t     : 0..1 through that chapter (0 before the stage, 1 after)
  Most beats finish by t≈0.7 because the camera starts flying to the next
  chapter at t=0.6 — the last stretch is for the fly-through.
*/
const T = (t) => clamp(t / 0.7);
const _w = new THREE.Vector3(); // scratch (world-space) vector for lookAt calls

/* ------------------------------------------------------------------ */
/*  0 · Hero: DNA                                                      */
/* ------------------------------------------------------------------ */
export function createDnaStage() {
  const group = new THREE.Group();
  const dna = createDNA({ pairs: 30, radius: 1.0, rise: 0.34 });
  dna.rotation.z = 0.32;
  dna.position.set(4.2, 0, -1);
  group.add(dna);

  const rand = mulberry(5);
  const cellMat = fresnelMaterial({ color: '#ffd1dc', rim: '#ffffff', power: 2.6, opacity: 0.07, rimOpacity: 0.55, noise: 0.25 });
  const cells = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.35 + rand() * 0.8, 40, 30), cellMat);
    m.position.set((rand() - 0.5) * 16, (rand() - 0.5) * 9, -3 - rand() * 9);
    m.userData.phase = rand() * 6.28;
    cells.add(m);
  }
  group.add(cells);

  return {
    name: 'dna', group,
    lights: [
      { pos: [4, 3, 4], color: '#ff9db4', intensity: 90, distance: 30 },
      { pos: [-5, -2, 3], color: '#7fe0d0', intensity: 70, distance: 30 },
    ],
    update({ t, time }) {
      dna.rotation.y = time * 0.25 + t * 5;
      dna.position.y = Math.sin(time * 0.5) * 0.15;
      dna.position.x = 4.2 - t * 3;
      for (const c of cells.children) c.position.y += Math.sin(time * 0.4 + c.userData.phase) * 0.0025;
    },
  };
}

/* ------------------------------------------------------------------ */
/*  1 · Stimulation: syringe                                           */
/* ------------------------------------------------------------------ */
export function createSyringeStage(assets, ui, chapterIndex) {
  const group = new THREE.Group();
  const model = assets.syringe.scene;
  let liquid = null;
  setMaterial(model, (m, mesh) => {
    const n = (mesh.name || '').toLowerCase();
    if (n.includes('glass')) {
      m.transparent = true; m.opacity = 0.32; m.depthWrite = false; m.roughness = 0.05; m.metalness = 0; m.color.set('#dff5ff');
    } else if (n.includes('liquid')) {
      liquid = mesh;
      return new THREE.MeshPhysicalMaterial({ color: '#bfeeff', emissive: '#3cc8ee', emissiveIntensity: 0.9, roughness: 0.15, transparent: true, opacity: 0.92, clippingPlanes: [] });
    } else {
      m.envMapIntensity = 1.4; m.roughness = Math.min(m.roughness, 0.28);
    }
  });
  const fitted = fitModel(model, { size: 5.8 });
  group.add(fitted);

  // Anchors in raw model space: needle tip at -x end, axis reference at origin.
  const tipAnchor = new THREE.Object3D(); tipAnchor.position.set(-0.107, 0, 0);
  const axisAnchor = new THREE.Object3D();
  model.add(tipAnchor, axisAnchor);

  // Liquid drains via a clipping plane that moves along the barrel.
  const localPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.16);
  const worldPlane = new THREE.Plane();
  if (liquid) liquid.material.clippingPlanes = [worldPlane];

  // Hormone droplets leaving the needle.
  const DN = 36;
  const drops = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.045, 12, 10),
    new THREE.MeshStandardMaterial({ color: '#bff3ff', emissive: '#66e0ff', emissiveIntensity: 1.6, roughness: 0.3 }),
    DN,
  );
  drops.frustumCulled = false;
  group.add(drops);
  const rand = mulberry(9);
  const dropSeed = Array.from({ length: DN }, () => [rand(), rand() - 0.5, rand() - 0.5]);
  const dummy = new THREE.Object3D();
  const tipW = new THREE.Vector3(), axisW = new THREE.Vector3(), dir = new THREE.Vector3(), tipL = new THREE.Vector3();

  ui.addLabel({ title: 'FSH · follicle-stimulating hormone', sub: 'a fine 29-gauge needle', anchor: tipAnchor, offset: new THREE.Vector3(-0.2, 1.1, 0), chapter: chapterIndex, show: [0.28, 0.6] });

  return {
    name: 'syringe', group,
    lights: [
      { pos: [3, 3, 4], color: '#ffd7e0', intensity: 110, distance: 30 },
      { pos: [-4, -1, 3], color: '#7fe0ff', intensity: 70, distance: 30 },
    ],
    update({ t, time }) {
      const ts = T(t);
      const a = smoothstep(0, 0.28, ts);
      fitted.position.set(lerp(5.5, 1.9, easeInOut(a)), lerp(-0.8, -0.1, a) + Math.sin(time * 0.7) * 0.05, 0);
      fitted.rotation.set(0.15 + Math.sin(time * 0.4) * 0.03, lerp(0.9, 0.35, a), lerp(-1.1, -0.42, a));

      const inj = smoothstep(0.32, 0.7, ts);
      localPlane.constant = lerp(0.16, -0.035, inj);
      if (liquid) {
        liquid.updateWorldMatrix(true, false);
        worldPlane.copy(localPlane).applyMatrix4(liquid.matrixWorld);
      }

      // Droplets: emitted while injecting, streaming out along the needle.
      tipAnchor.getWorldPosition(tipW); axisAnchor.getWorldPosition(axisW);
      dir.subVectors(tipW, axisW).normalize();
      group.worldToLocal(tipL.copy(tipW));
      const active = inj > 0.01 && inj < 0.99 ? 1 : 0;
      for (let i = 0; i < DN; i++) {
        const life = (time * 0.45 + dropSeed[i][0]) % 1;
        const s = active * Math.sin(life * Math.PI) * 0.9;
        dummy.position.copy(tipL)
          .addScaledVector(dir, life * 2.4)
          .add(new THREE.Vector3(dropSeed[i][1] * life * 0.8, -life * life * 1.2 + dropSeed[i][2] * life * 0.6, dropSeed[i][2] * life * 0.6));
        dummy.scale.setScalar(Math.max(0.0001, s));
        dummy.updateMatrix();
        drops.setMatrixAt(i, dummy.matrix);
      }
      drops.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ------------------------------------------------------------------ */
/*  2+3 · Ovary: monitoring, then egg collection                       */
/* ------------------------------------------------------------------ */
export function createOvaryStage(ui, chapterIndices) {
  const group = new THREE.Group();
  const ovary = createOvary({ follicles: 9 });
  ovary.group.rotation.y = -0.35;
  group.add(ovary.group);

  const scan = createScanPlane(5.2, 3.8);
  scan.position.set(0.2, 0.9, -1.6);
  group.add(scan);

  const needle = createNeedle({ length: 7, radius: 0.055 });
  needle.visible = false;
  group.add(needle);

  // Retrieval order: the four follicles on the camera / needle side, left to right.
  ovary.group.updateMatrixWorld(true);
  const worldOf = (f) => ovary.group.localToWorld(f.node.position.clone());
  const facing = (f) => { const p = worldOf(f); return p.z + 0.7 * p.x; };
  const order = [...ovary.follicles].sort((a, b) => facing(b) - facing(a)).slice(0, 4).sort((a, b) => worldOf(a).x - worldOf(b).x);
  const origin = new THREE.Vector3(5.4, -2.2, 1.6);
  const target = new THREE.Vector3(), tipPos = new THREE.Vector3(), eggPos = new THREE.Vector3();
  const needleAnchor = new THREE.Object3D(); needleAnchor.position.set(0, 0, -2.2); needle.add(needleAnchor);

  ui.addLabel({ title: 'Follicle · 18 mm', sub: 'fluid-filled sac holding one egg', anchor: order[1].node, offset: new THREE.Vector3(0.5, 0.8, 0), chapter: chapterIndices[0], show: [0.35, 0.62] });
  ui.addLabel({ title: 'Aspiration needle', sub: 'guided by ultrasound', anchor: needleAnchor, offset: new THREE.Vector3(0.9, -0.6, 0), chapter: chapterIndices[1], show: [0.08, 0.6] });

  return {
    name: 'ovary', group,
    lights: [
      { pos: [3, 3, 4], color: '#ffd0d8', intensity: 120, distance: 30 },
      { pos: [-4, 1, 3], color: '#8fe3ff', intensity: 70, distance: 30 },
    ],
    update({ phase, t, time }) {
      ovary.group.rotation.y = -0.35 + Math.sin(time * 0.2) * 0.05;
      ovary.group.position.y = Math.sin(time * 0.5) * 0.05;
      scan.lookAt(group.localToWorld(_w.set(scan.position.x, scan.position.y, 50)));

      if (phase === 0) {
        const ts = T(t);
        ovary.follicles.forEach((f, i) => {
          const g = smoothstep(0, 1, ts * 1.15 - i * 0.025);
          f.node.scale.setScalar(f.maxR * lerp(0.35, 1, g));
          f.egg.visible = true; f.egg.position.set(0, 0, 0); f.egg.scale.setScalar(0.22);
          f.shell.scale.setScalar(1);
        });
        scan.material.uniforms.uOpacity.value = smoothstep(0.08, 0.3, ts) * (1 - smoothstep(0.62, 0.72, t)) * 0.35;
        needle.visible = false;
        return;
      }

      // Phase 1: retrieval
      scan.material.uniforms.uOpacity.value = 0;
      needle.visible = true;
      const ts = T(t);
      ovary.follicles.forEach((f) => { f.node.scale.setScalar(f.maxR); f.shell.scale.setScalar(1); });

      let current = -1, u = 0;
      order.forEach((f, k) => {
        const start = 0.04 + k * 0.23;
        const w = range(ts, start, start + 0.21);
        if (w > 0 && w < 1) { current = k; u = w; }
        if (w >= 1) { f.egg.visible = false; f.shell.scale.setScalar(0.4); }
        else if (w <= 0) { f.egg.visible = true; f.egg.position.set(0, 0, 0); f.egg.scale.setScalar(0.22); }
      });

      const k = current >= 0 ? current : (ts < 0.04 ? 0 : 3);
      const f = order[k];
      target.copy(f.node.position); ovary.group.localToWorld(target); group.worldToLocal(target);
      const dist = origin.distanceTo(target);
      const dirIn = target.clone().sub(origin).normalize();

      let along = dist - 1.4; // resting just outside the follicle
      if (current >= 0) {
        if (u < 0.35) along = lerp(dist - 1.4, dist, easeInOut(u / 0.35));
        else if (u < 0.75) along = dist;
        else along = lerp(dist, dist - 1.4, easeInOut((u - 0.75) / 0.25));
        const asp = range(u, 0.35, 0.75);
        f.shell.scale.setScalar(lerp(1, 0.4, asp));
        eggPos.copy(dirIn).multiplyScalar(-asp * 3.0 / f.node.scale.x);
        f.egg.position.copy(eggPos);
        f.egg.scale.setScalar(0.22 * (1 - smoothstep(0.55, 1, asp)));
        f.egg.visible = true;
      }
      tipPos.copy(origin).addScaledVector(dirIn, along);
      needle.position.copy(tipPos);
      needle.lookAt(group.localToWorld(_w.copy(target).add(dirIn)));
    },
  };
}

/* ------------------------------------------------------------------ */
/*  4 · Fertilisation: ICSI                                            */
/* ------------------------------------------------------------------ */
export function createEggStage(assets, ui, chapterIndex) {
  const group = new THREE.Group();
  const R = 1.5;
  const egg = createEgg(R);
  group.add(egg.group);

  const hold = createPipette({ length: 7, radius: 0.5, opacity: 0.38, flare: 1.2 });
  hold.rotation.y = Math.PI / 2;      // tip faces +x (the egg), body trails to -x
  hold.position.set(-R * 1.19, 0, 0);
  group.add(hold);

  const inj = createPipette({ length: 7, radius: 0.075, opacity: 0.62, flare: 2.6 });
  inj.rotation.y = -Math.PI / 2;      // tip faces -x, body trails to +x
  group.add(inj);

  // Sperm: rig so that lookAt() points the head.
  const rig = new THREE.Group();
  const sperm = fitModel(assets.sperm.scene, { size: 1.7 });
  sperm.rotation.y = Math.PI / 2;     // model runs along x; head at -x → rig +z (tweak if needed)
  const wiggle = { value: 1 };
  setMaterial(sperm, (m) => {
    m.metalness = 0; m.roughness = 0.45; m.emissive = new THREE.Color('#ffd9e8'); m.emissiveIntensity = 0.12;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uWiggle = wiggle;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWiggle;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float tail = clamp((0.03 + position.x) / 0.11, 0.0, 1.0);
          transformed.y += sin(tail * 16.0 - uTime * 13.0) * tail * tail * 0.012 * uWiggle;
          transformed.z += cos(tail * 12.0 - uTime * 10.0) * tail * tail * 0.006 * uWiggle;`);
      m.userData.shader = shader;
    };
    m.needsUpdate = true;
  });
  rig.add(sperm);
  group.add(rig);

  const pn = [new THREE.Vector3(-0.32, 0.12, 0.3), new THREE.Vector3(0.36, -0.1, 0.25)].map((p) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(R * 0.2, 28, 20), egg.nucleus.material);
    m.position.copy(p); m.scale.setScalar(0.0001); egg.group.add(m); return m;
  });

  const spermPos = new THREE.Vector3(), lookP = new THREE.Vector3(), swimA = new THREE.Vector3(), swimB = new THREE.Vector3();
  const swimAt = (th, out) => out.set(3.1 + 0.4 * Math.sin(th * 0.7), 1.0 * Math.sin(th), 0.7 * Math.cos(th * 1.3));

  const holdAnchor = new THREE.Object3D(); holdAnchor.position.set(-R * 1.19 - 1.6, 0, 0); group.add(holdAnchor);
  const eggAnchor = new THREE.Object3D(); group.add(eggAnchor);
  const injAnchor = new THREE.Object3D(); injAnchor.position.set(0, 0, -1.6); inj.add(injAnchor);
  ui.addLabel({ title: 'Holding pipette', sub: 'gentle suction steadies the egg', anchor: holdAnchor, offset: new THREE.Vector3(0, -1.2, 0), chapter: chapterIndex, show: [0.06, 0.5] });
  ui.addLabel({ title: 'Injection pipette', sub: '7 µm — thinner than a hair', anchor: injAnchor, offset: new THREE.Vector3(0, 1.0, 0), chapter: chapterIndex, show: [0.3, 0.5] });
  ui.addLabel({ title: 'Oocyte (egg)', sub: '0.1 mm — the largest human cell', anchor: eggAnchor, offset: new THREE.Vector3(-1.0, 2.05, 0), chapter: chapterIndex, show: [0.06, 0.5] });

  return {
    name: 'egg', group,
    lights: [
      { pos: [3, 2, 4], color: '#ffb7c7', intensity: 60, distance: 30 },
      { pos: [-3, -1, 3], color: '#9fe6ff', intensity: 40, distance: 30 },
    ],
    update({ t, time }) {
      const ts = T(t);
      const sh = sperm.children[0]?.children[0]?.material?.userData?.shader;
      setMaterial(sperm, (m) => { if (m.userData.shader) m.userData.shader.uniforms.uTime.value = time; });

      const breathe = 1 + Math.sin(time * 1.3) * 0.008;
      egg.group.scale.setScalar(breathe);

      // Injection pipette tip x position.
      const inA = smoothstep(0.42, 0.62, ts), outA = smoothstep(0.7, 0.86, ts);
      const tipX = lerp(lerp(2.1, 0.22, easeInOut(inA)), 3.8, easeInOut(outA));
      inj.position.set(tipX, 0.05, 0);

      // Sperm choreography
      const capture = smoothstep(0.28, 0.4, ts);
      const th = time * 1.4;
      swimAt(th, swimA); swimAt(th + 0.1, swimB);
      if (capture < 1) {
        spermPos.copy(swimA);
        lookP.copy(swimB);
      }
      const inside = new THREE.Vector3(tipX + 0.62, 0.05, 0);
      spermPos.lerp(inside, capture);
      lookP.lerp(new THREE.Vector3(tipX - 2, 0.05, 0), capture);
      const release = smoothstep(0.64, 0.72, ts);
      spermPos.lerp(new THREE.Vector3(0.15, 0.05, 0.1), release);
      rig.position.copy(spermPos);
      rig.lookAt(group.localToWorld(_w.copy(lookP)));
      wiggle.value = lerp(1, 0.25, capture);
      const dissolve = 1 - smoothstep(0.74, 0.86, ts);
      rig.scale.setScalar(Math.max(0.0001, dissolve));

      // Fertilisation glow and the two pronuclei.
      const fert = smoothstep(0.72, 0.9, ts);
      egg.cyto.material.uniforms.uGlow.value = fert * (0.35 + 0.25 * Math.sin(time * 2.5));
      egg.nucleus.scale.setScalar(Math.max(0.0001, 1 - fert));
      pn.forEach((m) => m.scale.setScalar(Math.max(0.0001, fert)));
      egg.group.rotation.y = Math.sin(time * 0.3) * 0.08;
    },
  };
}

/* ------------------------------------------------------------------ */
/*  5 · Embryo culture                                                 */
/* ------------------------------------------------------------------ */
export function createEmbryoStage(ui, chapterIndex) {
  const group = new THREE.Group();
  const R = 1.4;
  const embryo = createEmbryo(R);
  embryo.group.rotation.x = 0.25;
  group.add(embryo.group);

  const icmAnchor = new THREE.Object3D(); icmAnchor.position.set(0, R * 0.5, 0); embryo.group.add(icmAnchor);
  const trAnchor = new THREE.Object3D(); trAnchor.position.set(-R * 0.85, -R * 0.35, 0); embryo.group.add(trAnchor);
  ui.addLabel({ title: 'Inner cell mass', sub: 'becomes the baby', anchor: icmAnchor, offset: new THREE.Vector3(1.3, 0.9, 0), chapter: chapterIndex, show: [0.6, 0.72] });
  ui.addLabel({ title: 'Trophectoderm', sub: 'becomes the placenta', anchor: trAnchor, offset: new THREE.Vector3(-0.9, -0.7, 0), chapter: chapterIndex, show: [0.6, 0.72] });

  const DAY = ['Day 1 · Zygote — one cell', 'Day 2 · Two cells', 'Day 2–3 · Four cells', 'Day 3 · Eight cells', 'Day 4 · Morula — 16 cells', 'Day 5 · Blastocyst — 100+ cells'];

  return {
    name: 'embryo', group,
    lights: [
      { pos: [2, 2, 3], color: '#ffc6d2', intensity: 90, distance: 30 },
      { pos: [-3, -1, 2], color: '#a2e8ff', intensity: 60, distance: 30 },
    ],
    update({ t, time }) {
      const s = clamp(t / 0.72) * 5;
      embryo.set(s);
      embryo.group.rotation.y = time * 0.15;
      ui.setText('embryoDay', DAY[Math.min(5, Math.floor(s + 0.3))]);
    },
  };
}

/* ------------------------------------------------------------------ */
/*  6+7 · Uterus: transfer, then implantation                          */
/* ------------------------------------------------------------------ */
export function createUterusStage(assets, ui, chapterIndices) {
  const group = new THREE.Group();
  const uterus = fitModel(assets.uterus.scene, { size: 6.4 });
  const uterusMat = new THREE.MeshPhysicalMaterial({
    color: '#c0525f', roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.3,
    sheen: 0.5, sheenColor: new THREE.Color('#ff9fb0'), transparent: true, opacity: 0.86, depthWrite: false,
  });
  setMaterial(uterus, (m, mesh) => { mesh.renderOrder = 0; return uterusMat; });
  group.add(uterus);

  // Catheter path: up through the cervix into the uterine cavity (stage-local).
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.0, -4.6, 0.3),
    new THREE.Vector3(0.0, -2.6, 0.2),
    new THREE.Vector3(0.0, -1.2, 0.1),
    new THREE.Vector3(0.05, -0.1, 0.05),
    new THREE.Vector3(0.35, 0.75, 0.0),
  ]);
  const SEG = 140, RAD = 12;
  const cathGeo = new THREE.TubeGeometry(curve, SEG, 0.095, RAD, false);
  const cath = new THREE.Mesh(cathGeo, new THREE.MeshPhysicalMaterial({ color: '#e6f7ff', roughness: 0.25, transparent: true, opacity: 0.5, clearcoat: 0.5, envMapIntensity: 0.4, depthWrite: false }));
  cath.renderOrder = 1;
  const coreGeo = new THREE.TubeGeometry(curve, SEG, 0.04, 8, false);
  const core = new THREE.Mesh(coreGeo, new THREE.MeshStandardMaterial({ color: '#c8fff8', emissive: '#6fe6d8', emissiveIntensity: 0.55 }));
  group.add(cath, core);
  const totalIdx = cathGeo.index.count, coreIdx = coreGeo.index.count;

  // Travelling blastocyst
  const blasto = createEmbryo(0.17);
  blasto.set(5);
  blasto.group.traverse((o) => { o.renderOrder = 2; });
  group.add(blasto.group);

  const implantPoint = new THREE.Vector3(0.55, 0.9, 0.0);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), fresnelMaterial({ color: '#ffb48a', rim: '#fff1d6', power: 1.6, opacity: 0.5, rimOpacity: 0.0, glow: 1.2 }));
  glow.position.copy(implantPoint);
  glow.scale.setScalar(0.0001);
  glow.renderOrder = 3;
  group.add(glow);
  const rising = createParticles({ count: 90, box: [2.2, 3, 1.5], center: [implantPoint.x, implantPoint.y + 0.4, 0.6], colors: ['#ffd7b8', '#ffb08a', '#ffffff'], rise: 0.35, near: 2, far: 12, scale: 0.45, seed: 4 });
  group.add(rising);

  const cathAnchor = new THREE.Object3D(); cathAnchor.position.copy(curve.getPointAt(0.35)); group.add(cathAnchor);
  const implAnchor = new THREE.Object3D(); implAnchor.position.copy(implantPoint); group.add(implAnchor);
  ui.addLabel({ title: 'Transfer catheter', sub: 'soft, 1.5 mm wide', anchor: cathAnchor, offset: new THREE.Vector3(1.4, -0.4, 0), chapter: chapterIndices[0], show: [0.18, 0.6] });
  ui.addLabel({ title: 'Implantation', sub: 'days 6–10 after fertilisation', anchor: implAnchor, offset: new THREE.Vector3(0.8, 0.55, 0), chapter: chapterIndices[1], show: [0.3, 0.62] });

  const p = new THREE.Vector3();
  return {
    name: 'uterus', group,
    lights: [
      { pos: [3, 2, 5], color: '#ff9fb3', intensity: 110, distance: 30 },
      { pos: [-3, -2, 3], color: '#c58cff', intensity: 50, distance: 30 },
    ],
    update({ phase, t, time }) {
      // One timeline across both chapters.
      const g = phase === 0 ? T(t) * 0.5 : 0.5 + T(t) * 0.5;
      uterus.position.y = Math.sin(time * 0.6) * 0.04;
      uterus.rotation.y = Math.sin(time * 0.25) * 0.04;
      // The wall turns translucent so we can watch implantation inside.
      uterusMat.opacity = lerp(0.86, 0.3, smoothstep(0.5, 0.62, g));

      const reveal = smoothstep(0.04, 0.22, g) * (1 - smoothstep(0.4, 0.5, g));
      cathGeo.setDrawRange(0, Math.floor(totalIdx * reveal / (RAD * 6)) * RAD * 6);
      coreGeo.setDrawRange(0, Math.floor(coreIdx * reveal / (8 * 6)) * 8 * 6);
      cath.visible = core.visible = reveal > 0.001;

      const travel = range(g, 0.2, 0.36);
      const drift = smoothstep(0.5, 0.68, g);
      const settle = smoothstep(0.68, 0.85, g);
      if (g < 0.2) blasto.group.visible = false;
      else {
        blasto.group.visible = true;
        curve.getPointAt(Math.min(0.999, travel), p);
        p.lerp(implantPoint, drift);
        blasto.group.position.copy(p);
        blasto.group.rotation.y = time * 0.5;
        blasto.group.rotation.x = time * 0.3;
      }
      // Hatching: the zona swells and fades; embryo settles into the wall.
      blasto.zona.scale.setScalar(1 + settle * 0.35);
      blasto.zona.material.uniforms.uFade.value = 1 - settle;
      blasto.cellMat.uniforms.uGlow.value = settle * (0.5 + 0.3 * Math.sin(time * 3));

      const impl = smoothstep(0.72, 1, g);
      glow.scale.setScalar(Math.max(0.0001, impl * (1 + 0.08 * Math.sin(time * 2.2))));
      rising.material.uniforms.uOpacity.value = smoothstep(0.8, 1, g);
    },
  };
}

/* ------------------------------------------------------------------ */
/*  8 · Pregnancy: fetus                                               */
/* ------------------------------------------------------------------ */
export function createFetusStage(assets, ui) {
  const group = new THREE.Group();
  const fetus = fitModel(assets.fetus.scene, { size: 2.5 });
  setMaterial(fetus, () => new THREE.MeshPhysicalMaterial({
    color: '#e9a58f', roughness: 0.6, metalness: 0, envMapIntensity: 0.5,
    sheen: 0.6, sheenColor: new THREE.Color('#ffd0bd'), sheenRoughness: 0.7,
    clearcoat: 0.05, emissive: new THREE.Color('#4a170f'), emissiveIntensity: 0.25,
  }));
  group.add(fetus);

  const sac = new THREE.Mesh(new THREE.SphereGeometry(3.3, 64, 48), fresnelMaterial({ color: '#ff9f86', rim: '#ffd7c2', power: 2.4, opacity: 0.1, rimOpacity: 0.5, noise: 0.3 }));
  const womb = new THREE.Mesh(new THREE.SphereGeometry(3.6, 64, 48), fresnelMaterial({ color: '#4a1512', rim: '#ff8f6e', power: 1.6, opacity: 0.7, rimOpacity: 0.15, side: THREE.BackSide }));
  group.add(sac, womb);
  const motes = createParticles({ count: 220, box: [5, 5, 5], center: [0, 0, 0], colors: ['#ffd2b8', '#ffb08a', '#fff2e6'], near: 3, far: 14, scale: 0.6, seed: 8 });
  group.add(motes);

  return {
    name: 'fetus', group,
    lights: [
      { pos: [-3, 2, 3], color: '#ffb27a', intensity: 90, distance: 30 },
      { pos: [3, -1, -2], color: '#ff6d5a', intensity: 60, distance: 30 },
    ],
    update({ t, time }) {
      const ts = T(t);
      fetus.scale.setScalar(lerp(0.62, 1.18, ts));
      fetus.rotation.y = 0.5 + Math.sin(time * 0.3) * 0.25 + ts * 0.5;
      fetus.rotation.z = Math.sin(time * 0.4) * 0.06;
      fetus.position.y = Math.sin(time * 0.6) * 0.12 - 0.1;
      sac.rotation.y = time * 0.05;
      ui.setWeek(ts);
    },
  };
}

/* ------------------------------------------------------------------ */
/*  9+10 · Welcome: baby                                               */
/* ------------------------------------------------------------------ */
export function createBabyStage(assets) {
  const group = new THREE.Group();
  const baby = fitModel(assets.baby.scene, { size: 2.9 });
  setMaterial(baby, (m) => { m.metalness = 0; m.roughness = 0.58; m.envMapIntensity = 0.9; });
  group.add(baby);

  const halo = createHalo('#ffd2c4', 0.85);
  halo.position.z = -2.2;
  halo.scale.setScalar(10);
  group.add(halo);

  return {
    name: 'baby', group,
    lights: [
      { pos: [2, 3, 4], color: '#fff1e6', intensity: 130, distance: 30 },
      { pos: [-3, 0, 2], color: '#ffd3e0', intensity: 70, distance: 30 },
    ],
    update({ phase, t, time }) {
      baby.position.y = Math.sin(time * 0.5) * 0.08;
      baby.rotation.y = -0.25 + Math.sin(time * 0.2) * 0.15 + (phase === 1 ? t * 0.5 : 0);
      baby.rotation.z = Math.sin(time * 0.35) * 0.04;
    },
  };
}

/* ------------------------------------------------------------------ */

export function createStages(assets, ui, chapters) {
  const idx = (id) => chapters.findIndex((c) => c.id === id);
  return {
    dna: createDnaStage(),
    syringe: createSyringeStage(assets, ui, idx('stimulation')),
    ovary: createOvaryStage(ui, [idx('monitoring'), idx('retrieval')]),
    egg: createEggStage(assets, ui, idx('fertilisation')),
    embryo: createEmbryoStage(ui, idx('embryo')),
    uterus: createUterusStage(assets, ui, [idx('transfer'), idx('implantation')]),
    fetus: createFetusStage(assets, ui),
    baby: createBabyStage(assets),
  };
}
