// ---------------------------------------------------------------------------
// Monde : vide noir, sol miroir (réflexion floutée), éclairages, poussière
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ParticleField } from './dream.js';
import { noiseTexture } from './textures.js';

// Sol miroir : on rend la scène depuis une caméra symétrique dans une texture
// demi-résolution, puis le sol l'échantillonne avec un flou et un Fresnel.
export class MirrorFloor {
  constructor(W, H) {
    const rw = Math.round(W / 2), rh = Math.round(H / 2);
    this.rt = new THREE.WebGLRenderTarget(rw, rh, { type: THREE.HalfFloatType });
    this.vcam = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
    this.hidden = [];
    this.u = {
      tRefl: { value: this.rt.texture },
      textureMatrix: { value: this.textureMatrix },
      uCam: { value: new THREE.Vector3() },
      uStrength: { value: 0.55 },
      uTexel: { value: new THREE.Vector2(1 / rw, 1 / rh) },
      uFade: { value: 9 },
      uPoolPos: { value: new THREE.Vector3(0, 0, -18.75) },
      uPoolColor: { value: new THREE.Color(0, 0, 0) },
      uPoolR: { value: 0.9 },
      tNoise: { value: noiseTexture(256, 8) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: /* glsl */ `
        uniform mat4 textureMatrix; varying vec4 vR; varying vec3 vW;
        void main(){ vR = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tRefl, tNoise; uniform vec3 uCam; uniform float uStrength, uFade, uPoolR; uniform vec2 uTexel;
        uniform vec3 uPoolPos, uPoolColor;
        varying vec4 vR; varying vec3 vW;
        void main(){
          vec2 uv = vR.xy / vR.w;
          float n = texture2D(tNoise, vW.xz * 1.7).r;
          uv += (n - 0.5) * uTexel * 3.0;
          vec3 c = vec3(0.0);
          const int K = 12;
          for (int i = 0; i < K; i++) {
            float a = float(i) * 2.39996 + n * 6.28;
            float r = sqrt((float(i) + 0.5) / float(K)) * 3.5;
            c += texture2D(tRefl, uv + vec2(cos(a), sin(a)) * r * uTexel).rgb;
          }
          c /= float(K);
          vec3 V = normalize(uCam - vW);
          float fres = 0.12 + 0.88 * pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
          float d = length(vW.xz - uCam.xz);
          vec3 col = c * uStrength * fres * exp(-d / uFade);
          float pd = length(vW.xz - uPoolPos.xz);
          col += uPoolColor * exp(-pd * pd / (uPoolR * uPoolR)) * (0.8 + 0.4 * texture2D(tNoise, vW.xz * 2.3).r);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = -1;
    this.enabled = true;
    // temporaires
    this._v = {
      rp: new THREE.Vector3(), cp: new THREE.Vector3(), n: new THREE.Vector3(), rot: new THREE.Matrix4(),
      view: new THREE.Vector3(), look: new THREE.Vector3(), target: new THREE.Vector3(),
      plane: new THREE.Plane(), clip: new THREE.Vector4(), q: new THREE.Vector4(),
    };
  }

  render(renderer, scene, camera) {
    const v = this._v;
    this.u.uCam.value.setFromMatrixPosition(camera.matrixWorld);
    if (!this.enabled || this.u.uStrength.value <= 0.001) return;
    const m = this.mesh;
    m.updateMatrixWorld();
    v.rp.setFromMatrixPosition(m.matrixWorld);
    v.cp.setFromMatrixPosition(camera.matrixWorld);
    v.rot.extractRotation(m.matrixWorld);
    v.n.set(0, 0, 1).applyMatrix4(v.rot);
    v.view.subVectors(v.rp, v.cp);
    if (v.view.dot(v.n) > 0) return;
    v.view.reflect(v.n).negate().add(v.rp);
    v.rot.extractRotation(camera.matrixWorld);
    v.look.set(0, 0, -1).applyMatrix4(v.rot).add(v.cp);
    v.target.subVectors(v.rp, v.look).reflect(v.n).negate().add(v.rp);
    const vc = this.vcam;
    vc.position.copy(v.view);
    vc.up.set(0, 1, 0).applyMatrix4(v.rot).reflect(v.n);
    vc.lookAt(v.target);
    vc.far = camera.far;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse).multiply(m.matrixWorld);
    // plan de coupe oblique
    v.plane.setFromNormalAndCoplanarPoint(v.n, v.rp).applyMatrix4(vc.matrixWorldInverse);
    v.clip.set(v.plane.normal.x, v.plane.normal.y, v.plane.normal.z, v.plane.constant);
    const pm = vc.projectionMatrix.elements;
    v.q.x = (Math.sign(v.clip.x) + pm[8]) / pm[0];
    v.q.y = (Math.sign(v.clip.y) + pm[9]) / pm[5];
    v.q.z = -1.0;
    v.q.w = (1.0 + pm[10]) / pm[14];
    v.clip.multiplyScalar(2.0 / v.clip.dot(v.q));
    pm[2] = v.clip.x;
    pm[6] = v.clip.y;
    pm[10] = v.clip.z + 1.0 - 0.003;
    pm[14] = v.clip.w;
    m.visible = false;
    this.hidden.forEach((o) => (o.userData._v = o.visible, (o.visible = false)));
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, true);
    renderer.render(scene, vc);
    renderer.setRenderTarget(prev);
    this.hidden.forEach((o) => (o.visible = o.userData._v));
    m.visible = true;
  }
}

// Kit de 3 lumières (spot principal + 2 ponctuelles colorées) piloté par vision
export class LightRig {
  constructor(scene) {
    this.key = new THREE.SpotLight(0xffffff, 0, 0, 0.7, 0.9, 0);
    this.a = new THREE.PointLight(0xffffff, 0, 0, 2);
    this.b = new THREE.PointLight(0xffffff, 0, 0, 2);
    scene.add(this.key, this.key.target, this.a, this.b);
  }
  // cfg en coordonnées locales de la vision (Object3D 'frame')
  apply(frame, cfg, k) {
    const m = frame.matrixWorld;
    const P = (p) => new THREE.Vector3(...p).applyMatrix4(m);
    this.key.position.copy(P(cfg.key.pos));
    this.key.target.position.copy(P(cfg.key.target || [0, 0, 0]));
    this.key.target.updateMatrixWorld();
    this.key.color.set(cfg.key.color);
    this.key.intensity = cfg.key.intensity * k;
    this.key.angle = cfg.key.angle || 0.7;
    this.a.position.copy(P(cfg.a.pos));
    this.a.color.set(cfg.a.color);
    this.a.intensity = cfg.a.intensity * k;
    this.b.position.copy(P(cfg.b.pos));
    this.b.color.set(cfg.b.color);
    this.b.intensity = cfg.b.intensity * k;
  }
  off() {
    this.key.intensity = this.a.intensity = this.b.intensity = 0;
  }
}

export class World {
  constructor(renderer, W, H) {
    this.r = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(55, W / H, 0.03, 300);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.3;
    this.floor = new MirrorFloor(W, H);
    this.scene.add(this.floor.mesh);
    this.rigs = [new LightRig(this.scene), new LightRig(this.scene)];
    this.hemi = new THREE.HemisphereLight(0xfff4ea, 0x000000, 0.06);
    this.scene.add(this.hemi);
    // poussière ambiante le long du couloir de rêve
    this.dust = new ParticleField({
      count: 900,
      box: [[-7, 0.1, -26], [7, 4.5, 4]],
      colors: ['#fff1de', '#ffe2c4', '#dfe8ff'],
      size: [1.5, 5],
      seed: 77,
      mode: 0,
      speed: 0.6,
      alpha: [0.08, 0.35],
      twinkle: 0.5,
      H,
    });
    this.scene.add(this.dust.points);
  }
}
