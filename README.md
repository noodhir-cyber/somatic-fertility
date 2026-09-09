# Lumina Fertility — the journey of IVF, in 3D

A scroll-driven, single-page three.js experience that walks a family through a
typical IVF cycle: hormone injections → follicle monitoring → egg collection →
ICSI fertilisation → embryo culture → embryo transfer → implantation →
pregnancy → birth. Built as a "what 3D on the web can do" showcase for a
fertility clinic pitch.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static output in dist/
npm run preview    # serve dist/ locally
```

Deploy `dist/` to any static host (Netlify, Vercel, GitHub Pages, S3…). If the
site lives in a sub-folder, build with `npx vite build --base=/sub-folder/`.

## How it works

| File | Role |
| --- | --- |
| `index.html` | Story copy, chapter text, final call-to-action, credits. |
| `src/chapters.js` | **The storyboard.** One entry per chapter: which 3D stage it looks at, camera offset, background colour, HUD label. Stage world positions live here too. |
| `src/stages.js` | One factory per 3D stage (DNA, syringe, ovary, ICSI, embryo, uterus, fetus, baby). Each returns a group, two light positions and an `update({ phase, t, time })` that animates the beat based on scroll progress `t`. |
| `src/procedural.js` | Generated geometry and shaders: fresnel "cell" material, egg, dividing embryo → blastocyst, ovary with follicles, needle, glass pipette, DNA helix, particles, ultrasound scan plane. |
| `src/experience.js` | Renderer, camera, environment lighting, bloom post-processing. |
| `src/scroll.js` | Converts `scrollY` into chapter index + local progress with damping. |
| `src/ui.js` | Loader, overlay text fades, HUD, chapter dots, 3D-anchored labels, light/dark theme. |
| `src/main.js` | Wires everything together and runs the frame loop. |

The page is a stack of `165vh` spacer `<div>`s (one per chapter) plus a real
in-flow final section. All chapter text lives in a fixed overlay and is faded
in/out by JavaScript, so the 3D scene never fights the browser for layout.

Each stage sits 42 units further along `-z`. During the last 40 % of a chapter
the camera flies to the next stage; linear fog (16 → 38 units) hides stages
that are not current, so each one emerges from the dark as you arrive.

### Debugging

`window.__ivf` is exposed in the console:

```js
__ivf.step(4, 0.5)   // jump to chapter 4 at 50 % progress and render one frame
__ivf.stages.egg     // inspect a stage group
```

## 3D models

All models were downloaded from Sketchfab under Creative Commons licences and
then optimised with `gltf-transform` (Draco geometry compression, WebP textures
capped at 1024 px, mesh simplification for the baby). Originals are in
`raw_models/` (git-ignored); optimised versions in `public/models/`.

| Model | Author | Licence | Optimised size | Used in |
| --- | --- | --- | --- | --- |
| [Medical Syringe](https://sketchfab.com/3d-models/medical-syringe-22e711221a094a48a6ffe826d3fd6185) | Alexander Troianovskyi | CC BY 4.0 | 457 kB | Chapter 1 — Stimulation |
| [CC0 — Sperm](https://sketchfab.com/3d-models/cc0-sperm-af340f33a8574d60a65fa008233ad934) | plaggy | CC0 | 139 kB | Chapter 4 — ICSI |
| [Uterus](https://sketchfab.com/3d-models/uterus-0c543295600d4feaa3bf723cc1bb1730) | Beste Zengin | CC BY 4.0 | 262 kB | Chapters 6–7 — Transfer & implantation |
| [Fetus](https://sketchfab.com/3d-models/fetus-cdbadf8ba54e44ec9533a546dcd52830) | gelmi.com.br | CC BY 4.0 | 54 kB | Chapter 8 — Pregnancy |
| [Sleeping Baby](https://sketchfab.com/3d-models/sleeping-baby-f64d9f687a2e458883d72489adfa5fba) | Syral86 | CC BY 4.0 | 1.08 MB | Chapters 9–10 — Welcome |

CC BY requires attribution: the footer in `index.html` already credits every
author and links back to the source page. Keep it (or an equivalent credits
page) if you ship this.

The egg, follicles, ovary, embryo/blastocyst, DNA, needle, pipettes and
catheter are generated in code — no downloads needed, and they animate
(cell division, aspiration, injection) in ways a static model could not.

### Swapping a model

1. Download a GLB from Sketchfab (or anywhere) into `raw_models/name.glb`.
2. Optimise it:
   ```bash
   npx gltf-transform optimize raw_models/name.glb public/models/name.glb --compress draco --texture-compress webp --texture-size 1024
   ```
3. Add it to `MODELS` in `src/assets.js` and use `assets.name.scene` in a stage.
   `fitModel(scene, { size })` centres it and scales its largest dimension.

## Medical accuracy

The copy describes a standard "long/antagonist" IVF cycle with ICSI and a
day-5 blastocyst transfer. Day numbers are indicative; protocols vary by clinic
and patient. Review all wording with the clinic's medical team before
publishing. Placeholder clinic name, contact details and statistics in the
final section should be replaced.

## Browser support

Modern evergreen browsers with WebGL 2. Mobile gets a lighter particle count,
no MSAA and a bottom-anchored text card. Reduced-motion preferences disable
scroll damping and parallax. If WebGL is unavailable the chapter text is shown
as a plain document.
