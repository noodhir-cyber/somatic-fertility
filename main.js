import './style.css';
import * as THREE from 'three';
import gsap from 'gsap';
import { chapters, stagePositions } from './chapters.js';
import { Experience, isMobile } from './experience.js';
import { loadAssets } from './assets.js';
import { createStages } from './stages.js';
import { createParticles, tickMaterials, lerp, clamp, smoothstep } from './procedural.js';
import { Journey } from './scroll.js';
import { UI } from './ui.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
history.scrollRestoration = 'manual';

const ui = new UI(chapters);

async function init() {
  let xp;
  try {
    xp = new Experience(document.getElementById('webgl'));
  } catch (err) {
    console.error('WebGL unavailable', err);
    document.body.classList.add('no-webgl');
    ui.hideLoader();
    return;
  }
  const { scene, camera } = xp;

  const assets = await loadAssets((p) => ui.setLoad(p));

  /* ---- build the world ---- */
  const stages = createStages(assets, ui, chapters);
  for (const s of Object.values(stages)) {
    s.group.position.fromArray(stagePositions[s.name]);
    scene.add(s.group);
  }
  const stageOfChapter = chapters.map((c) => stages[c.stage]);
  const stageChapters = {};
  chapters.forEach((c, i) => (stageChapters[c.stage] ??= []).push(i));

  const dust = createParticles({ count: isMobile ? 700 : 1600, box: [60, 40, 360], center: [0, 0, -150], near: 18, far: 60 });
  scene.add(dust);

  /* ---- scroll ---- */
  const sections = [...document.querySelectorAll('#journey [data-chapter]')];
  const journey = new Journey(sections, { reducedMotion });
  ui.buildDots((i) => journey.scrollToChapter(i));
  document.querySelector('[data-begin]')?.addEventListener('click', (e) => { e.preventDefault(); journey.scrollToChapter(1); });
  window.addEventListener('resize', () => journey.measure());
  // Fonts / late layout can move things: re-measure a few times after load.
  [300, 1200, 3000].forEach((ms) => setTimeout(() => journey.measure(), ms));

  /* ---- pointer parallax ---- */
  const mouse = new THREE.Vector2(), mouseTarget = new THREE.Vector2();
  if (!isMobile && !reducedMotion) {
    window.addEventListener('pointermove', (e) => {
      mouseTarget.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    });
  }

  /* ---- scratch ---- */
  const camA = new THREE.Vector3(), camB = new THREE.Vector3(), lookA = new THREE.Vector3(), lookB = new THREE.Vector3();
  const camPos = new THREE.Vector3(), lookPos = new THREE.Vector3(), tmp = new THREE.Vector3();
  const colA = new THREE.Color(), colB = new THREE.Color(), bg = new THREE.Color();
  const lightA = new THREE.Color(), lightB = new THREE.Color();
  const chapterColors = chapters.map((c) => new THREE.Color(c.bg));

  const camOf = (i, out) => out.fromArray(stagePositions[chapters[i].stage]).add(tmp.fromArray(chapters[i].cam));
  const lookOf = (i, out) => out.fromArray(stagePositions[chapters[i].stage]).add(tmp.fromArray(chapters[i].look));

  function placeLight(light, a, b, k, stageA, stageB, slot) {
    const la = stageA.lights[slot], lb = stageB.lights[slot];
    tmp.fromArray(stagePositions[stageA.name]).add(a.fromArray(la.pos));
    light.position.copy(tmp);
    tmp.fromArray(stagePositions[stageB.name]).add(b.fromArray(lb.pos));
    light.position.lerp(tmp, k);
    lightA.set(la.color); lightB.set(lb.color);
    light.color.copy(lightA).lerp(lightB, k);
    light.intensity = lerp(la.intensity, lb.intensity, k);
    light.distance = lerp(la.distance, lb.distance, k);
  }
  const sa = new THREE.Vector3(), sb = new THREE.Vector3();

  /* ---- main loop ---- */
  let last = performance.now(), time = 0;
  const N = chapters.length;

  function frame(now) {
    update(now);
    requestAnimationFrame(frame);
  }

  function update(now, forced) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    if (!forced) journey.update(dt);
    const i = journey.index, t = journey.t, tt = journey.transition;
    const j = Math.min(i + 1, N - 1);

    // Camera
    camOf(i, camA); camOf(j, camB); lookOf(i, lookA); lookOf(j, lookB);
    camPos.lerpVectors(camA, camB, tt);
    lookPos.lerpVectors(lookA, lookB, tt);
    mouse.lerp(mouseTarget, 1 - Math.exp(-dt * 3));
    camPos.x += mouse.x * 0.35; camPos.y += mouse.y * 0.25;
    camera.position.copy(camPos);
    camera.lookAt(lookPos);

    // Background, fog, theme, bloom
    colA.copy(chapterColors[i]); colB.copy(chapterColors[j]);
    bg.copy(colA).lerp(colB, tt);
    scene.background.copy(bg); scene.fog.color.copy(bg);
    const lightMix = lerp(chapters[i].light ? 1 : 0, chapters[j].light ? 1 : 0, tt);
    ui.setTheme(lightMix > 0.5);
    xp.bloom.strength = lerp(0.45, 0.12, lightMix);
    xp.hemi.intensity = lerp(0.75, 1.4, lightMix);
    xp.hemi.groundColor.setHex(lightMix > 0.5 ? 0xd8b8b0 : 0x1a1226);
    scene.environmentIntensity = lerp(0.55, 0.9, lightMix);

    // Stages
    for (const s of Object.values(stages)) {
      const list = stageChapters[s.name];
      const first = list[0], lastC = list[list.length - 1];
      let phase, lt;
      if (i < first) { phase = 0; lt = 0; }
      else if (i > lastC) { phase = list.length - 1; lt = 1; }
      else { phase = list.indexOf(i); lt = t; }
      s.group.visible = i >= first - 1 && i <= lastC + 1;
      if (s.group.visible) s.update({ phase, t: lt, time, dt });
    }

    // Point lights follow the active stage
    const stA = stageOfChapter[i], stB = stageOfChapter[j];
    placeLight(xp.p1, sa, sb, tt, stA, stB, 0);
    placeLight(xp.p2, sa, sb, tt, stA, stB, 1);

    tickMaterials(time);
    ui.update(i, t, journey.progress);
    ui.updateLabels(camera, i, t);
    xp.render();
  }

  /** Debug: jump straight to chapter `i` at progress `t` and render one frame. */
  function step(i, t = 0.4, at = time) {
    journey.measure();
    const y = journey.tops[i] + journey.heights[i] * t;
    window.scrollTo({ top: y, behavior: 'instant' });
    journey.smooth = y;
    journey.update(0);
    time = at;
    update(performance.now(), true);
    return { index: journey.index, t: journey.t };
  }

  /* ---- go ---- */
  window.scrollTo(0, 0);
  journey.measure();
  ui.setLoad(1);
  requestAnimationFrame(frame);
  setTimeout(() => {
    ui.hideLoader();
    ui.playIntro();
    const dna = stages.dna.group;
    gsap.fromTo(dna.scale, { x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 1, z: 1, duration: 2.2, ease: 'power3.out' });
  }, 350);

  // Expose for debugging in the console.
  window.__ivf = { xp, stages, journey, chapters, stagePositions, step };
}

init().catch((err) => {
  console.error(err);
  ui.hideLoader();
});
