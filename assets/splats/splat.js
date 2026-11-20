// Pixel-art gaussian splat renderer.
// Splats are drawn into a small offscreen target, then upscaled with nearest
// filtering and snapped to a palette with ordered (Bayer) dithering.
import * as THREE from '../vendor/three.module.min.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { SCENES } from './scenes.js';

THREE.ColorManagement.enabled = false;

const COMMON_VERT = /* glsl */`
  uniform float uTime;
  uniform float uAssemble;
  uniform float uPx;          // render-target height * 0.5 * projection[1][1]
  attribute vec3 col;
  attribute float size;
  attribute float emit;
  attribute vec3 meta;        // x: group, y: param along part, z: index/seed
  attribute vec3 scatter;
  varying vec3 vColor;
  varying float vSize;
  varying float vAlpha;
  float hash(float n){ return fract(sin(n) * 43758.5453); }
  vec3 rotY(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(c*p.x+s*p.z, p.y, -s*p.x+c*p.z); }
  vec3 rotZ(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(c*p.x-s*p.y, s*p.x+c*p.y, p.z); }
  vec3 rotX(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(p.x, c*p.y-s*p.z, s*p.y+c*p.z); }
  float assembleK(){
    float k = clamp(uAssemble * 1.7 - hash(meta.z * 1.37 + position.x * 9.1) * 0.7, 0.0, 1.0);
    return k * k * (3.0 - 2.0 * k);
  }
`;

const SOLID_VERT = (anim) => COMMON_VERT + /* glsl */`
  uniform vec3 uLight;
  uniform vec3 uLightColor;
  uniform vec3 uAmbient;
  uniform vec3 uRim;
  uniform vec3 uFogColor;
  uniform vec3 uFog; // near, far, max
  ${anim}
  void main(){
    vec3 p = position; vec3 n = normal; vec3 c = col; float e = emit; float s = size;
    animate(p, n, c, e, s, meta, uTime);
    p = mix(p + scatter, p, assembleK());
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vSize = max(1.0, s * uPx / -mv.z);
    gl_PointSize = vSize;
    vec3 N = normalize(normalMatrix * n);
    vec3 L = normalize((viewMatrix * vec4(uLight, 0.0)).xyz);
    float diff = max(dot(N, L), 0.0);
    float wrap = max(dot(N, L) * 0.5 + 0.5, 0.0);
    float rim = pow(1.0 - abs(dot(N, normalize(-mv.xyz))), 3.0);
    vec3 lit = c * (uAmbient + uLightColor * (diff * 0.75 + wrap * 0.25)) + uRim * rim * (0.4 + c);
    vColor = mix(lit, c * 1.25, clamp(e, 0.0, 1.0)) + c * max(e - 1.0, 0.0);
    vColor = mix(vColor, uFogColor, clamp((-mv.z - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0) * uFog.z);
    vAlpha = 1.0;
  }
`;

const SOLID_FRAG = /* glsl */`
  varying vec3 vColor;
  varying float vSize;
  void main(){
    vec2 d = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(d, d);
    float g = exp(-r2 * 2.2);
    if (vSize > 2.5 && g < 0.38) discard;
    gl_FragColor = vec4(vColor * (0.78 + 0.22 * g), 1.0);
  }
`;

const SOFT_VERT = (anim) => COMMON_VERT + /* glsl */`
  attribute float alpha;
  ${anim}
  void main(){
    vec3 p = position; vec3 c = col; float a = alpha; float s = size;
    animateSoft(p, c, a, s, meta, uTime);
    p = mix(p + scatter, p, assembleK());
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vSize = max(1.0, s * uPx / -mv.z);
    gl_PointSize = vSize;
    vColor = c;
    vAlpha = a * smoothstep(0.6, 1.0, uAssemble);
  }
`;

const SOFT_FRAG = /* glsl */`
  varying vec3 vColor;
  varying float vSize;
  varying float vAlpha;
  void main(){
    vec2 d = gl_PointCoord * 2.0 - 1.0;
    float g = vSize < 2.5 ? 1.0 : exp(-dot(d, d) * 3.0);
    gl_FragColor = vec4(vColor, g * vAlpha);
  }
`;

