import gsap from 'gsap';
import { smoothstep } from './procedural.js';

const WEEK_SIZES = [
  [8, 'the size of a raspberry'], [10, 'the size of a strawberry'], [12, 'the size of a lime'],
  [16, 'the size of an avocado'], [20, 'the size of a banana'], [24, 'the size of an ear of corn'],
  [28, 'the size of an aubergine'], [32, 'the size of a squash'], [36, 'the size of a honeydew melon'],
  [40, 'ready to meet you'],
];

/** DOM side of the experience: loader, overlay text, HUD, dots, labels, theme. */
export class UI {
  constructor(chapters) {
    this.chapters = chapters;
    this.loader = document.getElementById('loader');
    this.loadText = document.querySelector('[data-load]');
    this.loadBar = document.querySelector('[data-loadbar]');
    this.articles = chapters.map((c) => document.querySelector(`.overlay [data-chapter="${c.id}"]`));
    this.hudDay = document.querySelector('[data-hud-day]');
    this.hudIndex = document.querySelector('[data-hud-index]');
    this.hudTotal = document.querySelector('[data-hud-total]');
    this.progressBar = document.querySelector('[data-progress]');
    this.labelsRoot = document.getElementById('labels');
    this.dyn = {};
    document.querySelectorAll('[data-dyn]').forEach((el) => (this.dyn[el.dataset.dyn] = el));
    this.labels = [];
    this.light = false;
    this.activeDot = -1;
    this.hudTotal.textContent = String(chapters.length - 1).padStart(2, '0');
    document.querySelector('[data-year]').textContent = new Date().getFullYear();
  }

  /* ---- loader ---- */
  setLoad(p) {
    const pct = Math.round(p * 100);
    this.loadText.textContent = `${pct}%`;
    this.loadBar.style.width = `${pct}%`;
  }
  hideLoader() {
    this.loader.classList.add('is-hidden');
  }
  playIntro() {
    gsap.fromTo('.chapter--hero .reveal', { y: 34, opacity: 0 }, { y: 0, opacity: 1, duration: 1.3, stagger: 0.13, ease: 'power3.out', delay: 0.25, clearProps: 'all' });
  }

  /* ---- chapter dots ---- */
  buildDots(onSelect) {
    const nav = document.querySelector('.dots');
    this.dots = this.chapters.map((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', c.short);
      b.innerHTML = `<span>${c.short}</span>`;
      b.addEventListener('click', () => onSelect(i));
      nav.appendChild(b);
      return b;
    });
  }

  /* ---- per-frame ---- */
  update(index, t, progress) {
    // Overlay text visibility
    for (let k = 0; k < this.articles.length; k++) {
      const el = this.articles[k];
      if (!el) continue;
      let a = 0;
      if (k === index) {
        a = k === 0
          ? 1 - smoothstep(0.32, 0.55, t)
          : smoothstep(0.02, 0.16, t) * (1 - smoothstep(0.52, 0.68, t));
      }
      if (a !== el._alpha) {
        el._alpha = a;
        el.style.opacity = a.toFixed(3);
        el.style.visibility = a > 0.01 ? 'visible' : 'hidden';
        el.style.transform = `translate3d(0, ${((1 - a) * 26).toFixed(2)}px, 0)`;
      }
    }
    // HUD + dots
    if (index !== this.activeDot) {
      this.activeDot = index;
      const ch = this.chapters[index];
      this.hudDay.textContent = ch.day;
      this.hudIndex.textContent = String(Math.min(index, this.chapters.length - 1)).padStart(2, '0');
      this.dots?.forEach((d, i) => d.classList.toggle('is-active', i === index));
    }
    this.progressBar.style.width = `${(progress * 100).toFixed(2)}%`;
  }

  setTheme(light) {
    if (light === this.light) return;
    this.light = light;
    document.body.classList.toggle('light', light);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f4e8e3' : '#0a0c18');
  }

  setText(key, value) {
    const el = this.dyn[key];
    if (el && el.textContent !== value) el.textContent = value;
  }

  setWeek(t) {
    const week = Math.round(8 + t * 32);
    let size = WEEK_SIZES[0][1];
    for (const [w, s] of WEEK_SIZES) if (week >= w) size = s;
    this.setText('week', `Week ${week} · ${size}`);
  }

  /* ---- 3D-anchored labels ---- */
  addLabel({ title, sub = '', anchor, offset, chapter, show = [0.1, 0.55] }) {
    const el = document.createElement('div');
    el.className = 'label';
    el.innerHTML = `<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}`;
    this.labelsRoot.appendChild(el);
    this.labels.push({ el, anchor, offset, chapter, show });
  }

  updateLabels(camera, index, t) {
    const w = window.innerWidth, h = window.innerHeight;
    for (const l of this.labels) {
      let a = 0;
      if (l.chapter === index) a = smoothstep(l.show[0], l.show[0] + 0.07, t) * (1 - smoothstep(l.show[1] - 0.07, l.show[1], t));
      if (a < 0.01) { if (l.el._alpha !== 0) { l.el.style.opacity = '0'; l.el._alpha = 0; } continue; }
      l.anchor.getWorldPosition(_v).add(l.offset);
      _v.project(camera);
      if (_v.z > 1) a = 0;
      const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
      l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      l.el.style.opacity = a.toFixed(3);
      l.el._alpha = a;
    }
  }
}

import * as THREE from 'three';
const _v = new THREE.Vector3();
