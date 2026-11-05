import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* =========================================================
   RENDERER / SCENE / CAMERA
   (no preserveDrawingBuffer: it forces an extra copy every frame;
    snapshots are taken right after rendering instead)
   ========================================================= */
const BASE_PR = Math.min(window.devicePixelRatio || 1, 1.5);
let curPR = BASE_PR;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(curPR);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c8ff);
scene.fog = new THREE.Fog(0x87c8ff, 28, 125);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(9, 4, 9);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;
controls.minDistance = 3;
controls.maxDistance = 40;
controls.target.set(2, 1, 1);

/* Lights */
const hemi = new THREE.HemisphereLight(0x87c8ff, 0x3a5a2a, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera;
sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 80;
scene.add(sun, sun.target);

/* Ground */
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(80, 48),
  new THREE.MeshStandardMaterial({ color: 0x4f8a3a, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/* Stars */
const stars = (() => {
  const n = 1500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 300;
    const s = Math.sqrt(1 - u * u);
    pos[i*3] = r * s * Math.cos(th); pos[i*3+1] = r * Math.abs(u) * 0.9 + 20; pos[i*3+2] = r * s * Math.sin(th);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: true, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const p = new THREE.Points(g, m); scene.add(p); return p;
})();

/* =========================================================
   HELPERS
   ========================================================= */
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _dir = new THREE.Vector3();
const _t1 = new THREE.Vector3(), _axis = new THREE.Vector3(), _q = new THREE.Quaternion();
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const easeOutBack = x => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const easeOutCubic = x => 1 - Math.pow(1 - x, 3);
const easeInOut = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const GOLDEN = THREE.MathUtils.degToRad(137.5);

function trunkPoint(y, out = new THREE.Vector3()) {
  return out.set(
    Math.sin(y * 0.045) * 1.6 + Math.sin(y * 0.11 + 1) * 0.4,
    y,
    Math.cos(y * 0.037) * 1.3 + Math.sin(y * 0.09) * 0.3
  );
}

/* =========================================================
   TREE (trunk segments + bud + leaves)
   ========================================================= */
const AHEAD = 38;      // how far the tree grows above the ball
const BEHIND = 32;     // how far below the ball we keep geometry
let treeH = 2, nextLeafY = 1.8, leafCounter = 0;
const SEG = 0.6;
const segGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
const barkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 });
let segments = [];

function trunkRadius(y) { return clamp(0.14 + (treeH - y) * 0.012, 0.14, 0.5); }
function makeSeg(y0, y1) {
  const mesh = new THREE.Mesh(segGeo, barkMat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  const s = { mesh, y0, y1 }; return s;
}
function placeSeg(s) {
  trunkPoint(s.y0, _a); trunkPoint(s.y1, _b);
  const len = _a.distanceTo(_b);
  s.mesh.position.addVectors(_a, _b).multiplyScalar(0.5);
  _dir.subVectors(_b, _a).normalize();
  s.mesh.quaternion.setFromUnitVectors(UP, _dir);
  const r = trunkRadius((s.y0 + s.y1) / 2);
  s.mesh.scale.set(r, len + 0.04, r);
}

/* Bud */
const bud = new THREE.Mesh(
  new THREE.SphereGeometry(0.3, 20, 16),
  new THREE.MeshStandardMaterial({ color: 0x9cff6a, emissive: 0x4cff2a, emissiveIntensity: 0.9, roughness: 0.4 })
);
scene.add(bud);
const budLight = new THREE.PointLight(0x9cff6a, 1.5, 7);
scene.add(budLight);

/* Leaf geometry */
const leafGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.7, 0.85, 2.0, 0);
  s.quadraticCurveTo(0.7, -0.85, 0, 0);
  const g = new THREE.ShapeGeometry(s, 14);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, 0.25 * z * z + 0.04 * x);
  }
  g.computeVertexNormals();
  return g;
})();
const stemGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.32, 6);
const stemMat = new THREE.MeshStandardMaterial({ color: 0x5c8a2e, roughness: 0.8 });
let leaves = [];

function spawnLeaf(y) {
  const idx = leafCounter++;
  const root = new THREE.Group();
  trunkPoint(y, root.position);
  root.rotation.y = idx * GOLDEN;
  const pivot = new THREE.Group();
  root.add(pivot);
  const stem = new THREE.Mesh(stemGeo, stemMat);
  stem.rotation.z = Math.PI / 2; stem.position.x = 0.15;
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.27 + Math.random() * 0.07, 0.6, 0.33 + Math.random() * 0.1),
    side: THREE.DoubleSide, roughness: 0.6
  });
  const mesh = new THREE.Mesh(leafGeo, mat);
  mesh.position.x = 0.28; mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.scale.setScalar(0.001); stem.scale.setScalar(0.001);
  pivot.add(stem, mesh);
  scene.add(root);
  leaves.push({ idx, y, root, pivot, mesh, stem, mat, age: 0, sag: 0, sagV: 0, phase: Math.random() * 10, size: 0.95 + Math.random() * 0.25 });
}
function getLeaf(idx) {
  if (!leaves.length) return null;
  return leaves[idx - leaves[0].idx] || null;
}
const GROUND_POINT = new THREE.Vector3(2.8, 0, 2.6);
function getLandPoint(idx, out) {
  const L = idx >= 0 ? getLeaf(idx) : null;
  if (!L) return out.copy(GROUND_POINT);
  L.root.updateMatrixWorld(true);
  const s = L.mesh.scale.x;
  return L.pivot.localToWorld(out.set(0.28 + 1.0 * s, 0.04 * s + 0.01, 0));
}
function updateLeaf(L, h) {
  L.age += h;
  const g = clamp(L.age / 0.8, 0, 1);
  const s = Math.max(easeOutBack(g) * L.size, 0.001);
  L.mesh.scale.setScalar(s); L.stem.scale.setScalar(Math.max(s, 0.001));
  const pitch = lerp(1.35, 0.12, easeOutCubic(g));
  const target = (ball.mode === 'rest' && ball.cur === L.idx) ? -0.14 : 0;
  L.sagV += ((target - L.sag) * 70 - L.sagV * 7) * h;
  L.sag += L.sagV * h;
  const sway = Math.sin(simTime * 1.4 + L.phase) * 0.04 + Math.sin(simTime * 2.3 + L.phase * 2) * 0.02;
  L.pivot.rotation.z = pitch + L.sag + sway;
  L.pivot.rotation.x = Math.sin(simTime * 1.1 + L.phase) * 0.06;
}

/* =========================================================
   BALL
   ========================================================= */
const R = 0.35;
const ballTex = (() => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  const cols = ['#ef4444', '#ffffff', '#3b82f6', '#facc15', '#ffffff', '#22c55e'];
  cols.forEach((col, i) => { x.fillStyle = col; x.fillRect(i * 512 / 6, 0, 512 / 6 + 1, 256); });
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 512, 22); x.fillRect(0, 234, 512, 22);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const ballGroup = new THREE.Group();
const squash = new THREE.Group();
const spinner = new THREE.Group();
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.35 }));
ballMesh.castShadow = true;
spinner.add(ballMesh); squash.add(spinner); ballGroup.add(squash); scene.add(ballGroup);

const ball = {
  mode: 'rest', cur: -1, to: -1, rest: 1.0, t: 0, dur: 0.6, h: 1,
  from: new THREE.Vector3(), surf: GROUND_POINT.clone(), prevSurf: GROUND_POINT.clone(),
  sq: 1, sqV: 0, vy: 0, twikDone: true
};
let jumps = 0;

function tryJump() {
  const cands = leaves.filter(L => L.idx > ball.cur && L.age > 0.6);
  if (!cands.length) { ball.rest = 0.08; return; }
  const n = cands.length;
  const step = n > 9 ? 3 : (n > 5 ? 2 : 1);
  const target = cands[Math.min(step, n) - 1];
  ball.from.copy(ball.surf);
  getLandPoint(target.idx, _t1);
  const dist = ball.from.distanceTo(_t1);
  ball.dur = 0.48 + dist * 0.055;
  ball.h = 0.8 + dist * 0.33;
  ball.to = target.idx; ball.t = 0; ball.mode = 'air';
  ball.twikDone = false;                            // landing sound gets scheduled ahead of time (see scheduleBallSound)
  const L = getLeaf(ball.cur); if (L) L.sagV += 2.4;   // leaf flicks on take-off
  ball.sqV += 4;
  // No sound on take-off. The twik is reserved for leaf contact.
}
function land() {
  ball.mode = 'rest'; ball.cur = ball.to;
  ball.rest = 0.22 + Math.random() * 0.5;           // random rest = no steady rhythm
  ball.sqV -= 7.5;
  const L = getLeaf(ball.cur);
  if (L) {
    L.sagV -= 3.2;
    if (!ball.twikDone) scheduleTwik(0);            // fallback only: normally it was already scheduled in the air
  }
  ball.twikDone = true;
  spawnSparks(ball.surf, 22);
  jumps++;
}
function simulateBall(h) {
  ball.prevSurf.copy(ball.surf);
  if (ball.mode === 'rest') {
    getLandPoint(ball.cur, ball.surf);
    ball.rest -= h;
    if (ball.rest <= 0) tryJump();
  } else {
    ball.t += h / ball.dur;
    const tt = Math.min(ball.t, 1);
    getLandPoint(ball.to, _t1);
    ball.surf.lerpVectors(ball.from, _t1, tt);
    ball.surf.y += ball.h * 4 * tt * (1 - tt);
    if (ball.t >= 1) land();
  }
  ball.sqV += ((1 - ball.sq) * 220 - ball.sqV * 9) * h;
  ball.sq = clamp(ball.sq + ball.sqV * h, 0.55, 1.45);

  const vx = (ball.surf.x - ball.prevSurf.x) / h, vz = (ball.surf.z - ball.prevSurf.z) / h;
  ball.vy = (ball.surf.y - ball.prevSurf.y) / h;
  const sp = Math.hypot(vx, vz);
  if (sp > 1e-4) {
    _axis.set(vz, 0, -vx).normalize();
    _q.setFromAxisAngle(_axis, sp * h / R);
    spinner.quaternion.premultiply(_q);
  }
}
function updateBallVisual() {
  const stretch = ball.mode === 'air' ? 1 + Math.min(Math.abs(ball.vy) * 0.022, 0.22) : 1;
  const sy = ball.sq * stretch, sxz = 1 / Math.sqrt(sy);
  squash.scale.set(sxz, sy, sxz);
  ballGroup.position.copy(ball.surf); ballGroup.position.y += R * sy;
}

