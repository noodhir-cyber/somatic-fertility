import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const MODELS = {
  syringe: 'models/syringe.glb',
  sperm:   'models/sperm.glb',
  uterus:  'models/uterus.glb',
  fetus:   'models/fetus.glb',
  baby:    'models/baby.glb',
};

/**
 * Loads every GLB in parallel. onProgress receives 0..1.
 * Models are Draco-compressed (see public/draco) and use WebP textures.
 */
export async function loadAssets(onProgress = () => {}) {
  const base = import.meta.env.BASE_URL;
  const draco = new DRACOLoader();
  draco.setDecoderPath(`${base}draco/`);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  const keys = Object.keys(MODELS);
  const progress = Object.fromEntries(keys.map((k) => [k, 0]));
  const report = () => {
    const sum = keys.reduce((s, k) => s + progress[k], 0);
    onProgress(sum / keys.length);
  };

  const results = await Promise.all(
    keys.map(
      (key) =>
        new Promise((resolve, reject) => {
          loader.load(
            `${base}${MODELS[key]}`,
            (gltf) => { progress[key] = 1; report(); resolve(gltf); },
            (e) => { if (e.total) { progress[key] = Math.min(0.98, e.loaded / e.total); report(); } },
            reject,
          );
        }),
    ),
  );

  draco.dispose();
  return Object.fromEntries(keys.map((k, i) => [k, results[i]]));
}
