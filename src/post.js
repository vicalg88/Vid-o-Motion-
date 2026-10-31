// ---------------------------------------------------------------------------
// Post-production : accumulation (flou de mouvement), profondeur de champ,
// bloom, tone-mapping neutre, vignette, aberration chromatique, grain.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Post {
  constructor(renderer, W, H) {
    this.r = renderer;
    this.W = W;
    this.H = H;
    const hf = THREE.HalfFloatType;
    this.rtScene = new THREE.WebGLRenderTarget(W, H, { type: hf, samples: 4 });
    this.rtAccum = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, depthBuffer: false });
    this.rtDepth = new THREE.WebGLRenderTarget(W, H, {
      type: THREE.FloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.rtDof = new THREE.WebGLRenderTarget(W, H, { type: hf, depthBuffer: false });
    this.bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.3, 0.42, 1.0);

    this.quadAdd = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: { tSrc: { value: null }, uW: { value: 1 } },
        vertexShader: VS,
        fragmentShader: /* glsl */ `uniform sampler2D tSrc; uniform float uW; varying vec2 vUv;
          void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).rgb * uW, 1.0); }`,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        blendEquation: THREE.AddEquation,
        depthTest: false,
        depthWrite: false,
      })
    );

    this.depthMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `varying float vD; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `varying float vD; void main(){ gl_FragColor = vec4(vD, 0.0, 0.0, 1.0); }`,
    });

    this.quadDof = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: {
          tColor: { value: null },
          tDepth: { value: null },
          uRes: { value: new THREE.Vector2(W, H) },
          uFocus: { value: 25 },
          uAperture: { value: 0 },
          uMaxCoc: { value: 14 },
        },
        vertexShader: VS,
        fragmentShader: /* glsl */ `
          uniform sampler2D tColor, tDepth; uniform vec2 uRes; uniform float uFocus, uAperture, uMaxCoc;
          varying vec2 vUv;
          float coc(float d){ return clamp(uAperture * abs(d - uFocus) / d, 0.0, uMaxCoc); }
          float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
          void main(){
            float dC = texture2D(tDepth, vUv).r;
            float cC = coc(dC);
            vec3 acc = vec3(0.0);
            float ws = 0.0;
            float rot = hash(gl_FragCoord.xy) * 6.2831853;
            const int N = 56;
            for (int i = 0; i < N; i++) {
              float fi = float(i) + 0.5;
              float r = sqrt(fi / float(N)) * uMaxCoc;
              float a = fi * 2.39996323 + rot;
              vec2 uv = vUv + vec2(cos(a), sin(a)) * r / uRes;
              float dS = texture2D(tDepth, uv).r;
              float cS = coc(dS);
              float cEff = dS > dC + 0.05 ? min(cS, cC) : cS;
              float w = clamp(cEff - r + 1.0, 0.0, 1.0);
              acc += texture2D(tColor, uv).rgb * w;
              ws += w;
            }
            vec3 c0 = texture2D(tColor, vUv).rgb;
            acc += c0 * 0.5; ws += 0.5;
            gl_FragColor = vec4(acc / ws, 1.0);
          }`,
        depthTest: false,
        depthWrite: false,
      })
    );

    this.quadFinal = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: {
          tColor: { value: null },
          tOverlay: { value: null },
          uRes: { value: new THREE.Vector2(W, H) },
          uTone: { value: 0 },
          uExposure: { value: 1 },
          uVignette: { value: 0.35 },
          uGrain: { value: 0.03 },
          uSeed: { value: 0 },
          uCA: { value: 0.006 },
          uFade: { value: 0 },
          uFlash: { value: 0 },
          uOverlay: { value: 1 },
          uSat: { value: 1.0 },
        },
        vertexShader: VS,
        fragmentShader: /* glsl */ `
          uniform sampler2D tColor, tOverlay; uniform vec2 uRes;
          uniform float uTone, uExposure, uVignette, uGrain, uSeed, uCA, uFade, uOverlay, uSat, uFlash;
          varying vec2 vUv;
          vec3 neutral(vec3 color){
            const float StartCompression = 0.8 - 0.04;
            const float Desaturation = 0.15;
            float x = min(color.r, min(color.g, color.b));
            float offset = (x < 0.08 ? x - 6.25 * x * x : 0.04) * 0.25;
            color -= offset;
            float peak = max(color.r, max(color.g, color.b));
            if (peak < StartCompression) return color;
            float d = 1.0 - StartCompression;
            float newPeak = 1.0 - d * d / (peak + d - StartCompression);
            color *= newPeak / peak;
            float g = 1.0 - 1.0 / (Desaturation * (peak - newPeak) + 1.0);
            return mix(color, vec3(newPeak), g);
          }
          vec3 toSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
          float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
          void main(){
            vec2 d = vUv - 0.5;
            vec2 off = d * dot(d, d) * uCA;
            vec3 c = vec3(texture2D(tColor, vUv - off).r, texture2D(tColor, vUv).g, texture2D(tColor, vUv + off).b);
            c += vec3(1.0, 0.95, 0.88) * uFlash * 3.0;
            vec3 tm = neutral(c * uExposure);
            c = mix(c, tm, uTone);
            float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
            c = mix(vec3(l), c, uSat);
            float v = smoothstep(0.9, 0.22, length(d * vec2(1.0, 0.92)));
            c *= mix(1.0, v, uVignette);
            vec3 s = toSRGB(c);
            vec4 o = texture2D(tOverlay, vUv);
            s = mix(s, o.rgb, o.a * uOverlay);
            vec2 fc = gl_FragCoord.xy;
            float g = hash(fc + uSeed * 37.13) + hash(fc * 1.31 + uSeed * 11.7 + 7.0) - 1.0;
            float lum = dot(s, vec3(0.3333));
            s += g * uGrain * (0.55 + 0.45 * (1.0 - abs(lum - 0.45) * 1.8));
            s *= 1.0 - uFade;
            gl_FragColor = vec4(s, 1.0);
          }`,
        depthTest: false,
        depthWrite: false,
      })
    );
  }

  clearAccum() {
    const r = this.r;
    r.setRenderTarget(this.rtAccum);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
  }

  accumulate(tex, w) {
    const m = this.quadAdd.material;
    m.uniforms.tSrc.value = tex;
    m.uniforms.uW.value = w;
    this.r.setRenderTarget(this.rtAccum);
    this.quadAdd.render(this.r);
  }

  renderScene(scene, camera) {
    const r = this.r;
    r.setRenderTarget(this.rtScene);
    r.setClearColor(scene.background, 1);
    r.clear(true, true, true);
    r.render(scene, camera);
  }

  renderDepth(scene, camera, hidden = []) {
    const r = this.r;
    const bg = scene.background;
    const fog = scene.fog;
    scene.background = null;
    scene.fog = null;
    scene.overrideMaterial = this.depthMat;
    hidden.forEach((o) => (o.visible = false));
    const shadow = r.shadowMap.enabled;
    r.shadowMap.enabled = false;
    r.setRenderTarget(this.rtDepth);
    r.setClearColor(new THREE.Color(1000, 0, 0), 1);
    r.clear(true, true, false);
    r.render(scene, camera);
    r.shadowMap.enabled = shadow;
    hidden.forEach((o) => (o.visible = true));
    scene.overrideMaterial = null;
    scene.background = bg;
    scene.fog = fog;
  }

  dof(src, focus, aperture, maxCoc) {
    const u = this.quadDof.material.uniforms;
    u.tColor.value = src.texture;
    u.tDepth.value = this.rtDepth.texture;
    u.uFocus.value = focus;
    u.uAperture.value = aperture;
    u.uMaxCoc.value = maxCoc;
    this.r.setRenderTarget(this.rtDof);
    this.quadDof.render(this.r);
    return this.rtDof;
  }

  applyBloom(rt, strength, threshold = 0.9) {
    if (strength <= 0) return;
    this.bloom.strength = strength;
    this.bloom.threshold = threshold;
    this.bloom.render(this.r, null, rt, 0, false);
  }

  final(src, overlayTex, o) {
    const u = this.quadFinal.material.uniforms;
    u.tColor.value = src.texture;
    u.tOverlay.value = overlayTex;
    for (const k of Object.keys(o)) if (u[k]) u[k].value = o[k];
    this.r.setRenderTarget(null);
    this.quadFinal.render(this.r);
  }
}
