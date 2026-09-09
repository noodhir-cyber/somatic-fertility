import { clamp, smoothstep } from './procedural.js';

/**
 * Turns the page scroll position into a chapter index, a local progress `t`
 * (0..1 through that chapter) and a `transition` value (0..1) used to fly the
 * camera to the next chapter during the tail of the current one.
 */
export class Journey {
  constructor(sections, { reducedMotion = false } = {}) {
    this.sections = sections;
    this.n = sections.length;
    this.reducedMotion = reducedMotion;
    this.smooth = window.scrollY;
    this.index = 0;
    this.t = 0;
    this.transition = 0;
    this.progress = 0;
    this.measure();
  }

  measure() {
    this.tops = this.sections.map((el) => el.offsetTop);
    this.heights = this.sections.map((el) => Math.max(1, el.offsetHeight));
    this.max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }

  update(dt) {
    const target = window.scrollY;
    if (this.reducedMotion) {
      this.smooth = target;
    } else {
      const k = 1 - Math.exp(-dt * 7.5);
      this.smooth += (target - this.smooth) * k;
      if (Math.abs(target - this.smooth) < 0.05) this.smooth = target;
    }

    let i = 0;
    while (i < this.n - 1 && this.smooth >= this.tops[i + 1]) i++;

    this.index = i;
    this.t = clamp((this.smooth - this.tops[i]) / this.heights[i]);
    this.transition = i < this.n - 1 ? smoothstep(0.6, 1, this.t) : 0;
    this.progress = clamp(this.smooth / this.max);
  }

  scrollToChapter(i) {
    window.scrollTo({ top: this.tops[i] + 2, behavior: this.reducedMotion ? 'auto' : 'smooth' });
  }
}