/* =========================================================
   PARTICLES: sparks + pollen
   ========================================================= */
const SPARKS = 400;
const spPos = new Float32Array(SPARKS * 3).fill(-9999), spCol = new Float32Array(SPARKS * 3);
const spVel = new Float32Array(SPARKS * 3), spLife = new Float32Array(SPARKS), spBase = new Float32Array(SPARKS * 3);
let spHead = 0, sparkActive = 0;
const spGeo = new THREE.BufferGeometry();
spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
spGeo.setAttribute('color', new THREE.BufferAttribute(spCol, 3));
const sparks = new THREE.Points(spGeo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
sparks.frustumCulled = false; scene.add(sparks);
const sparkColors = [new THREE.Color(0xfff27a), new THREE.Color(0xb6ff6a), new THREE.Color(0xffffff)];
function spawnSparks(p, n) {
  sparkActive = 1.3;
  for (let k = 0; k < n; k++) {
    const i = spHead; spHead = (spHead + 1) % SPARKS;
    spPos[i*3] = p.x; spPos[i*3+1] = p.y + 0.05; spPos[i*3+2] = p.z;
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.5;
    spVel[i*3] = Math.cos(a) * s; spVel[i*3+1] = 1.5 + Math.random() * 3; spVel[i*3+2] = Math.sin(a) * s;
    spLife[i] = 0.6 + Math.random() * 0.5;
    const c = sparkColors[(Math.random() * 3) | 0];
    spBase[i*3] = c.r; spBase[i*3+1] = c.g; spBase[i*3+2] = c.b;
  }
}
function updateSparks(h) {
  if (sparkActive <= 0) return;                     // nothing alive: skip the loop and the GPU upload
  sparkActive -= h;
  for (let i = 0; i < SPARKS; i++) {
    if (spLife[i] <= 0) continue;
    spLife[i] -= h;
    if (spLife[i] <= 0) { spPos[i*3+1] = -9999; spCol[i*3] = spCol[i*3+1] = spCol[i*3+2] = 0; continue; }
    spVel[i*3+1] -= 6 * h;
    spPos[i*3] += spVel[i*3] * h; spPos[i*3+1] += spVel[i*3+1] * h; spPos[i*3+2] += spVel[i*3+2] * h;
    const f = Math.min(spLife[i] / 0.6, 1);
    spCol[i*3] = spBase[i*3] * f; spCol[i*3+1] = spBase[i*3+1] * f; spCol[i*3+2] = spBase[i*3+2] * f;
  }
  spGeo.attributes.position.needsUpdate = true; spGeo.attributes.color.needsUpdate = true;
}

const POLLEN = 250, BOX = 30;
const poPos = new Float32Array(POLLEN * 3), poVel = new Float32Array(POLLEN * 3);
for (let i = 0; i < POLLEN; i++) {
  poPos[i*3] = (Math.random() - .5) * BOX; poPos[i*3+1] = (Math.random() - .5) * BOX; poPos[i*3+2] = (Math.random() - .5) * BOX;
  poVel[i*3] = (Math.random() - .5) * .3; poVel[i*3+1] = Math.random() * .3 + .05; poVel[i*3+2] = (Math.random() - .5) * .3;
}
const poGeo = new THREE.BufferGeometry(); poGeo.setAttribute('position', new THREE.BufferAttribute(poPos, 3));
const pollen = new THREE.Points(poGeo, new THREE.PointsMaterial({ size: 0.07, color: 0xfff1b0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
pollen.frustumCulled = false; scene.add(pollen);
function updatePollen(dt, c) {
  for (let i = 0; i < POLLEN; i++) {
    for (let k = 0; k < 3; k++) {
      poPos[i*3+k] += poVel[i*3+k] * dt;
      const cc = k === 0 ? c.x : k === 1 ? c.y : c.z;
      if (poPos[i*3+k] - cc > BOX / 2) poPos[i*3+k] -= BOX;
      else if (poPos[i*3+k] - cc < -BOX / 2) poPos[i*3+k] += BOX;
    }
  }
  poGeo.attributes.position.needsUpdate = true;
}

/* =========================================================
   SKY CYCLE (repeats every 320 m of height → truly endless)
   ========================================================= */
const SKY = [[0, 0x87c8ff], [0.32, 0x87c8ff], [0.45, 0xffa96b], [0.55, 0x5a3d7a], [0.65, 0x0b1030], [0.86, 0x0b1030], [0.93, 0xff9fb0], [1.0, 0x87c8ff]]
  .map(([p, c]) => [p, new THREE.Color(c)]);
const NIGHT = [[0, 0], [0.5, 0], [0.62, 1], [0.88, 1], [0.95, 0], [1, 0]];
const skyCol = new THREE.Color(), white = new THREE.Color(0xffffff);
function keyLerp(keys, p) {
  for (let i = 0; i < keys.length - 1; i++) if (p >= keys[i][0] && p <= keys[i+1][0]) return [i, (p - keys[i][0]) / (keys[i+1][0] - keys[i][0])];
  return [keys.length - 2, 1];
}
let nightness = 0;
function updateSky(h) {
  const p = ((h % 320) + 320) % 320 / 320;
  const [i, f] = keyLerp(SKY, p);
  skyCol.copy(SKY[i][1]).lerp(SKY[i+1][1], f);
  const [j, g] = keyLerp(NIGHT, p);
  nightness = lerp(NIGHT[j][1], NIGHT[j+1][1], g);
  scene.background.copy(skyCol); scene.fog.color.copy(skyCol);
  hemi.color.copy(skyCol); hemi.intensity = lerp(0.9, 0.35, nightness);
  sun.color.copy(white).lerp(skyCol, 0.45);
  sun.intensity = lerp(1.8, 0.25, nightness);
  stars.material.opacity = nightness;
}

/* =========================================================
   OVERLAY: vignette + fade (drawn INTO the canvas → recorded)
   The recorded frame itself is exactly 9:16 or 16:9, edge to edge.
   Only rendered when something is actually visible.
   ========================================================= */
const overlay = new THREE.Scene();
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const vignetteTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 60, 128, 128, 182);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
})();
const vignette = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: vignetteTex, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
const fadeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
overlay.add(vignette, fadeQuad);
let vigAmt = 0, fade = 0, fadeTarget = 0;
function updateOverlay(dt) {
  const want = proChk.checked ? 1 : 0;
  vigAmt += (want - vigAmt) * (1 - Math.exp(-dt * 4));
  vignette.material.opacity = vigAmt; vignette.visible = vigAmt > 0.01;
  const fs = 1.3 * dt;
  fade = fade < fadeTarget ? Math.min(fadeTarget, fade + fs) : Math.max(fadeTarget, fade - fs);
  fadeQuad.material.opacity = fade; fadeQuad.visible = fade > 0.001;
  return vignette.visible || fadeQuad.visible;
}

/* =========================================================
   AUTO PROFESSIONAL CAMERA DIRECTOR
   - aspect-aware framing (portrait gets pulled back so the ball stays in frame)
   - intro: wide establishing shot, then a close tracking shot
   - outro: smooth crane-up during the last seconds of a timed recording
   ========================================================= */
const DUR = { establishing: [5, 7], tracking: [4, 6], lowHero: [3.5, 5], orbit: [5, 7], dollyIn: [4, 5.5], craneUp: [4.5, 6], topDown: [3.5, 5], reveal: [4.5, 6] };
const POOL = ['tracking', 'tracking', 'lowHero', 'orbit', 'dollyIn', 'craneUp', 'topDown', 'reveal', 'establishing'];
const NAMES = { establishing: 'Wide establishing', tracking: 'Close tracking', lowHero: 'Low-angle hero', orbit: 'Orbit sweep', dollyIn: 'Dolly-in', craneUp: 'Crane up', topDown: 'Top-down', reveal: 'Tilt-up reveal' };
const director = {
  type: null, last: null, t: 0, dur: 5, angle: 0, side: 1, cut: true, snap: false, outro: false, queue: [],
  camPos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 50,
  P: new THREE.Vector3(), L: new THREE.Vector3(), C: new THREE.Vector3(), d: new THREE.Vector3(), T: new THREE.Vector3(),
  start() {
    this.camPos.copy(camera.position); this.look.copy(controls.target); this.fov = camera.fov;
    this.outro = false; this.queue = [];
    this.next('establishing');
  },
  next(force, opt = {}) {
    const pick = () => POOL[(Math.random() * POOL.length) | 0];
    let ty = force;
    if (!ty && this.queue.length) ty = this.queue.shift();
    if (!ty) { ty = pick(); while (ty === this.last) ty = pick(); }
    this.type = ty; this.last = ty; this.t = 0;
    const [a, b] = DUR[ty]; this.dur = opt.dur || (a + Math.random() * (b - a));
    this.angle = Math.random() * Math.PI * 2;
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.cut = opt.cut !== undefined ? opt.cut : (force ? true : Math.random() < 0.6);   // mix of hard cuts and smooth glides
    this.snap = this.cut;
  },
  rot(v, a) { const c = Math.cos(a), s = Math.sin(a); return this.d.set(c * v.x - s * v.z, 0, s * v.x + c * v.z); },
  update(dt, B, budPos, advance) {
    if (advance) { this.t += dt; if (this.t > this.dur && !this.outro) this.next(); }
    const s = clamp(this.t / this.dur, 0, 1), e = easeInOut(s);
    const C = trunkPoint(B.y, this.C);
    const hd = _dir.set(B.x - C.x, 0, B.z - C.z);
    if (hd.lengthSq() < 1e-4) hd.set(1, 0, 0); hd.normalize();
    // In portrait the horizontal field of view is narrow, so pull back to keep the action framed.
    const fit = camera.aspect < 1 ? Math.pow(1 / camera.aspect, 0.5) : 1;
    const P = this.P, L = this.L; let fov = 50, a, r, d;
    switch (this.type) {
      case 'establishing': a = this.angle + s * 0.35 * this.side;
        P.set(C.x + Math.cos(a) * 24 * fit, B.y + 5 + s * 2, C.z + Math.sin(a) * 24 * fit); L.set(C.x, B.y + 4, C.z); fov = 38; break;
      case 'tracking': d = this.rot(hd, this.side * (0.75 + s * 0.25));
        P.copy(B).addScaledVector(d, 4.6 * fit); P.y += 1.3; L.copy(B); L.y += 0.5; fov = 50; break;
      case 'lowHero': d = this.rot(hd, this.side * 0.5);
        P.copy(B).addScaledVector(d, 3.8 * fit); P.y -= 3.2; L.copy(B); L.y += 1.8; fov = 62; break;
      case 'orbit': a = this.angle + e * 2.4 * this.side;
        P.set(C.x + Math.cos(a) * 8.5 * fit, B.y + 1.6, C.z + Math.sin(a) * 8.5 * fit); L.copy(B); fov = 45; break;
      case 'dollyIn': r = lerp(17, 5.2, e) * fit; d = this.rot(hd, this.side * 0.9);
        P.copy(B).addScaledVector(d, r); P.y += lerp(4, 1.2, e); L.copy(B); fov = 40; break;
      case 'craneUp': a = this.angle;
        P.set(C.x + Math.cos(a) * 9 * fit, B.y - 6 + e * 13, C.z + Math.sin(a) * 9 * fit); L.copy(B); L.y += 0.5 + e * 2; fov = 46; break;
      case 'topDown': a = this.angle + s * 0.6;
        P.set(C.x + Math.cos(a) * 2.2, B.y + 11 - e * 3, C.z + Math.sin(a) * 2.2); L.copy(B); fov = 55; break;
      case 'reveal': d = this.rot(hd, this.side * 1.1);
        P.copy(B).addScaledVector(d, 11 * fit); P.y += 0.5 + e * 2;
        // look up toward the growing bud, but never so far that the ball leaves the frame
        this.T.set(budPos.x, Math.min(budPos.y, B.y + 7), budPos.z);
        L.copy(B).lerp(this.T, e * 0.7); fov = 44; break;
    }
    if (this.snap) { this.camPos.copy(P); this.look.copy(L); this.fov = fov; this.snap = false; }
    else {
      const k = this.cut ? 5 : lerp(1.0, 5, clamp(this.t / 1.8, 0, 1));
      const al = 1 - Math.exp(-k * dt);
      this.camPos.lerp(P, al); this.look.lerp(L, al); this.fov += (fov - this.fov) * al;
    }
    const T = performance.now() / 1000;
    const amp = (this.type === 'tracking' || this.type === 'lowHero') ? 0.05 : 0.02;  // subtle handheld feel
    camera.position.copy(this.camPos);
    camera.position.x += (Math.sin(T * 1.7) * 0.6 + Math.sin(T * 3.1) * 0.4) * amp;
    camera.position.y += (Math.sin(T * 1.3 + 1) * 0.6 + Math.sin(T * 2.7) * 0.4) * amp;
    camera.lookAt(this.look);
    if (Math.abs(camera.fov - this.fov) > 0.01) { camera.fov = this.fov; camera.updateProjectionMatrix(); }
  }
};

/* =========================================================
   AUDIO – simple "twik" only (no melody, no beat)

   SYNC MODEL
   The landing time is known before it happens (we simulate the jump), so the
   twik is scheduled slightly ahead on the audio clock instead of being fired
   when the frame is processed. That allows:
     speakers : land time + display lag - device output latency + user offset
     recording: land time + user offset   (the recorder taps the audio before the
                                           speakers, so no device latency applies)
   ========================================================= */
let actx = null, master, recMix, sfxBus, recSfxBus, windGain, windFilter, recDest, noiseBuf;
let muted = false, volume = 0.7;
const LOOKAHEAD = 0.7;          // seconds before landing at which the twik is scheduled
const DISPLAY_LAG = 0.025;      // ~1.5 frames between simulating a frame and seeing it
let syncMs = 0;                 // user offset: negative = earlier, positive = later
try { const v = parseInt(localStorage.getItem('endlessClimb.syncMs'), 10); if (!isNaN(v)) syncMs = clamp(v, -200, 300); } catch (e) {}
let pendingVoices = [];
let loopSchedDone = false;      // loop mode: has the next landing's twik been scheduled yet?

function initAudio() {
  if (actx) { actx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  try { actx = new AC({ latencyHint: 'interactive' }); } catch (e) { actx = new AC(); }
  master = actx.createGain(); master.gain.value = muted ? 0 : volume;
  master.connect(actx.destination);
  recMix = actx.createGain(); recMix.gain.value = master.gain.value;
  recDest = actx.createMediaStreamDestination();
  recMix.connect(recDest);
  sfxBus = actx.createGain(); sfxBus.connect(master);
  recSfxBus = actx.createGain(); recSfxBus.connect(recMix);

  noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // Soft, non-rhythmic wind bed
  const src = actx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  windFilter = actx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 500; windFilter.Q.value = 0.6;
  const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
  windGain = actx.createGain(); windGain.gain.value = 0;
  src.connect(windFilter); windFilter.connect(lp); lp.connect(windGain);
  windGain.connect(master); windGain.connect(recMix);
  src.start();
  updateLatencyHint();
}
function deviceLatency() {
  if (!actx) return 0;
  return clamp((actx.outputLatency || 0) + (actx.baseLatency || 0), 0, 0.35);
}
/* One short "twik" voice at an exact audio-clock time: a tiny upward chirp + a little click. */
function playTwikAt(t, vol, bus, ctx = actx, nbuf = noiseBuf, fMul = null, nOff = null) {
  const vg = ctx.createGain(); vg.connect(bus);
  const f = 2300 * (fMul !== null ? fMul : 1 + (Math.random() - 0.5) * 0.05);
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(f * 0.62, t);
  o.frequency.exponentialRampToValueAtTime(f * 1.18, t + 0.028);
  o.frequency.exponentialRampToValueAtTime(f * 1.05, t + 0.07);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
  o.connect(g); g.connect(vg); o.start(t); o.stop(t + 0.1);

  const n = ctx.createBufferSource(); n.buffer = nbuf;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4000;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(vol * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
  n.connect(hp); hp.connect(ng); ng.connect(vg);
  n.start(t, nOff !== null ? nOff : Math.random() * 1.5, 0.03);
  if (ctx === actx) pendingVoices.push({ vg, end: t + 0.15 });
}
/* delaySec = real seconds from now until the leaf contact becomes visible. */
function scheduleTwik(delaySec, vol = 0.16) {
  if (!actx || actx.state !== 'running') return;    // a suspended context would queue sounds and burst them out on resume
  const now = actx.currentTime;
  pendingVoices = pendingVoices.filter(v => v.end > now);
  const off = syncMs / 1000;
  const tLive = Math.max(now + 0.002, now + delaySec + DISPLAY_LAG + off - deviceLatency());
  playTwikAt(tLive, vol, sfxBus);
  if (recording && recSoundChk.checked) {
    const tRec = Math.max(now + 0.002, now + delaySec + off);
    playTwikAt(tRec, vol, recSfxBus);
  }
}
function cancelTwiks() {
  for (const v of pendingVoices) { try { v.vg.disconnect(); } catch (e) {} }
  pendingVoices = [];
  loopSchedDone = false;
}
/* Called once per frame, after the simulation step. */
function scheduleBallSound() {
  if (ball.mode !== 'air' || ball.twikDone || ball.to < 0) return;
  const remain = (1 - Math.min(ball.t, 1)) * ball.dur / speed;
  if (remain <= LOOKAHEAD) { ball.twikDone = true; scheduleTwik(remain); }
}
function applyVolume() {
  if (!master) return;
  const v = muted ? 0 : volume;
  master.gain.setTargetAtTime(v, actx.currentTime, 0.03);
  recMix.gain.setTargetAtTime(v, actx.currentTime, 0.03);
}
let windT = 0;
function updateWind(h, dt) {
  if (!actx) return;
  windT += dt; if (windT < 0.1) return;             // 10 Hz is plenty; per-frame automation events add up
  windT = 0;
  const T = actx.currentTime;
  // Loop mode: steady wind, no slow drifting, so the audio has nothing that could reveal the seam
  const base = windChk.checked && !paused ? (loopMode ? 0.06 : 0.035 + Math.min(h / 300, 1) * 0.07) : 0;
  const mod = loopMode ? 1 : 0.7 + 0.2 * Math.sin(T * 0.31) + 0.1 * Math.sin(T * 0.77 + 2);
  windGain.gain.setTargetAtTime(base * mod, T, 0.4);
  windFilter.frequency.setTargetAtTime(loopMode ? 450 : 420 + 180 * Math.sin(T * 0.23), T, 0.5);
}

/* =========================================================
   SEAMLESS LOOP WORLD
   A separate, fully deterministic scene: every object is a pure function of the loop
   time t (0..5 s). In one cycle the ball climbs exactly 5 leaves; the leaves repeat
   every 5 steps (5 x 144° = 2 full turns), so the picture at t = 5 s is identical to
   the picture at t = 0 once the camera has moved up with the ball.
   ========================================================= */
const TAU = Math.PI * 2;
const LOOP_T = 10, LOOP_N = 10, LOOP_TH = LOOP_T / LOOP_N;   // 10 s cycle, 10 hops, 1 s each
const LOOP_REST = 0.44, LOOP_R = LOOP_REST * LOOP_TH;        // share of each hop spent resting on the leaf
const LOOP_PITCH = 1.5, LOOP_Y0 = 1.0;                       // leaf spacing, height of leaf 0
const LOOP_ANGLE = THREE.MathUtils.degToRad(144);            // leaf-to-leaf turn
const LOOP_M = 30;                                           // pooled leaves (multiple of LOOP_N)
const LOOP_PHASE = 0.2;                                      // recordings start 0.2 s into the cycle so no landing sits on the seam
const LOOP_FOG_NEAR = 9, LOOP_FOG_FAR = 17;
const LOOP_SKY = new THREE.Color(0xa9d8ff);
let loopMode = false, loopT = 0, loopLastHop = -1;
let offlineRender = false;        // true while the frame-exact exporter drives the scene (no live sounds, no live loop)
let exporting = false, exportCancel = false;

/* Per-leaf look, indexed by (leaf number mod 5) so it repeats every cycle */
const LOOP_SIZE = [1.05, 0.95, 1.15, 1.00, 1.10, 0.98, 1.12, 1.02, 0.92, 1.08];
const LOOP_HUE  = [0.27, 0.30, 0.25, 0.33, 0.29, 0.26, 0.32, 0.28, 0.31, 0.24];
const LOOP_LIT  = [0.38, 0.34, 0.42, 0.36, 0.40, 0.35, 0.41, 0.37, 0.43, 0.33];
const LP1 = [0.00, 0.37, 0.71, 0.18, 0.54, 0.86, 0.29, 0.63, 0.09, 0.46];
const LP2 = [0.22, 0.80, 0.45, 0.93, 0.12, 0.58, 0.34, 0.77, 0.51, 0.04];
const LP3 = [0.60, 0.05, 0.33, 0.88, 0.47, 0.15, 0.72, 0.39, 0.96, 0.24];

const loopGroup = new THREE.Group(); loopGroup.visible = false; scene.add(loopGroup);
const loopTrunk = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16), barkMat);
loopTrunk.scale.set(0.26, 34, 0.26); loopTrunk.castShadow = true; loopTrunk.receiveShadow = true;
loopGroup.add(loopTrunk);
const loopLeafPool = [];
for (let j = 0; j < LOOP_M; j++) {
  const kk = j % LOOP_N;
  const root = new THREE.Group(), pivot = new THREE.Group(); root.add(pivot);
  const stem = new THREE.Mesh(stemGeo, stemMat);
  stem.rotation.z = Math.PI / 2; stem.position.x = 0.15; stem.scale.setScalar(LOOP_SIZE[kk]);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(LOOP_HUE[kk], 0.6, LOOP_LIT[kk]), side: THREE.DoubleSide, roughness: 0.6 });
  const mesh = new THREE.Mesh(leafGeo, mat);
  mesh.position.x = 0.28; mesh.scale.setScalar(LOOP_SIZE[kk]); mesh.castShadow = true; mesh.receiveShadow = true;
  pivot.add(stem, mesh); loopGroup.add(root);
  loopLeafPool.push({ root, pivot });
}

