import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const isMobile = matchMedia('(max-width: 900px), (pointer: coarse)').matches;

/**
 * Renderer, scene, camera, lights and post-processing.
 */
export class Experience {
  constructor(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.localClippingEnabled = true;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0c18');
    // Linear fog: the current stage (≤ 12 units away) is crisp, the next stage
    // (42 units along the path) is fully hidden until the camera flies to it.
    scene.fog = new THREE.Fog('#0a0c18', 16, 38);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
    camera.position.set(0, 0, 11);
    scene.add(camera);
    this.camera = camera;

    // Image-based lighting for the PBR models (steel syringe, skin).
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();

    // Lights. A headlight rides with the camera so every stage is lit consistently;
    // two point lights are re-positioned per stage for colour and drama.
    this.hemi = new THREE.HemisphereLight('#ffeef3', '#1a1226', 0.75);
    scene.add(this.hemi);

    this.key = new THREE.DirectionalLight('#ffffff', 1.4);
    this.key.position.set(2.5, 3, 2);
    this.key.target.position.set(0, 0, -6);
    camera.add(this.key, this.key.target);

    this.p1 = new THREE.PointLight('#ff9db4', 80, 30, 2);
    this.p2 = new THREE.PointLight('#7fe0d0', 50, 30, 2);
    scene.add(this.p1, this.p2);

    // Post: bloom for the glowing cells, MSAA render target for clean edges.
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: isMobile ? 0 : 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.45, 0.5, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.composer.render();
  }
}
