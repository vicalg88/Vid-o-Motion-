// ---------------------------------------------------------------------------
// Caméra subjective (POV) : marche, balancement de tête, regards vers les
// visions, trébuchement, ramassage des pièces (le regard suit la pièce),
// recul final.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { CUES, WALK_SPEED, clamp, mix, smoothstep, monotoneCubic, noise1 } from '../timeline.js';

const T_THR = CUES.threshold;
export const Z_STUMBLE = -(CUES.stumble - T_THR) * WALK_SPEED; // ≈ -17.6
export const Z_STAND = Z_STUMBLE - 0.38;
export const Z_FLOOR_PIECES = Z_STAND - 0.72;
export const Z_WALL = Z_STAND - 0.86;
export const Z_END = Z_STAND + 0.42;
export const LOGO_Y = 1.66;

// position le long du couloir (z) — vitesse constante entre la porte et le trébuchement
const ZK = (() => {
  const k = [
    [0, 3.15],
    [0.45, 3.08],
    [1.2, 1.75],
    [T_THR, 0],
  ];
  for (let t = T_THR + 1; t < CUES.stumble; t += 1) k.push([t, -(t - T_THR) * WALK_SPEED]);
  k.push([CUES.stumble, Z_STUMBLE]);
  k.push([CUES.stumble + 0.22, Z_STUMBLE - 0.3]);
  k.push([CUES.lookDown + 0.35, Z_STAND]);
  k.push([CUES.stepBack, Z_STAND]);
  k.push([CUES.stepBack + 0.95, Z_END]);
  k.push([23, Z_END + 0.06]);
  return { t: k.map((a) => a[0]), v: k.map((a) => a[1]) };
})();

// hauteur des yeux (s'accroupit pour ramasser la 1re pièce, se penche un peu pour les autres)
const P1 = CUES.pick1, P2 = CUES.pick2, P3 = CUES.pick3;
const YK = {
  t: [0, CUES.stumble, CUES.stumble + 0.13, CUES.lookDown + 0.2, P1[0] + 0.15, P1[0] + 0.42, P1[0] + 1.0, P2[0], P2[0] + 0.25, P2[0] + 0.7, P3[0], P3[0] + 0.25, P3[0] + 0.7, 23],
  v: [1.62, 1.62, 1.44, 1.3, 1.18, 1.18, 1.6, 1.6, 1.5, 1.6, 1.6, 1.5, 1.6, 1.6],
};
// inclinaison de base après le trébuchement (le regard suit ensuite la pièce tenue)
const PK = {
  t: [CUES.stumble, CUES.stumble + 0.12, CUES.stumble + 0.3, CUES.lookDown + 0.25, 23],
  v: [-0.06, -0.62, -0.5, -0.98, -0.98],
};

export function camZAt(t) {
  return monotoneCubic(ZK.t, ZK.v, t);
}
export function walkSpeedAt(t) {
  const dt = 0.02;
  return (camZAt(t - dt) - camZAt(t + dt)) / (2 * dt);
}

const aim = (from, to) => {
  const d = to.clone().sub(from);
  return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) };
};

export class POV {
  constructor(camera, visions) {
    this.cam = camera;
    this.visions = visions; // [{ center: Vector3, window: [a,b] }]
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.state = { yaw: 0, pitch: 0, look: -1, lookW: 0 };
    this.pos = new THREE.Vector3();
  }

  // 1) position (indépendante de l'orientation)
  position(t) {
    const z = camZAt(t);
    const speed = clamp(walkSpeedAt(t) / WALK_SPEED, 0, 1.3);
    const walking = speed * (1 - smoothstep(CUES.stumble - 0.1, CUES.stumble + 0.05, t));
    const phase = 2 * Math.PI * 1.7 * t;
    this.walking = walking;
    this.phase = phase;
    const pos = this.pos.set(0.013 * Math.sin(phase / 2) * walking, monotoneCubic(YK.t, YK.v, t) + 0.021 * Math.cos(phase) * walking, z);
    if (t >= CUES.stumble) {
      const ts = t - CUES.stumble;
      const sh = Math.exp(-ts * 9) * 0.025;
      pos.y += noise1(t * 30, 11) * sh;
      pos.x += noise1(t * 30, 12) * sh;
    }
    return pos;
  }

  // 2) orientation ; focus = { p: Vector3, w } (pièce suivie du regard) ou null
  orient(t, focus) {
    const cam = this.cam;
    const pos = this.pos;
    let yaw = 0;
    let pitch = -0.035;
    let lookW = 0;
    let look = -1;
    this.visions.forEach((v, i) => {
      const [a, b] = v.window;
      const w = smoothstep(a - 0.12, a + 0.62, t) * (1 - smoothstep(b - 0.62, b + 0.06, t));
      if (w > lookW) {
        lookW = w;
        look = i;
      }
      if (w <= 0) return;
      const ai = aim(pos, v.center.clone().add(new THREE.Vector3(0, -0.24, 0)));
      yaw += clamp(ai.yaw, -1.5, 1.5) * w;
      pitch = mix(pitch, ai.pitch, w);
    });
    yaw += noise1(t * 0.7, 3) * 0.012 + noise1(t * 2.3, 5) * 0.004;
    pitch += noise1(t * 0.6, 7) * 0.008;
    let roll = 0.009 * Math.sin(this.phase / 2) * this.walking;

    if (t >= CUES.stumble) {
      const k = smoothstep(CUES.stumble - 0.02, CUES.stumble + 0.1, t);
      pitch = mix(pitch, monotoneCubic(PK.t, PK.v, t), k);
      const ts = t - CUES.stumble;
      roll += 0.11 * Math.exp(-ts * 5.5) * Math.sin(ts * 15);
      yaw += 0.07 * Math.exp(-ts * 4.5) * Math.sin(ts * 11);
      yaw *= 1 - smoothstep(CUES.stumble + 0.3, CUES.lookDown + 0.5, t);
    }
    // le regard suit la pièce que l'on tient
    if (focus && focus.w > 0) {
      const a = aim(pos, focus.p);
      pitch = mix(pitch, a.pitch, focus.w);
      yaw = mix(yaw, a.yaw * 0.55, focus.w);
    }
    // à la fin : centrage sur le logo
    if (t >= CUES.stepBack - 0.6) {
      const k = smoothstep(CUES.stepBack - 0.6, CUES.stepBack + 0.9, t);
      const a = aim(pos, new THREE.Vector3(0, LOGO_Y - 0.075, Z_WALL));
      pitch = mix(pitch, a.pitch, k);
      yaw = mix(yaw, 0, k);
      roll = mix(roll, 0, k);
    }

    let fov = 56 - 4 * lookW;
    fov = mix(fov, 50, smoothstep(CUES.lookDown, CUES.pick1[0] + 0.4, t));
    fov = mix(fov, 38, smoothstep(CUES.stepBack - 0.1, CUES.stepBack + 1.0, t));

    cam.position.copy(pos);
    this.euler.set(pitch, yaw, roll, 'YXZ');
    cam.quaternion.setFromEuler(this.euler);
    cam.fov = fov;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    Object.assign(this.state, { yaw, pitch, look, lookW });
    return this.state;
  }
}
