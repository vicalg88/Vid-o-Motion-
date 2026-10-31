// ---------------------------------------------------------------------------
// Orchestration du rendu image par image (déterministe, piloté par Playwright)
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { FPS, FRAMES, ACT2, SHUTTER, samplesAt, remap, E } from './timeline.js';
import { Act1 } from './act1.js';
import { Act2 } from './act2.js';
import { Post } from './post.js';
import { Overlay } from './overlay.js';

const q = new URLSearchParams(location.search);
const W = +(q.get('w') || 1920);
const H = +(q.get('h') || 1080);
const QUALITY = +(q.get('q') || 1);

async function loadFonts() {
  for (const w of [900, 600, 500]) {
    const f = new FontFace(`Mont${w}`, `url(../assets/fonts/Montserrat-${w}.ttf)`);
    await f.load();
    document.fonts.add(f);
  }
}

async function init() {
  await loadFonts();
  const logo = await (await fetch('../assets/logo.json')).json();
  const canvas = document.getElementById('gl');
  canvas.width = W;
  canvas.height = H;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.autoClear = false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const c2d = document.createElement('canvas');
  c2d.width = W;
  c2d.height = H;
  const act1 = new Act1(c2d, logo);
  const act1Tex = new THREE.CanvasTexture(c2d);
  act1Tex.colorSpace = THREE.SRGBColorSpace;
  act1Tex.generateMipmaps = false;
  act1Tex.minFilter = THREE.LinearFilter;

  const ovc = document.createElement('canvas');
  ovc.width = W;
  ovc.height = H;
  const overlay = new Overlay(ovc);
  const ovTex = new THREE.CanvasTexture(ovc);
  ovTex.generateMipmaps = false;
  ovTex.minFilter = THREE.LinearFilter;

  const act2 = new Act2(renderer, logo, W, H);
  const post = new Post(renderer, W, H);
  const gl = renderer.getContext();
  const pixels = new Uint8Array(W * H * 4);

  // pré-compilation des shaders
  act2.update(6.2);
  post.renderScene(act2.scene, act2.camera);
  post.renderDepth(act2.scene, act2.camera, act2.depthHidden);

  async function renderFrame(i, opts = {}) {
    const t = i / FPS;
    const n = Math.max(1, Math.round((opts.samples ?? samplesAt(t)) * QUALITY));
    const t0 = performance.now();
    post.clearAccum();
    for (let k = 0; k < n; k++) {
      const tk = n === 1 ? t : t + (((k + 0.5) / n - 0.5) * SHUTTER) / FPS;
      if (tk < ACT2) {
        act1.draw(tk);
        act1Tex.needsUpdate = true;
        post.accumulate(act1Tex, 1 / n);
      } else {
        act2.update(tk, i * 7 + k);
        post.renderScene(act2.scene, act2.camera);
        post.accumulate(post.rtScene.texture, 1 / n);
      }
    }
    let src = post.rtAccum;
    const inAct2 = t >= ACT2;
    let tone = 0;
    let exposure = 1;
    let bloom = 0.12;
    if (inAct2) {
      act2.update(t, i * 7 + 3);
      const cs = act2.camState;
      if (cs.aperture > 0.2) {
        post.renderDepth(act2.scene, act2.camera, act2.depthHidden);
        src = post.dof(src, cs.focus, cs.aperture * (H / 1080), 16 * (H / 1080));
      }
      tone = 1;
      exposure = act2.exposure;
      bloom = act2.bloomStrength;
    }
    post.applyBloom(src, bloom, inAct2 ? act2.bloomThreshold : 0.93);
    overlay.draw(t);
    ovTex.needsUpdate = true;
    post.final(src, ovTex, {
      uTone: tone,
      uExposure: exposure,
      uSeed: (i % 251) + 1,
      uGrain: 0.024,
      uVignette: inAct2 ? 0.42 : 0.3,
      uCA: 0.005,
      uFade: 0,
    });
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const ms = performance.now() - t0;
    const res = await fetch(`/frame?i=${i}`, { method: 'POST', body: pixels });
    if (!res.ok) throw new Error('upload failed ' + res.status);
    return { ms, n };
  }

  window.EXPRNC = { renderFrame, W, H, FRAMES, FPS, ready: true, act1, act2, overlay };
}

init().catch((e) => {
  console.error(e);
  window.EXPRNC = { error: String(e && e.stack ? e.stack : e) };
});
