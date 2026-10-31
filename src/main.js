// ---------------------------------------------------------------------------
// Film « Exprnc. » — orchestration du rendu image par image (déterministe)
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { FPS, FRAMES, SHUTTER, CUES, VISIONS, PICKS, samplesAt, remap, mix, smoothstep, E } from './timeline.js';
import { Post } from './post.js';
import { Overlay } from './overlay.js';
import { World } from './film/world.js';
import { POV, camZAt, Z_WALL, Z_FLOOR_PIECES, LOGO_Y, Z_STAND } from './film/camera.js';
import { Door } from './film/door.js';
import { CasinoVision, CinemaVision, UndercoverVision, FoodVision } from './film/visions.js';
import { Puzzle } from './film/puzzle.js';

const q = new URLSearchParams(location.search);
const W = +(q.get('w') || 1920);
const H = +(q.get('h') || 1080);
const QUALITY = +(q.get('q') || 1);

async function loadFonts() {
  for (const w of [900, 800, 700, 600, 500]) {
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

  const world = new World(renderer, W, H);
  world.W = W;
  world.H = H;
  const scene = world.scene;
  const camera = world.camera;

  // ---- visions, placées le long du couloir (gauche / droite / gauche / droite)
  const classes = [CasinoVision, CinemaVision, UndercoverVision, FoodVision];
  const visions = VISIONS.map((win, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const mid = (win[0] + win[1]) / 2;
    const zc = camZAt(mid);
    const center = new THREE.Vector3(side * 2.75, 1.68, zc - 1.75);
    const v = new classes[i](world, { center, window: win });
    v.orient(new THREE.Vector3(0, 1.62, zc + 0.4));
    v.side = side;
    return v;
  });
  const pov = new POV(camera, visions.map((v) => ({ center: v.center, window: v.window })));
  const door = new Door();
  scene.add(door.group);
  const puzzle = new Puzzle(world, logo);

  // lumières du puzzle / carton final (coordonnées monde)
  const puzzleRigs = {
    floor: {
      key: { pos: [0.5, 3.0, Z_FLOOR_PIECES + 0.9], target: [0.1, 0, Z_FLOOR_PIECES], color: '#fff4e6', intensity: 2.1, angle: 0.5 },
      a: { pos: [-1.2, 1.4, Z_STAND + 0.2], color: '#ffd9b0', intensity: 1.5 },
      b: { pos: [1.0, 2.2, Z_WALL - 1.2], color: '#b9d4ff', intensity: 4 },
    },
    wall: {
      key: { pos: [-0.5, 2.5, Z_STAND + 1.3], target: [0, LOGO_Y, Z_WALL], color: '#fff6ec', intensity: 1.75, angle: 0.55 },
      a: { pos: [-1.1, 2.1, Z_WALL - 0.8], color: '#ffd2a8', intensity: 2.5 },
      b: { pos: [1.2, 1.2, Z_WALL - 0.7], color: '#a9c8ff', intensity: 2.5 },
    },
  };
  const ident = new THREE.Object3D();
  ident.updateMatrixWorld();

  const c2d = document.createElement('canvas');
  c2d.width = W;
  c2d.height = H;
  const overlay = new Overlay(c2d);
  const ovTex = new THREE.CanvasTexture(c2d);
  ovTex.generateMipmaps = false;
  ovTex.minFilter = THREE.LinearFilter;

  const post = new Post(renderer, W, H);
  const gl = renderer.getContext();
  const pixels = new Uint8Array(W * H * 4);
  const depthHidden = [world.dust.points, puzzle.ripple, ...puzzle.seams.map((s) => s.mesh), ...visions.map((v) => v.pf.points)];
  const focusState = { focus: 4, aperture: 0 };

  function updateScene(t) {
    const body = pov.position(t).clone();
    const pfocus = t > CUES.stumble ? puzzle.focusPoint(t, body) : null;
    const st = pov.orient(t, pfocus);
    door.update(t);
    // mise au point
    let focus = 4;
    let aperture = 0;
    if (t < CUES.threshold) {
      focus = Math.max(0.5, camera.position.z - 0.0);
      aperture = 6;
    } else if (st.look >= 0 && st.lookW > 0.05) {
      focus = visions[st.look].center.distanceTo(camera.position) - 0.6;
      aperture = 9 * st.lookW + 4;
    } else if (t < CUES.stumble) {
      focus = 3.5;
      aperture = 4;
    } else {
      const fw = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      let tgt = new THREE.Vector3(0.1, 0.02, Z_FLOOR_PIECES);
      if (pfocus && pfocus.w > 0.05) tgt = tgt.lerp(pfocus.p, pfocus.w);
      if (t > CUES.stepBack - 0.5) tgt = new THREE.Vector3(0, LOGO_Y, Z_WALL);
      focus = Math.max(0.25, tgt.clone().sub(camera.position).dot(fw));
      aperture = mix(7, 0, smoothstep(CUES.press, CUES.stepBack + 0.8, t));
    }
    focusState.focus = focus;
    focusState.aperture = aperture;
    visions.forEach((v) => v.update(t, focus, aperture));
    // éclairages : rig 0 = visions de gauche, rig 1 = visions de droite
    const left = visions.filter((v) => v.side < 0);
    const right = visions.filter((v) => v.side > 0);
    [left, right].forEach((vs, k) => {
      const rig = world.rigs[k];
      const v = vs.reduce((best, x) => (x.r > (best ? best.r : 0) ? x : best), null);
      if (v && v.r > 0.001) rig.apply(v.frame, v.rig, Math.min(1, v.r * 1.3));
      else rig.off();
    });
    if (t > CUES.stumble - 0.2) {
      const kf = smoothstep(CUES.stumble - 0.2, CUES.lookDown, t) * (1 - smoothstep(PICKS[1][1], PICKS[2][1], t));
      const kw = smoothstep(PICKS[0][0] + 0.3, PICKS[0][1], t);
      world.rigs[0].apply(ident, puzzleRigs.floor, Math.max(kf, 0.0001));
      world.rigs[1].apply(ident, puzzleRigs.wall, Math.max(kw, 0.0001));
    }
    puzzle.update(t, body);
    // poussière, sol miroir, flaque de lumière sous les pièces
    world.dust.update(t, smoothstep(CUES.threshold - 0.3, CUES.threshold + 0.6, t) * (1 - 0.6 * smoothstep(CUES.stepBack, CUES.stepBack + 1, t)), focus, aperture);
    const fl = world.floor.u;
    fl.uStrength.value = 0.62 * (1 - smoothstep(CUES.stepBack - 0.2, CUES.stepBack + 0.9, t));
    const pool = smoothstep(CUES.stumble - 0.3, CUES.lookDown + 0.3, t) * (1 - smoothstep(PICKS[2][1] - 0.4, CUES.stepBack + 0.6, t));
    fl.uPoolColor.value.setRGB(0.05, 0.045, 0.04).multiplyScalar(pool);
    scene.environmentIntensity = mix(0.3, 0.18, smoothstep(CUES.stumble, CUES.lookDown, t));
    world.hemi.intensity = 0.06;
    world.floor.render(renderer, scene, camera);
    return st;
  }

  // pré-compilation
  for (const tt of [1.5, 3.5, 6.5, 9.5, 12.5, 15.5, 20.5]) {
    updateScene(tt);
    post.renderScene(scene, camera);
  }

  async function renderFrame(i, opts = {}) {
    const t = i / FPS;
    const n = Math.max(1, Math.round((opts.samples ?? samplesAt(t)) * QUALITY));
    const t0 = performance.now();
    post.clearAccum();
    for (let k = 0; k < n; k++) {
      const tk = n === 1 ? t : t + (((k + 0.5) / n - 0.5) * SHUTTER) / FPS;
      updateScene(tk);
      post.renderScene(scene, camera);
      post.accumulate(post.rtScene.texture, 1 / n);
    }
    updateScene(t);
    let src = post.rtAccum;
    if (focusState.aperture > 0.2) {
      post.renderDepth(scene, camera, depthHidden);
      src = post.dof(src, focusState.focus, focusState.aperture * (H / 1080), 14 * (H / 1080));
    }
    const endK = smoothstep(CUES.stepBack, CUES.stepBack + 1.0, t);
    const pzK = smoothstep(CUES.stumble - 0.3, CUES.lookDown, t);
    post.applyBloom(src, mix(mix(0.55, 0.4, pzK), 0.32, endK), mix(0.82, 1.0, pzK));
    overlay.draw(t);
    ovTex.needsUpdate = true;
    const flash = Math.exp(-Math.pow((t - (CUES.threshold - 0.01)) / 0.075, 2)) * 1.1;
    post.final(src, ovTex, {
      uTone: 1,
      uExposure: 1,
      uSeed: (i % 251) + 1,
      uGrain: 0.028,
      uVignette: mix(0.62, 0.45, endK),
      uCA: mix(0.014, 0.004, endK),
      uFade: 1 - smoothstep(0.0, 0.45, t),
      uFlash: flash,
    });
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const ms = performance.now() - t0;
    if (!opts.noUpload) {
      const res = await fetch(`/frame?i=${i}`, { method: 'POST', body: pixels });
      if (!res.ok) throw new Error('upload failed ' + res.status);
    }
    return { ms, n };
  }

  window.EXPRNC = { renderFrame, W, H, FRAMES, FPS, ready: true, world, visions, puzzle, pov };
}

init().catch((e) => {
  console.error(e);
  window.EXPRNC = { error: String(e && e.stack ? e.stack : e) };
});