/* Seeded random numbers: the same sparks and dust motes every cycle */
let _seed = 20260611;
const rnd = () => (_seed = (_seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const LS = 22;
const lsA = [], lsS = [], lsV = [], lsL = [], lsC = [];
for (let i = 0; i < LS; i++) { lsA.push(rnd() * TAU); lsS.push(1 + rnd() * 2.5); lsV.push(1.5 + rnd() * 3); lsL.push(0.6 + rnd() * 0.5); lsC.push(sparkColors[(rnd() * 3) | 0]); }
const LM = 62, LOOP_P = LOOP_N * LOOP_PITCH;       // dust motes repeat every 15 m of height
const mx = [], mz = [], my = [], mph = [];
for (let i = 0; i < LM; i++) { const r = 1.2 + rnd() * 5.5, a = rnd() * TAU; mx.push(Math.cos(a) * r); mz.push(Math.sin(a) * r); my.push(rnd() * LOOP_P); mph.push(rnd()); }

/* Leaf dip when the ball lands / flick when it leaves; a function of time since landing */
const SAG_END = -0.14 * (1 - Math.exp(-9 * LOOP_R) * Math.cos(16 * LOOP_R));
function loopSag(tau) {
  if (tau < 0) return 0;
  if (tau < LOOP_R) return -0.14 * (1 - Math.exp(-9 * tau) * Math.cos(16 * tau));
  const s = tau - LOOP_R;
  return SAG_END * Math.exp(-5 * s) * Math.cos(18 * s) + 0.12 * Math.exp(-6 * s) * Math.sin(18 * s);
}
let _lz = 0, _lx = 0;
function loopLeafAngles(k, t) {
  const kk = ((k % LOOP_N) + LOOP_N) % LOOP_N, u = t / LOOP_T;
  _lz = 0.12 + loopSag(t - k * LOOP_TH) + Math.sin(TAU * (2 * u + LP1[kk])) * 0.04 + Math.sin(TAU * (3 * u + LP2[kk])) * 0.02;   // whole numbers of sways per cycle
  _lx = Math.sin(TAU * (2 * u + LP3[kk])) * 0.06;
}
/* World position of the landing spot on leaf k at time t (same maths as the scene graph: Rx * Rz inside, then Ry) */
function loopLandAt(k, t, out) {
  loopLeafAngles(k, t);
  const kk = ((k % LOOP_N) + LOOP_N) % LOOP_N, s = LOOP_SIZE[kk];
  const lx = 0.28 + s, ly = 0.04 * s + 0.01;
  const c = Math.cos(_lz), sn = Math.sin(_lz);
  const x1 = lx * c - ly * sn, y1 = lx * sn + ly * c;
  const y2 = y1 * Math.cos(_lx), z2 = y1 * Math.sin(_lx);
  const a = k * LOOP_ANGLE, ca = Math.cos(a), sa = Math.sin(a);
  return out.set(x1 * ca + z2 * sa, LOOP_Y0 + k * LOOP_PITCH + y2, -x1 * sa + z2 * ca);
}

/* Ball squash as a closed-form spring; start state solved so each hop begins exactly where the last one left off */
const SQ_D = 4.5, SQ_W = Math.sqrt(220 - SQ_D * SQ_D), _ss = { x: 0, v: 0 };
function spring(x0, v0, tau) {
  const e = Math.exp(-SQ_D * tau), c = Math.cos(SQ_W * tau), s = Math.sin(SQ_W * tau), B = (v0 + SQ_D * x0) / SQ_W;
  _ss.x = e * (x0 * c + B * s);
  _ss.v = e * (v0 * c - (SQ_D * B + SQ_W * x0) * s);
}
const SQ_L = (() => {
  let x = 0, v = -7.5;
  for (let i = 0; i < 40; i++) {
    spring(x, v, LOOP_R); const xr = _ss.x, vr = _ss.v + 4;      // +4 = take-off kick
    spring(xr, vr, LOOP_TH - LOOP_R); x = _ss.x; v = _ss.v - 7.5; // -7.5 = landing impact
  }
  return { x, v };
})();

const _from = new THREE.Vector3(), _to = new THREE.Vector3(), _lax = new THREE.Vector3();
function loopBall(t) {
  const h = Math.floor(t / LOOP_TH), x = t / LOOP_TH - h, tau = x * LOOP_TH;
  if (x < LOOP_REST) {
    ball.mode = 'rest'; ball.vy = 0;
    loopLandAt(h, t, ball.surf);
    spinner.quaternion.identity();
    spring(SQ_L.x, SQ_L.v, tau);
  } else {
    ball.mode = 'air';
    loopLandAt(h, (h + LOOP_REST) * LOOP_TH, _from);            // where it took off
    loopLandAt(h + 1, t, _to);                                    // the leaf it is heading for
    const tt = (x - LOOP_REST) / (1 - LOOP_REST);
    const bh = 0.8 + _from.distanceTo(_to) * 0.33;
    ball.surf.lerpVectors(_from, _to, tt); ball.surf.y += bh * 4 * tt * (1 - tt);
    ball.vy = ((_to.y - _from.y) + bh * 4 * (1 - 2 * tt)) / ((1 - LOOP_REST) * LOOP_TH);
    const dx = _to.x - _from.x, dz = _to.z - _from.z, len = Math.hypot(dx, dz) || 1;
    _lax.set(dz / len, 0, -dx / len);
    spinner.quaternion.setFromAxisAngle(_lax, TAU * tt);         // one full turn per hop → identity at both ends
    spring(SQ_L.x, SQ_L.v, LOOP_R);
    const xr = _ss.x, vr = _ss.v + 4;
    spring(xr, vr, tau - LOOP_R);
  }
  ball.sq = clamp(1 + _ss.x, 0.55, 1.45);
}
function loopSparks(t) {
  const h = Math.floor(t / LOOP_TH);
  for (let bi = 0; bi < 2; bi++) {                               // this landing and the one before it
    const b = h - bi, tb = b * LOOP_TH, tau = t - tb;
    loopLandAt(b, tb, _from);
    for (let i = 0; i < LS; i++) {
      const idx = (bi * LS + i) * 3, life = lsL[i];
      if (tau >= life) { spPos[idx + 1] = -9999; spCol[idx] = spCol[idx + 1] = spCol[idx + 2] = 0; continue; }
      spPos[idx] = _from.x + Math.cos(lsA[i]) * lsS[i] * tau;
      spPos[idx + 1] = _from.y + 0.05 + lsV[i] * tau - 3 * tau * tau;
      spPos[idx + 2] = _from.z + Math.sin(lsA[i]) * lsS[i] * tau;
      const f = Math.min((life - tau) / 0.6, 1), c = lsC[i];
      spCol[idx] = c.r * f; spCol[idx + 1] = c.g * f; spCol[idx + 2] = c.b * f;
    }
  }
  spGeo.attributes.position.needsUpdate = true; spGeo.attributes.color.needsUpdate = true;
}
function loopMotes(camY, u) {
  const base = Math.floor((camY - 15) / LOOP_P);
  for (let tile = 0; tile < 4; tile++) for (let i = 0; i < LM; i++) {
    const n = (tile * LM + i) * 3, a = TAU * (2 * u + mph[i]);
    poPos[n] = mx[i] + 0.3 * Math.sin(a);
    poPos[n + 1] = (base + tile) * LOOP_P + my[i] + 0.2 * Math.cos(a);
    poPos[n + 2] = mz[i] + 0.3 * Math.cos(a * 1.0 + 1.7);
  }
  for (let n = LM * 4 * 3; n < POLLEN * 3; n++) poPos[n] = poPos[n - LM * 4 * 3 + 0];
  poGeo.attributes.position.needsUpdate = true;
}
function loopLeaves(t, camTy) {
  const kmin = Math.floor((camTy - LOOP_M * LOOP_PITCH / 2 - LOOP_Y0) / LOOP_PITCH);
  for (let j = 0; j < LOOP_M; j++) {
    const k = kmin + (((j - kmin) % LOOP_M) + LOOP_M) % LOOP_M;    // slot j always shows leaves with k ≡ j (mod 30), so its look never changes
    const Lf = loopLeafPool[j];
    Lf.root.position.set(0, LOOP_Y0 + k * LOOP_PITCH, 0);
    Lf.root.rotation.y = k * LOOP_ANGLE;
    loopLeafAngles(k, t);
    Lf.pivot.rotation.z = _lz; Lf.pivot.rotation.x = _lx;
  }
}
function loopCamera(t, ty) {
  const u = t / LOOP_T;
  const fit = camera.aspect < 1 ? Math.pow(1 / camera.aspect, 0.5) : 1;
  const D = 7.2 * fit;
  const az = loopCam.value === 'sway' ? 0.6 + 0.35 * Math.sin(TAU * u) : 0.6 + TAU * u;
  camera.position.set(Math.cos(az) * D, ty + 1.0, Math.sin(az) * D);
  camera.lookAt(0, ty + 0.2, 0);
}
/* One twik per landing, scheduled ahead on the audio clock (same latency compensation as the normal mode) */
function scheduleLoopSound(t) {
  const hop = Math.floor(t / LOOP_TH);
  if (hop !== loopLastHop) { loopLastHop = hop; loopSchedDone = false; }
  if (loopSchedDone || paused || offlineRender) return;
  const remain = ((hop + 1) * LOOP_TH - t) / (recording ? 1 : speed);
  if (remain <= LOOKAHEAD) { loopSchedDone = true; scheduleTwik(remain); }
}
function loopFrame(t) {
  const ty = LOOP_Y0 + 0.5 + (LOOP_PITCH / LOOP_TH) * t;          // camera climbs at the ball's average speed
  loopTrunk.position.y = ty;
  loopLeaves(t, ty);
  loopBall(t);
  loopSparks(t);
  loopMotes(ty, t / LOOP_T);
  loopCamera(t, ty);
  scheduleLoopSound(t);
}
function runLoop(dt) {
  let t;
  if (recording) t = loopT = (recNow() + LOOP_PHASE) % LOOP_T;    // fallback recorder only: wall clock, so dropped frames can't shift the loop
  else { if (!paused) loopT = (loopT + dt * speed) % LOOP_T; t = loopT; }
  loopFrame(t);
  updateBallVisual();
  sCam.textContent = 'Seamless loop';
}
/* Draw one loop frame at exactly time t (used by the frame-exact exporter). */
function drawLoopAt(t) {
  loopFrame(t);
  updateBallVisual();
  sun.position.copy(ballGroup.position).add(_t1.set(10, 20, 8));
  sun.target.position.copy(ballGroup.position);
  vigAmt = 1; fade = 0; fadeTarget = 0;
  const overlayOn = updateOverlay(0);
  renderer.clear();
  renderer.render(scene, camera);
  if (overlayOn) { renderer.clearDepth(); renderer.render(overlay, orthoCam); }
}
function setLoopWorld(on) {
  loopMode = on;
  loopGroup.visible = on;
  ground.visible = !on; bud.visible = !on; budLight.visible = !on; stars.visible = !on;
  for (const s of segments) s.mesh.visible = !on;
  for (const L of leaves) L.root.visible = !on;
  scene.fog.near = on ? LOOP_FOG_NEAR : 28; scene.fog.far = on ? LOOP_FOG_FAR : 125;
  cancelTwiks();
  if (on) {
    scene.background.copy(LOOP_SKY); scene.fog.color.copy(LOOP_SKY);
    hemi.color.copy(LOOP_SKY); hemi.intensity = 0.9;
    sun.color.copy(white).lerp(LOOP_SKY, 0.45); sun.intensity = 1.8;
    spLife.fill(0); spPos.fill(-9999); spCol.fill(0); sparkActive = 0;
    camera.fov = 50; camera.updateProjectionMatrix();
    loopT = 0; loopLastHop = -1;
  } else {
    restart();                                                   // rebuild the normal endless world
  }
}

/* =========================================================
   RECORDING
   ========================================================= */
const recBtn = document.getElementById('recBtn'), recBadge = document.getElementById('recBadge');
const recTimeEl = document.getElementById('recTime'), recTag = document.getElementById('recTag');
const cdEl = document.getElementById('countdown'), cdNum = document.getElementById('cdNum');
const modal = document.getElementById('modal'), preview = document.getElementById('preview');
const dlBtn = document.getElementById('dlBtn'), vidInfo = document.getElementById('vidInfo');
let recorder = null, chunks = [], recording = false, stopping = false, countingDown = false;
let recElapsed = 0, recIsPro = false, recLimit = 0, lastUrl = null, lastName = '', recMime = '';
let recAspect = '', recWidth = 0, recHeight = 0, recFps = 30, loopRec = false;
let recStart = 0, recPausedAt = 0, recPausedTotal = 0;     // wall-clock timing, so lag can't stretch a timed recording

const QUALITY = {
  smooth: { short: 720,  fps: 30, mbps: 6 },
  high:   { short: 1080, fps: 30, mbps: 10 },
  ultra:  { short: 1080, fps: 60, mbps: 16 }
};

function pickMime() {
  // MP4/H.264 first: usually hardware-encoded (least lag) and plays everywhere. Falls back to WebM.
  const list = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];
  for (const m of list) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function recNow() {
  const ref = recPausedAt || performance.now();
  return Math.max(0, (ref - recStart - recPausedTotal) / 1000);
}

async function startRecording() {
  if (recording || countingDown || exporting) return;
  if (proChk.checked && loopMode && canExportLoop()) { await exportLoopVideo(); return; }   // frame-exact path
  if (!window.MediaRecorder || !canvas.captureStream) { alert('Sorry, your browser does not support canvas recording.'); return; }
  initAudio();
  if (isSmallScreen()) setPanel(false);             // clear the scene while recording on phones
  recIsPro = proChk.checked;
  if (recIsPro) {
    countingDown = true; recBtn.disabled = true; recBtn.textContent = '⏳ Get ready…';
    lockProfessionalSettings(true);
    applyRendererOutput();                         // switch from half-size preview to the full recording size
    if (!loopMode) { director.start(); fadeTarget = 1; }   // a loop must not fade to black
    cdEl.style.display = 'flex';
    for (const n of [3, 2, 1]) {
      cdNum.textContent = n; cdNum.style.animation = 'none'; void cdNum.offsetWidth; cdNum.style.animation = '';
      await sleep(1000);
    }
    cdEl.style.display = 'none';
    countingDown = false; recBtn.disabled = false;
    if (paused) togglePause();
  }
  beginRecorder();
}
function beginRecorder() {
  lockProfessionalSettings(true);
  const q = QUALITY[proQuality.value] || QUALITY.high;
  recAspect = recIsPro ? proAspect.value : 'viewport';
  recWidth = canvas.width;
  recHeight = canvas.height;
  recFps = recIsPro ? q.fps : (recWidth * recHeight > 1.3e6 ? 30 : 60);
  const bitrate = recIsPro ? q.mbps * 1e6 : (recFps === 60 ? 8e6 : 6e6);
  const stream = canvas.captureStream(recFps);
  if (recSoundChk.checked && recDest) {
    const at = recDest.stream.getAudioTracks()[0];
    if (at) stream.addTrack(at);
  }
  recMime = pickMime();
  const opts = { videoBitsPerSecond: bitrate };
  if (recMime) opts.mimeType = recMime;
  try { recorder = new MediaRecorder(stream, opts); }
  catch (e) { recorder = new MediaRecorder(stream); }
  chunks = [];
  recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = showPreview;
  cancelTwiks(); if (ball.mode === 'air') ball.twikDone = false;   // re-schedule so the recording gets its own timing
  recorder.start(500);
  recording = true; stopping = false; recElapsed = 0;
  recStart = performance.now(); recPausedAt = 0; recPausedTotal = 0;
  loopRec = recIsPro && loopMode;
  recLimit = loopRec ? parseInt(loopCycles.value, 10) * LOOP_T : (recIsPro ? parseInt(proLen.value, 10) : 0);
  if (recIsPro && !loopRec) {
    director.outro = false;
    director.queue = ['tracking'];                 // wide establishing intro → close tracking shot
    director.next('establishing');
    fadeTarget = 0;                                // fade in from black
  }
  recBtn.textContent = '⏹ Stop Recording'; recBtn.classList.add('recording');
  recBadge.style.display = 'flex'; recTag.style.display = recIsPro ? 'inline' : 'none';
}
function requestStop() {
  if (!recording || stopping) return;
  if (recIsPro && !loopRec) { stopping = true; fadeTarget = 1; recBtn.disabled = true; }   // fade out, then stop (loops stop instantly)
  else finalizeStop();
}
function finalizeStop() {
  if (!recorder) return;
  recElapsed = recNow();
  if (recorder.state !== 'inactive') recorder.stop();
  recording = false; stopping = false;
  recBtn.disabled = false; recBtn.textContent = '⏺ Start Recording'; recBtn.classList.remove('recording');
  recBadge.style.display = 'none';
  lockProfessionalSettings(false);
  applyRendererOutput();                           // back to the lighter preview size
  fadeTarget = 0;
}
function showPreview() {
  const type = recMime ? recMime.split(';')[0] : (chunks[0] && chunks[0].type) || 'video/webm';
  presentBlob(new Blob(chunks, { type }), type);
}
function presentBlob(blob, type) {
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = URL.createObjectURL(blob);
  const ext = type.includes('mp4') ? 'mp4' : 'webm';
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const formatSuffix = recIsPro ? (recAspect === '9:16' ? '-9x16' : '-16x9') : '';
  lastName = `endless-climb${recIsPro ? (loopRec ? '-loop' : '-pro') : ''}${formatSuffix}-${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
  preview.src = lastUrl;
  preview.loop = loopRec;                          // loop recordings replay on repeat so you can check the seam
  const formatInfo = recIsPro ? ` · ${recAspect} · ${recWidth}×${recHeight} · ${recFps}fps` : ` · ${recWidth}×${recHeight}`;
  vidInfo.textContent = `${fmt(recElapsed)} · ${(blob.size / 1048576).toFixed(1)} MB · .${ext}${recIsPro ? (loopRec ? ' · Seamless loop' : ' · Pro cinematic') : ''}${formatInfo}`;
  modal.style.display = 'flex';
  preview.play().catch(() => {});
}
function fmt(s) { s = Math.floor(s); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
dlBtn.onclick = () => { if (!lastUrl) return; const a = document.createElement('a'); a.href = lastUrl; a.download = lastName; document.body.appendChild(a); a.click(); a.remove(); };
document.getElementById('closeBtn').onclick = () => { preview.pause(); modal.style.display = 'none'; };
function toggleRecord() {
  if (exporting) exportCancel = true;
  else if (recording) requestStop();
  else startRecording();
}
recBtn.onclick = toggleRecord;

/* =========================================================
   FRAME-EXACT LOOP EXPORT
   The live recorder (MediaRecorder) stamps every frame with the moment the browser happened to
   deliver it, so any hiccup nudges the loop by a few milliseconds and shows up as a stutter at the
   seam. Here each frame is rendered for an exact time (frame i = i / fps), encoded with a fixed
   timestamp and muxed directly. The video is exactly N x 10 s, and the audio is built offline so
   it also wraps around cleanly. Rendering runs as fast as the device allows, not in real time.
   ========================================================= */
const MUXERS = {
  mp4: 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.mjs',
  webm: 'https://cdn.jsdelivr.net/npm/webm-muxer@5.1.4/build/webm-muxer.mjs'
};
const canExportLoop = () => !!(window.VideoEncoder && window.VideoFrame && window.OfflineAudioContext);
/* Let the browser breathe between frames. One reusable MessageChannel (not throttled in background tabs, unlike setTimeout);
   creating a new channel per call, as a busy-wait would, floods the renderer with ports and eats gigabytes of memory. */
const _yc = new MessageChannel(); let _yr = null;
_yc.port1.onmessage = () => { const r = _yr; _yr = null; if (r) r(); };
const yieldUI = () => new Promise(r => { _yr = r; _yc.port2.postMessage(0); });
/* Wait until the encoder has worked its queue down (event-driven; the timeout is only a safety net). */
function waitEncoder(enc, max) {
  return new Promise(res => {
    if (enc.encodeQueueSize <= max) return res();
    const done = () => { clearTimeout(tm); enc.removeEventListener('dequeue', check); res(); };
    const check = () => { if (enc.encodeQueueSize <= max) done(); };
    const tm = setTimeout(done, 250);
    enc.addEventListener('dequeue', check);
  });
}

async function pickVideoConfig(w, h, fps, bitrate) {
  const tries = [
    { mux: 'mp4', codec: 'avc1.640034' }, { mux: 'mp4', codec: 'avc1.4d0034' }, { mux: 'mp4', codec: 'avc1.42003e' },
    { mux: 'webm', codec: 'vp09.00.40.08' }, { mux: 'webm', codec: 'vp8' }
  ];
  for (const c of tries) {
    const cfg = { codec: c.codec, width: w, height: h, bitrate, framerate: fps };
    if (c.mux === 'mp4') cfg.avc = { format: 'avc' };
    try { const r = await VideoEncoder.isConfigSupported(cfg); if (r && r.supported) return { mux: c.mux, cfg }; } catch (e) {}
  }
  return null;
}
async function pickAudioConfig(mux, sr, ch) {
  const tries = mux === 'mp4' ? [{ codec: 'mp4a.40.2', mc: 'aac' }, { codec: 'opus', mc: 'opus' }] : [{ codec: 'opus', mc: 'opus' }];
  if (!window.AudioEncoder || !window.AudioData) return null;
  for (const c of tries) {
    const cfg = { codec: c.codec, sampleRate: sr, numberOfChannels: ch, bitrate: 160000 };
    try { const r = await AudioEncoder.isConfigSupported(cfg); if (r && r.supported) return { cfg, mc: c.mc }; } catch (e) {}
  }
  return null;
}

/* One cycle of audio (twiks at every landing + steady wind), built offline, as stereo Float32 arrays.
   Twik tails that run past the end are folded back onto the start; the wind is cross-faded with itself,
   so the last sample leads straight into the first with nothing to hear at the seam. */
async function renderLoopAudio(sr) {
  const n = Math.round(LOOP_T * sr), TAIL = 0.5, nt = Math.round(TAIL * sr);
  let s = 987654321;
  const lcg = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const mkNoise = ctx => { const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = lcg() * 2 - 1; return b; };
  const vol = volume, off = syncMs / 1000;

  // twiks
  const tc = new OfflineAudioContext(2, n + nt, sr);
  const tb = tc.createGain(); tb.gain.value = vol; tb.connect(tc.destination);
  const tn = mkNoise(tc);
  for (let j = 0; j < LOOP_N; j++) {
    const v = (j + 1) * LOOP_TH - LOOP_PHASE;                    // video time of the landing on leaf j + 1
    const when = (((v + off) % LOOP_T) + LOOP_T) % LOOP_T;
    const kk = (j + 1) % LOOP_N;
    playTwikAt(when, 0.16, tb, tc, tn, 1 + ((kk * 37 % 10) / 10 - 0.5) * 0.05, (kk * 0.37) % 1.5);
  }
  const tw = await tc.startRendering();

  // wind
  let wind = null;
  if (windChk.checked) {
    const nx = Math.round(0.6 * sr);
    const wc = new OfflineAudioContext(2, n + nx, sr);
    const src = wc.createBufferSource(); src.buffer = mkNoise(wc); src.loop = true;
    const bp = wc.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 450; bp.Q.value = 0.6;
    const lp = wc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
    const wg = wc.createGain(); wg.gain.value = 0.06 * vol;
    src.connect(bp); bp.connect(lp); lp.connect(wg); wg.connect(wc.destination); src.start();
    wind = { buf: await wc.startRendering(), nx };
  }

  const out = [new Float32Array(n), new Float32Array(n)];
  for (let c = 0; c < 2; c++) {
    const T = tw.getChannelData(c), o = out[c];
    for (let i = 0; i < n; i++) o[i] = T[i];
    for (let i = 0; i < nt; i++) o[i] += T[n + i];               // fold the tail back onto the start
    if (wind) {
      const W = wind.buf.getChannelData(c), nx = wind.nx;
      for (let i = 0; i < n; i++) {
        if (i < nx) { const a = (i / nx) * Math.PI / 2; o[i] += W[i] * Math.sin(a) + W[n + i] * Math.cos(a); }
        else o[i] += W[i];
      }
    }
  }
  return out;
}

async function exportLoopVideo() {
  const q = QUALITY[proQuality.value] || QUALITY.high;
  const fps = q.fps, cycles = parseInt(loopCycles.value, 10);
  const total = Math.round(cycles * LOOP_T * fps);
  exporting = true; exportCancel = false; offlineRender = true;
  initAudio();
  if (isSmallScreen()) setPanel(false);
  lockProfessionalSettings(true);
  recBtn.textContent = '⏹ Cancel'; recBtn.classList.add('recording');
  recBadge.style.display = 'flex'; recTag.style.display = 'inline'; recTag.textContent = 'LOOP';
  recTimeEl.textContent = 'Preparing…';
  cancelTwiks();
  applyRendererOutput();                                          // full recording size
  await yieldUI();
  let venc = null, aenc = null, ok = false;
  try {
    const W = canvas.width, H = canvas.height;
    const vc = await pickVideoConfig(W, H, fps, q.mbps * 1e6);
    if (!vc) throw new Error('This browser cannot encode ' + W + '×' + H + ' video.');
    const lib = await import(MUXERS[vc.mux]);
    const SR = 48000;
    const wantAudio = recSoundChk.checked && !muted;
    const ac = wantAudio ? await pickAudioConfig(vc.mux, SR, 2) : null;
    const target = new lib.ArrayBufferTarget();
    const mopts = { target, video: { codec: vc.mux === 'mp4' ? 'avc' : (vc.cfg.codec.startsWith('vp09') ? 'V_VP9' : 'V_VP8'), width: W, height: H, frameRate: fps }, firstTimestampBehavior: 'offset' };
    if (vc.mux === 'mp4') mopts.fastStart = 'in-memory';
    if (ac) mopts.audio = { codec: vc.mux === 'mp4' ? ac.mc : 'A_OPUS', sampleRate: SR, numberOfChannels: 2 };
    const muxer = new lib.Muxer(mopts);
    let encErr = null;
    venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: e => { encErr = e; } });
    venc.configure(vc.cfg);

    // audio first (fast): one cycle, tiled
    if (ac) {
      recTimeEl.textContent = 'Building audio…'; await yieldUI();
      const cyc = await renderLoopAudio(SR);
      // the encoder pads the end by one packet; drop it so the audio is exactly as long as the video
      const endUs = Math.round(total / fps * 1e6) - 1000;
      aenc = new AudioEncoder({ output: (c, m) => { if (c.timestamp < endUs) muxer.addAudioChunk(c, m); }, error: e => { encErr = e; } });
      aenc.configure(ac.cfg);
      const per = cyc[0].length, all = per * cycles, CH = 4800;
      for (let p = 0; p < all; p += CH) {
        const len = Math.min(CH, all - p), data = new Float32Array(len * 2);
        for (let i = 0; i < len; i++) { data[i] = cyc[0][(p + i) % per]; data[len + i] = cyc[1][(p + i) % per]; }
        const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: len, numberOfChannels: 2, timestamp: Math.round(p * 1e6 / SR), data });
        aenc.encode(ad); ad.close();
      }
    }

    // video: frame i is the scene at exactly LOOP_PHASE + i / fps
    const t0 = performance.now();
    for (let i = 0; i < total; i++) {
      if (exportCancel || encErr) break;
      drawLoopAt((LOOP_PHASE + i / fps) % LOOP_T);
      const vf = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      venc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
      vf.close();
      if (i % 3 === 2) {
        recTimeEl.textContent = `Rendering ${Math.round(100 * (i + 1) / total)}%`;
        await yieldUI();
        while (venc.encodeQueueSize > 8 && !exportCancel) await waitEncoder(venc, 8);
      }
    }
    if (encErr) throw encErr;
    if (!exportCancel) {
      recTimeEl.textContent = 'Finishing…'; await yieldUI();
      await venc.flush(); if (aenc) await aenc.flush();
      if (encErr) throw encErr;
      muxer.finalize();
      const type = vc.mux === 'mp4' ? 'video/mp4' : 'video/webm';
      recIsPro = true; loopRec = true; recAspect = proAspect.value; recWidth = W; recHeight = H; recFps = fps; recElapsed = total / fps;
      presentBlob(new Blob([target.buffer], { type }), type);
      ok = true;
    }
  } catch (e) {
    console.error(e);
    alert('Loop export failed: ' + (e && e.message ? e.message : e));
  } finally {
    try { if (venc && venc.state !== 'closed') venc.close(); } catch (e) {}
    try { if (aenc && aenc.state !== 'closed') aenc.close(); } catch (e) {}
    exporting = false; offlineRender = false; exportCancel = false;
    recBtn.textContent = '⏺ Start Recording'; recBtn.classList.remove('recording');
    recBadge.style.display = 'none'; recTag.textContent = 'PRO';
    lockProfessionalSettings(false);
    applyRendererOutput();
    loopT = 0; loopLastHop = -1;
  }
  return ok;
}

let snapRequested = false;
function snapshot() { snapRequested = true; }       // taken in animate(), right after the frame is drawn
function doSnapshot() {
  snapRequested = false;
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `endless-climb-${Date.now()}.png`;
  document.body.appendChild(a); a.click(); a.remove();
}

/* =========================================================
   UI
   ========================================================= */
const pauseBtn = document.getElementById('pauseBtn'), speedEl = document.getElementById('speed'), speedVal = document.getElementById('speedVal');
const muteBtn = document.getElementById('muteBtn'), volEl = document.getElementById('vol');
const windChk = document.getElementById('windChk'), recSoundChk = document.getElementById('recSoundChk');
const proChk = document.getElementById('proChk'), proLen = document.getElementById('proLen');
const proAspect = document.getElementById('proAspect'), proQuality = document.getElementById('proQuality');
const proStyle = document.getElementById('proStyle'), loopCycles = document.getElementById('loopCycles'), loopCam = document.getElementById('loopCam');
const loopOpts = document.getElementById('loopOpts'), loopHint = document.getElementById('loopHint');
const syncEl = document.getElementById('syncMs'), syncVal = document.getElementById('syncVal'), latHint = document.getElementById('latHint');
const sBall = document.getElementById('sBall'), sTree = document.getElementById('sTree'), sJumps = document.getElementById('sJumps'), sCam = document.getElementById('sCam'), sFps = document.getElementById('sFps');
let paused = false, speed = 1;
let activeOutputWidth = innerWidth, activeOutputHeight = innerHeight;

function proDims() {
  const q = QUALITY[proQuality.value] || QUALITY.high;
  const s = q.short, l = Math.round(s * 16 / 9);
  return proAspect.value === '9:16' ? [s, l] : [l, s];
}
function applyRendererOutput() {
  if (proChk.checked) {
    const [W, H] = proDims();
    const full = recording || countingDown || exporting;         // recording at full size; the live preview at half size to save GPU
    const k = full ? 1 : 0.5;
    activeOutputWidth = Math.round(W * k);
    activeOutputHeight = Math.round(H * k);
    renderer.setPixelRatio(1);
    renderer.setSize(activeOutputWidth, activeOutputHeight, false);
    // The canvas is fitted to the viewport with CSS while its buffer keeps the exact aspect ratio.
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    camera.aspect = W / H;
  } else {
    activeOutputWidth = innerWidth;
    activeOutputHeight = innerHeight;
    renderer.setPixelRatio(curPR);
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
  }
  camera.updateProjectionMatrix();
}

function lockProfessionalSettings(locked) {
  proChk.disabled = locked;
  const off = locked || !proChk.checked;
  proAspect.disabled = off; proQuality.disabled = off; proStyle.disabled = off;
  proLen.disabled = off || proStyle.value === 'loop';        // loops have their own length (repeats × 5 s)
  loopCycles.disabled = locked; loopCam.disabled = locked;
}

function togglePause() {
  paused = !paused;
  pauseBtn.textContent = paused ? '▶ Play' : '⏸ Pause';
  if (recorder && recording) {
    const now = performance.now();
    if (paused) { if (recorder.state === 'recording') recorder.pause(); recPausedAt = now; }
    else {
      if (recorder.state === 'paused') recorder.resume();
      if (recPausedAt) { recPausedTotal += now - recPausedAt; recPausedAt = 0; }
    }
  }
  if (paused) { cancelTwiks(); if (ball.mode === 'air') ball.twikDone = false; }   // nothing stale plays after pausing
}
pauseBtn.onclick = togglePause;
speedEl.oninput = () => {
  speed = parseFloat(speedEl.value); speedVal.textContent = speed.toFixed(1) + '×';
  cancelTwiks(); if (ball.mode === 'air') ball.twikDone = false;                   // re-time the pending landing sound
};
function toggleMute() { muted = !muted; muteBtn.textContent = muted ? '🔇 Unmute' : '🔊 Mute'; applyVolume(); }
muteBtn.onclick = toggleMute;
volEl.oninput = () => { volume = parseFloat(volEl.value); applyVolume(); };

function setSync(ms) {
  syncMs = clamp(Math.round(ms / 5) * 5, -200, 300);
  syncEl.value = syncMs;
  syncVal.textContent = (syncMs > 0 ? '+' : '') + syncMs + ' ms';
  try { localStorage.setItem('endlessClimb.syncMs', String(syncMs)); } catch (e) {}
  cancelTwiks(); if (ball.mode === 'air') ball.twikDone = false;                   // apply immediately
}
syncEl.oninput = () => setSync(parseInt(syncEl.value, 10));
document.getElementById('syncReset').onclick = () => setSync(0);
setSync(syncMs);
let lastLatTxt = '';
function updateLatencyHint() {
  if (!actx) return;
  const txt = `Auto-compensating ~${Math.round(deviceLatency() * 1000)} ms device latency · negative = sound earlier, positive = later (keys , and .)`;
  if (txt !== lastLatTxt) { lastLatTxt = txt; latHint.textContent = txt; }
}

proChk.onchange = () => {
  lockProfessionalSettings(false);
  controls.enabled = !proChk.checked;
  applyRendererOutput();
  if (proChk.checked) director.start();
  else { controls.target.copy(followTarget); camera.fov = 50; camera.updateProjectionMatrix(); }
  refreshLoopMode();
};
const refreshProOutput = () => { if (proChk.checked && !recording && !countingDown) applyRendererOutput(); };
proAspect.onchange = refreshProOutput;
proQuality.onchange = refreshProOutput;
function refreshLoopMode() {
  const want = proChk.checked && proStyle.value === 'loop';
  loopOpts.hidden = !want; loopHint.hidden = !want;
  if (want !== loopMode) setLoopWorld(want);
}
proStyle.onchange = () => { lockProfessionalSettings(false); refreshLoopMode(); };
document.getElementById('snapBtn').onclick = snapshot;
document.getElementById('restartBtn').onclick = restart;

/* No start screen: the audio engine is created immediately and unlocked by the first tap, click or key press
   (browsers don't allow sound before some user interaction). */
const UNLOCK_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'];
function unlockAudio() {
  initAudio();
  if (!actx) return;
  actx.resume().then(() => {
    if (actx.state === 'running') UNLOCK_EVENTS.forEach(ev => removeEventListener(ev, unlockAudio));
  }).catch(() => {});
}
UNLOCK_EVENTS.forEach(ev => addEventListener(ev, unlockAudio));
try { initAudio(); } catch (e) {}

/* Controls sheet + quick buttons */
const panelEl = document.getElementById('panel'), panelToggle = document.getElementById('panelToggle');
const quickPause = document.getElementById('quickPause'), quickRec = document.getElementById('quickRec');
const isSmallScreen = () => matchMedia('(max-width: 700px), (pointer: coarse)').matches;
function setPanel(open) { panelEl.classList.toggle('open', open); panelToggle.textContent = open ? '✕' : '⚙'; }
panelToggle.onclick = () => setPanel(!panelEl.classList.contains('open'));
quickPause.onclick = () => pauseBtn.click();
quickRec.onclick = () => recBtn.click();
setPanel(!isSmallScreen());                        // open on desktop, hidden on phones so the scene is clear

addEventListener('keydown', e => {
  if (e.target.tagName === 'SELECT') return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); togglePause(); }
  else if (k === 'r') toggleRecord();
  else if (k === 'm') toggleMute();
  else if (k === 'p') snapshot();
  else if (k === ',') setSync(syncMs - 5);
  else if (k === '.') setSync(syncMs + 5);
});
addEventListener('resize', () => {
  if (exporting) return;
  if (recording && !recIsPro) return;               // never change the canvas size while a normal recording is running
  applyRendererOutput();
});
// A hidden tab stops drawing frames; pause so the recording doesn't contain a frozen stretch.
document.addEventListener('visibilitychange', () => { if (document.hidden && recording && !paused) togglePause(); });

/* =========================================================
   RESET / RESTART
   ========================================================= */
const followTarget = new THREE.Vector3(2.8, 1, 2.6);
function restart() {
  if (loopMode) { loopT = 0; loopLastHop = -1; cancelTwiks(); return; }   // loop world: just rewind the cycle
  segments.forEach(s => scene.remove(s.mesh)); segments = [];
  leaves.forEach(L => { scene.remove(L.root); L.mat.dispose(); }); leaves = [];
  treeH = 2; nextLeafY = 1.8; leafCounter = 0; jumps = 0;
  segments.push(makeSeg(0, treeH));
  Object.assign(ball, { mode: 'rest', cur: -1, to: -1, rest: 1.0, t: 0, sq: 1, sqV: 0, vy: 0, twikDone: true });
  ball.surf.copy(GROUND_POINT); ball.prevSurf.copy(GROUND_POINT);
  cancelTwiks();
  spLife.fill(0); spPos.fill(-9999); spCol.fill(0); sparkActive = 0;
  followTarget.set(GROUND_POINT.x, 1, GROUND_POINT.z);
  if (!proChk.checked) { camera.position.set(9, 4, 9); controls.target.copy(followTarget); }
  else director.start();
}

/* =========================================================
   SIMULATION + MAIN LOOP
   ========================================================= */
let simTime = 0;
function simulate(h) {
  simTime += h;
  if (treeH - ball.surf.y < AHEAD) treeH += 1.5 * h;   // tree waits if it gets too far ahead
  let last = segments[segments.length - 1];
  last.y1 = treeH;
  while (last.y1 - last.y0 > SEG) { const sy = last.y0 + SEG; const ns = makeSeg(sy, last.y1); last.y1 = sy; segments.push(ns); last = ns; }
  while (treeH - 0.4 > nextLeafY) { spawnLeaf(nextLeafY); nextLeafY += 1.45 + Math.random() * 0.2; }
  for (const L of leaves) updateLeaf(L, h);
  simulateBall(h);
  updateSparks(h);
}
function cleanup() {
  const cutoff = ball.surf.y - BEHIND;
  while (segments.length > 2 && segments[0].y1 < cutoff) scene.remove(segments.shift().mesh);
  while (leaves.length && leaves[0].y < cutoff && leaves[0].idx < ball.cur && leaves[0].idx !== ball.to) {
    const L = leaves.shift(); scene.remove(L.root); L.mat.dispose();
  }
  ground.visible = ball.surf.y < 160;
}

/* Adaptive resolution (live view only): if the frame rate stays low, render fewer pixels. */
let emaMs = 16.7, slowFrames = 0, frameNo = 0;
function adaptQuality(rawDt) {
  emaMs += (Math.min(rawDt, 0.25) * 1000 - emaMs) * 0.05;
  if (proChk.checked || recording || countingDown || paused || document.hidden) { slowFrames = 0; return; }
  if (emaMs > 28 && curPR > 0.75) slowFrames++; else slowFrames = 0;
  if (slowFrames > 90) {
    curPR = Math.max(0.75, curPR - 0.25);
    renderer.setPixelRatio(curPR); renderer.setSize(innerWidth, innerHeight);
    slowFrames = 0; emaMs = 16.7;
  }
}

const clock = new THREE.Clock();
const _bud = new THREE.Vector3(), _ft = new THREE.Vector3();
let statTimer = 0, latTimer = 0;
restart();

function animate() {
  requestAnimationFrame(animate);
  if (exporting) return;                           // the exporter owns the renderer while it runs
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  adaptQuality(rawDt);
  frameNo++;

  if (loopMode) {
    runLoop(dt);
  } else {
  if (!paused) {
    const simDt = dt * speed;
    const steps = Math.max(1, Math.ceil(simDt / 0.016));
    for (let i = 0; i < steps; i++) simulate(simDt / steps);
    cleanup();
    scheduleBallSound();                            // after the step, so the remaining flight time is exact
  }
  // The trunk's taper changes slowly: refresh the top two segments every frame, the rest round-robin.
  const nSeg = segments.length;
  for (let i = 0; i < nSeg; i++) if (i >= nSeg - 2 || (i + frameNo) % 4 === 0) placeSeg(segments[i]);
  updateBallVisual();

  trunkPoint(treeH, _bud);
  bud.position.copy(_bud);
  bud.scale.setScalar(1 + Math.sin(performance.now() / 250) * 0.08);
  budLight.position.copy(_bud);

  // smooth follow target
  _ft.copy(ballGroup.position); _ft.y += 1;
  const prevFT = _a.copy(followTarget);
  followTarget.lerp(_ft, 1 - Math.exp(-dt * 3));

  // camera
  if (proChk.checked) {
    director.update(dt, followTarget, _bud, !paused);
    sCam.textContent = NAMES[director.type] || 'Auto';
  } else {
    const delta = _b.subVectors(followTarget, prevFT);
    camera.position.add(delta); controls.target.add(delta);
    controls.autoRotate = !paused;
    controls.update();
    sCam.textContent = 'Free orbit';
  }
  }   // end of normal (non-loop) frame

  // light follows ball
  sun.position.copy(ballGroup.position).add(_t1.set(10, 20, 8));
  sun.target.position.copy(ballGroup.position);
  stars.position.copy(camera.position);

  if (!loopMode) { updateSky(ball.surf.y); updatePollen(dt, followTarget); }
  updateWind(ball.surf.y, dt);
  const overlayOn = updateOverlay(dt);

  // recording clock (wall time) / auto stop / outro
  if (recording) {
    recElapsed = recNow();
    if (loopRec) {
      // stop half a frame before the next cycle would begin, so the last frame leads straight back into the first
      if (!stopping && recElapsed >= recLimit - 0.5 / recFps) requestStop();
    } else if (recIsPro && recLimit > 0 && !stopping) {
      if (!director.outro && recLimit >= 12 && recElapsed >= recLimit - 5.2) {
        director.outro = true;
        director.next('craneUp', { cut: false, dur: 4.4 });   // smooth closing crane shot
      }
      if (recElapsed >= recLimit - 0.8) requestStop();
    }
    recTimeEl.textContent = `REC ${fmt(recElapsed)}${recIsPro && recLimit ? ' / ' + fmt(recLimit) : ''}`;
  }
  if (stopping && fade >= 0.999) finalizeStop();

  statTimer += dt; latTimer += dt;
  if (statTimer > 0.25) {
    statTimer = 0;
    if (loopMode) {
      sBall.textContent = 'looping'; sTree.textContent = '∞';
      sJumps.textContent = ((loopLastHop >= 0 ? loopLastHop % LOOP_N : 0) + 1) + '/' + LOOP_N;
    } else {
      sBall.textContent = ball.surf.y.toFixed(1) + ' m';
      sTree.textContent = treeH.toFixed(1) + ' m';
      sJumps.textContent = jumps;
    }
    quickRec.classList.toggle('recording', recording);
    quickRec.textContent = recording ? '⏹' : '⏺';
    quickPause.textContent = paused ? '▶' : '⏸';
    sFps.textContent = Math.round(1000 / emaMs) + (curPR < BASE_PR && !proChk.checked ? ' · res ' + Math.round(curPR * 100) + '%' : '');
  }
  if (latTimer > 1) { latTimer = 0; updateLatencyHint(); }

  renderer.clear();
  renderer.render(scene, camera);
  if (overlayOn) { renderer.clearDepth(); renderer.render(overlay, orthoCam); }
  if (snapRequested) doSnapshot();
}
animate();
window.__endlessLoop = { drawLoopAt, canvas, LOOP_T, LOOP_PHASE, full() { exporting = true; applyRendererOutput(); } };   // small hook used for automated seam tests