const POST_VERT = /* glsl */`
  void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const POST_FRAG = /* glsl */`
  uniform sampler2D tSrc;
  uniform float uScale;
  uniform vec2 uOffset;
  uniform vec3 uPal[32];
  uniform int uPalN;
  uniform float uDither;
  const float B[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  void main(){
    ivec2 px = ivec2((gl_FragCoord.xy - uOffset) / uScale);
    vec3 c = texelFetch(tSrc, px, 0).rgb;
    float b = B[(px.x & 3) + (px.y & 3) * 4] / 16.0 - 0.47;
    c += b * uDither * smoothstep(0.03, 0.14, max(c.r, max(c.g, c.b)));
    float best = 1e9; vec3 outc = c;
    for (int i = 0; i < 32; i++){
      if (i >= uPalN) break;
      vec3 d = c - uPal[i];
      float rm = (c.r + uPal[i].r) * 0.5;
      float dist = (2.0 + rm) * d.r * d.r + 4.0 * d.g * d.g + (3.0 - rm) * d.b * d.b;
      if (dist < best){ best = dist; outc = uPal[i]; }
    }
    gl_FragColor = vec4(outc, 1.0);
  }
`;

function hexToRGB(h){
  const n = parseInt(h.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function buildPoints(cloud, material){
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(cloud.p, 3));
  if (cloud.n.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(cloud.n, 3));
  g.setAttribute('col', new THREE.Float32BufferAttribute(cloud.c, 3));
  g.setAttribute('size', new THREE.Float32BufferAttribute(cloud.s, 1));
  g.setAttribute('meta', new THREE.Float32BufferAttribute(cloud.m, 3));
  g.setAttribute('scatter', new THREE.Float32BufferAttribute(cloud.sc, 3));
  if (cloud.e.length) g.setAttribute('emit', new THREE.Float32BufferAttribute(cloud.e, 1));
  if (cloud.a.length) g.setAttribute('alpha', new THREE.Float32BufferAttribute(cloud.a, 1));
  const pts = new THREE.Points(g, material);
  pts.frustumCulled = false;
  return pts;
}

export function mount(canvas, name, opts = {}){
  const def = SCENES[name];
  if (!def) throw new Error('Unknown scene ' + name);
  const pixelHeight = opts.pixelHeight || def.pixelHeight || 200;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(1);

  const built = def.build();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(def.background);

  const uniforms = {
    uTime: { value: 0 },
    uAssemble: { value: opts.assemble === false || reduced ? 1 : 0 },
    uPx: { value: 100 },
    uLight: { value: new THREE.Vector3(...def.light).normalize() },
    uLightColor: { value: new THREE.Vector3(...def.lightColor) },
    uAmbient: { value: new THREE.Vector3(...def.ambient) },
    uRim: { value: new THREE.Vector3(...def.rim) },
    uFogColor: { value: new THREE.Vector3(...(def.fogColor || [0, 0, 0])) },
    uFog: { value: new THREE.Vector3(...(def.fog || [1, 2, 0])) },
  };

  const solidMat = new THREE.ShaderMaterial({
    uniforms, vertexShader: SOLID_VERT(def.solidAnim), fragmentShader: SOLID_FRAG,
  });
  scene.add(buildPoints(built.solid, solidMat));

  for (const layer of built.soft){
    const mat = new THREE.ShaderMaterial({
      uniforms, vertexShader: SOFT_VERT(def.softAnim), fragmentShader: SOFT_FRAG,
      transparent: true, depthWrite: false,
      blending: layer.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const pts = buildPoints(layer.cloud, mat);
    pts.renderOrder = layer.order || 1;
    scene.add(pts);
  }

  const camera = new THREE.PerspectiveCamera(def.fov || 35, 1, 0.1, 100);
  camera.position.set(...(opts.camera || def.camera));
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(...def.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = !!opts.zoom;
  controls.minDistance = def.minDistance || 3;
  controls.maxDistance = def.maxDistance || 10;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 1.75;
  controls.autoRotate = !reduced && !opts.still;
  controls.autoRotateSpeed = def.autoRotateSpeed || 0.6;
  controls.rotateSpeed = 0.6;
  controls.update();
  const az0 = controls.getAzimuthalAngle();
  // Pause the auto-rotation briefly while the user is dragging.
  let resumeTimer = 0;
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resumeTimer); });
  controls.addEventListener('end', () => { if (!reduced && !opts.still) resumeTimer = setTimeout(() => controls.autoRotate = true, 2500); });

  const rt = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true,
  });

  const pal = def.palette.map(hexToRGB);
  while (pal.length < 32) pal.push(new THREE.Vector3());
  const postMat = new THREE.ShaderMaterial({
    uniforms: {
      tSrc: { value: rt.texture },
      uScale: { value: 3 },
      uOffset: { value: new THREE.Vector2() },
      uPal: { value: pal },
      uPalN: { value: def.palette.length },
      uDither: { value: def.dither ?? 0.09 },
    },
    vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
  });
  const postScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
  quad.frustumCulled = false;
  postScene.add(quad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    renderer.setSize(w, h, false);
    const scale = Math.max(2, Math.round(h / pixelHeight));
    const rw = Math.ceil(w / scale), rh = Math.ceil(h / scale);
    rt.setSize(rw, rh);
    postMat.uniforms.uScale.value = scale;
    // centre the slightly-oversized low-res image
    postMat.uniforms.uOffset.value.set((w - rw * scale) / 2, (h - rh * scale) / 2);
    camera.aspect = rw / rh;
    camera.updateProjectionMatrix();
    uniforms.uPx.value = rh * 0.5 * camera.projectionMatrix.elements[5];
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  let visible = true, raf = 0, last = performance.now(), t = def.startTime || 0, disposed = false;
  const io = new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });
  io.observe(canvas);
  const onVis = () => { if (!document.hidden && visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  document.addEventListener('visibilitychange', onVis);

  function draw(){
    if (def.swayRange){ // ping-pong around the starting angle instead of a full turn
      const az = controls.getAzimuthalAngle(), sp = Math.abs(controls.autoRotateSpeed);
      if (az > az0 + def.swayRange) controls.autoRotateSpeed = sp;
      else if (az < az0 - def.swayRange) controls.autoRotateSpeed = -sp;
    }
    controls.update();
    uniforms.uTime.value = t;
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
  }

  function frame(now){
    raf = 0;
    if (disposed) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!reduced) t += dt;
    if (uniforms.uAssemble.value < 1) uniforms.uAssemble.value = Math.min(1, uniforms.uAssemble.value + dt / 2.6);
    draw();
    if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    renderOnce(time){ if (time != null) t = time; draw(); },
    setAssemble(v){ uniforms.uAssemble.value = v; },
    dispose(){
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      controls.dispose();
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      postMat.dispose(); rt.dispose(); renderer.dispose();
    },
  };
}

export const SCENE_NAMES = Object.keys(SCENES);
