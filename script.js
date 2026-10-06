/* ======================================================================
   Urban Flood Nowcasting Simulator — software-only, grid-based model
   ----------------------------------------------------------------------
   See README.md Section 5 for the full plain-English explanation of the
   maths below. The SIMULATION CORE (terrain, water balance, evacuation)
   is plain JavaScript with no dependencies. Only the VISUALISATION layer
   (the second half of this file) uses Three.js to draw it as a live,
   rotatable 3D terrain instead of a flat grid of boxes.
   ====================================================================== */

const ROWS = 8, COLS = 8;
const STEP_HOURS = 0.25;          // one simulation step = 15 simulated minutes
const WARNING_THRESHOLD = 30;     // %
const CRITICAL_THRESHOLD = 70;    // %
const IMP_LO = 0.3, IMP_HI = 0.55;
const OUTFLOW_RATE = 3.2;
const OVERFLOW_SHARE = 0.18;
const AUTO_STEP_HOURS = 0.5;      // how far "Run simulation" advances per tick
const AUTO_INTERVAL_MS = 1200;
const AUTO_MAX_HOURS = 10;

/* ---------------- City data ---------------- */
const CITIES = [
  {
    id: 'bengaluru', name: 'Bengaluru', state: 'Karnataka', seed: 44,
    blurb: 'Elevated plateau city built over encroached lakebeds that still try to flood.',
    hotspots: [
      { r: 2, c: 2, name: 'Silk Board' },
      { r: 4, c: 4, name: 'Bellandur' },
      { r: 6, c: 5, name: 'Koramangala' }
    ]
  },
  {
    id: 'mumbai', name: 'Mumbai', state: 'Maharashtra', seed: 11,
    blurb: 'Coastal metro — low-lying suburbs and heavily choked stormwater drains.',
    hotspots: [
      { r: 6, c: 1, name: 'Hindmata' },
      { r: 5, c: 5, name: 'Sion' },
      { r: 7, c: 6, name: 'Kurla' }
    ]
  },
  {
    id: 'chennai', name: 'Chennai', state: 'Tamil Nadu', seed: 23,
    blurb: 'Flat coastal terrain — the kind of low basin that flooded badly in 2015.',
    hotspots: [
      { r: 4, c: 6, name: 'Velachery' },
      { r: 6, c: 2, name: 'Mudichur' },
      { r: 2, c: 5, name: 'Kotturpuram' }
    ]
  },
  {
    id: 'delhi', name: 'Delhi', state: 'NCR', seed: 37,
    blurb: 'Inland capital — old drainage lines straining under newer construction.',
    hotspots: [
      { r: 3, c: 6, name: 'ITO' },
      { r: 5, c: 3, name: 'Minto Bridge' },
      { r: 1, c: 4, name: 'Civil Lines' }
    ]
  }
];

/* ---------------- Seeded RNG (so each city's layout is reproducible) ---------------- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* ---------------- Terrain generation ---------------- */
function generateTerrain(city) {
  const rand = mulberry32(city.seed);
  const grid = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      const hotspot = city.hotspots.find(h => h.r === r && h.c === c);
      let elevation, imperviousness, drainage;
      if (hotspot) {
        elevation = 0.05 + rand() * 0.10;
        imperviousness = 0.80 + rand() * 0.15;
        drainage = 0.08 + rand() * 0.10;
      } else {
        elevation = 0.30 + rand() * 0.65;
        imperviousness = 0.25 + rand() * 0.45;
        drainage = 0.30 + rand() * 0.55;
      }
      row.push({ r, c, elevation, imperviousness, drainage, name: hotspot ? hotspot.name : null });
    }
    grid.push(row);
  }
  return grid;
}

function zoneCode(r, c) {
  return String.fromCharCode(65 + r) + (c + 1); // A1 .. H8
}

function getNeighbors(r, c) {
  const out = [];
  if (r > 0) out.push({ r: r - 1, c, dir: 'north' });
  if (r < ROWS - 1) out.push({ r: r + 1, c, dir: 'south' });
  if (c > 0) out.push({ r, c: c - 1, dir: 'west' });
  if (c < COLS - 1) out.push({ r, c: c + 1, dir: 'east' });
  return out;
}

/* ---------------- Core simulation ---------------- */
function simulate(terrain, rainfall, durationHours) {
  let levels = terrain.map(row => row.map(() => 0));
  const steps = Math.max(0, Math.round(durationHours / STEP_HOURS));

  for (let s = 0; s < steps; s++) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = terrain[r][c];
        const impFactor = IMP_LO + cell.imperviousness * IMP_HI;
        const inflow = rainfall * STEP_HOURS * impFactor;
        const outflow = levels[r][c] * cell.drainage * STEP_HOURS * OUTFLOW_RATE;
        levels[r][c] = Math.max(0, levels[r][c] + inflow - outflow);
      }
    }
    const delta = terrain.map(row => row.map(() => 0));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = terrain[r][c];
        const lvl = levels[r][c];
        if (lvl <= CRITICAL_THRESHOLD) continue;
        const excess = lvl - CRITICAL_THRESHOLD;
        const downhill = getNeighbors(r, c).filter(n => terrain[n.r][n.c].elevation <= cell.elevation);
        if (downhill.length === 0) continue;
        const share = (excess * OVERFLOW_SHARE) / downhill.length;
        downhill.forEach(n => { delta[n.r][n.c] += share; });
        delta[r][c] -= share * downhill.length;
      }
    }
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        levels[r][c] = Math.max(0, levels[r][c] + delta[r][c]);
      }
    }
  }
  return levels;
}

function statusFor(pct) {
  if (pct >= CRITICAL_THRESHOLD) return 'critical';
  if (pct >= WARNING_THRESHOLD) return 'warning';
  return 'normal';
}

function buildGridResult(terrain, rainfall, durationHours) {
  const levels = simulate(terrain, rainfall, durationHours);
  return terrain.map((row, r) => row.map((cell, c) => {
    const pct = levels[r][c];
    return { ...cell, pct, status: statusFor(pct) };
  }));
}

/* ---------------- Evacuation logic ---------------- */
const DIR_LABEL = { north: 'North ↑', south: 'South ↓', east: 'East →', west: 'West ←' };
const DIR_ANGLE = { north: 0, south: Math.PI, east: -Math.PI / 2, west: Math.PI / 2 };

function evacuationFor(gridResult, r, c) {
  const options = getNeighbors(r, c).map(n => ({ ...n, cell: gridResult[n.r][n.c] }));
  if (options.length === 0) return { text: 'Shelter in place', arrow: '•', target: null, angle: 0 };
  let best = options[0];
  options.forEach(o => { if (o.cell.pct < best.cell.pct) best = o; });
  const current = gridResult[r][c].pct;
  if (best.cell.pct >= current) {
    return { text: 'Surrounded — shelter in place, await rescue', arrow: '•', target: null, angle: 0 };
  }
  const arrowMap = { north: '↑', south: '↓', east: '→', west: '←' };
  const targetName = best.cell.name ? best.cell.name : `Zone ${zoneCode(best.r, best.c)}`;
  return {
    text: `Evacuate ${DIR_LABEL[best.dir]} toward ${targetName}`,
    arrow: arrowMap[best.dir],
    target: { r: best.r, c: best.c },
    angle: DIR_ANGLE[best.dir]
  };
}

/* ======================================================================
   Application state
   ====================================================================== */
let activeCity = null;
let terrain = null;
let rainfall = 0;
let duration = 0;
let gridResult = null;
let previousStatus = {};   // key "r-c" -> status, used to detect NEW transitions for alerts
let alertLog = [];
let selectedCell = null;
let autoTimer = null;

function keyFor(r, c) { return `${r}-${c}`; }

function recompute() {
  gridResult = buildGridResult(terrain, rainfall, duration);
  updateAlerts();
  renderAll();
}

function updateAlerts() {
  const nowStatus = {};
  const newMessages = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = gridResult[r][c];
      const key = keyFor(r, c);
      nowStatus[key] = cell.status;
      const before = previousStatus[key] || 'normal';
      const rank = { normal: 0, warning: 1, critical: 2 };
      if (rank[cell.status] > rank[before]) {
        const label = cell.name ? `${cell.name} (Zone ${zoneCode(r, c)})` : `Zone ${zoneCode(r, c)}`;
        if (cell.status === 'critical') {
          const evac = evacuationFor(gridResult, r, c);
          newMessages.push({ text: `${label} reached CRITICAL — ${evac.text}`, level: 'critical' });
        } else if (cell.status === 'warning') {
          newMessages.push({ text: `${label} entered WARNING — water rising`, level: 'warning' });
        }
      }
    }
  }
  previousStatus = nowStatus;
  newMessages.forEach(m => alertLog.unshift(m));
  alertLog = alertLog.slice(0, 10);
}

/* ======================================================================
   3D VISUALISATION (Three.js)
   ----------------------------------------------------------------------
   One renderer/scene/camera is created once (ensureThree) and reused
   across city switches. Each city rebuilds the terrain+water meshes
   (buildCityScene). Every recompute() just updates mesh colours/heights
   (updateSceneFromGrid) — nothing is rebuilt from scratch, so it animates
   smoothly during "Run simulation".
   ====================================================================== */
const CELL_SIZE = 1.0, GAP = 0.12, STEP3D = CELL_SIZE + GAP;
const TERRAIN_BASE = 0.12, TERRAIN_SCALE = 1.7;
const WATER_MAX_HEIGHT = 1.3;
const ARROW_POOL_SIZE = 24, FLOW_POOL_SIZE = 24, MAX_RAIN = 480;

let renderer = null, scene = null, camera = null, cityGroup = null;
let raycaster = null, pointerVec = null;
let terrainMeshes = [], waterMeshes = [], hotspotAnchors = [];
let arrowPool = [], flowPool = [];
let rainGeo = null, rainVelocities = null;
let rafId = null, lastFrameTime = 0;

let isDragging = false, lastX = 0, lastY = 0, dragDistance = 0;
let azimuth = 0.7, polar = 1.0, radius = 9.5, autoRotate = true, idleTimer = null;
let threeFailed = false;

function ensureThree() {
  if (renderer) return true;
  if (typeof THREE === 'undefined') {
    threeFailed = true;
    const canvas = document.getElementById('sceneCanvas');
    canvas.insertAdjacentHTML('afterend',
      '<p class="scene-error">3D engine couldn\'t load — check your internet connection once, then reload this page. (The 3D view loads Three.js from a CDN the first time.)</p>');
    return false;
  }
  const canvas = document.getElementById('sceneCanvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  cityGroup = new THREE.Group();
  scene.add(cityGroup);
  raycaster = new THREE.Raycaster();
  pointerVec = new THREE.Vector2();

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.75);
  dirLight.position.set(5, 8, 4);
  scene.add(dirLight);
  const rimLight = new THREE.PointLight(0x22b8cf, 0.6, 30);
  rimLight.position.set(-6, 4, -6);
  scene.add(rimLight);

  const floorGrid = new THREE.GridHelper(Math.max(ROWS, COLS) * STEP3D + 2, 16, 0x22b8cf, 0x16243a);
  floorGrid.position.y = -0.02;
  scene.add(floorGrid);

  initArrowPool();
  initFlowPool();
  initRain();

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('resize', resizeRenderer);

  return true;
}

function initArrowPool() {
  const geo = new THREE.ConeGeometry(0.16, 0.42, 10);
  geo.rotateX(Math.PI / 2); // tip points toward -Z (north) by default; adjusted per-direction via rotation.y
  for (let i = 0; i < ARROW_POOL_SIZE; i++) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x662018, roughness: 0.4 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    arrowPool.push(mesh);
  }
}

function initFlowPool() {
  for (let i = 0; i < FLOW_POOL_SIZE; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.8 });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    scene.add(line);
    flowPool.push(line);
  }
}

function initRain() {
  rainGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX_RAIN * 3);
  rainVelocities = new Float32Array(MAX_RAIN);
  const spreadX = COLS * STEP3D * 0.55, spreadZ = ROWS * STEP3D * 0.55;
  for (let i = 0; i < MAX_RAIN; i++) {
    positions[i * 3] = (Math.random() * 2 - 1) * spreadX;
    positions[i * 3 + 1] = Math.random() * 6 + 2;
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * spreadZ;
    rainVelocities[i] = 4 + Math.random() * 3;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  rainGeo.setDrawRange(0, 0);
  const mat = new THREE.PointsMaterial({ color: 0x9fd8ff, size: 0.09, transparent: true, opacity: 0.8 });
  const points = new THREE.Points(rainGeo, mat);
  scene.add(points);
}

function clearGroup(group) {
  while (group.children.length) {
    const obj = group.children.pop();
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  }
}

function cellX(c) { return (c - (COLS - 1) / 2) * STEP3D; }
function cellZ(r) { return (r - (ROWS - 1) / 2) * STEP3D; }

function buildCityScene(terrainData) {
  clearGroup(cityGroup);
  terrainMeshes = []; waterMeshes = []; hotspotAnchors = [];
  clearLabels();

  const lowColor = new THREE.Color(0x24344c), highColor = new THREE.Color(0x5b6d88);

  for (let r = 0; r < ROWS; r++) {
    const tRow = [], wRow = [];
    for (let c = 0; c < COLS; c++) {
      const cell = terrainData[r][c];
      const h = TERRAIN_BASE + cell.elevation * TERRAIN_SCALE;
      const x = cellX(c), z = cellZ(r);

      const terrainColor = new THREE.Color().lerpColors(lowColor, highColor, cell.elevation);
      const tGeo = new THREE.BoxGeometry(CELL_SIZE * 0.92, h, CELL_SIZE * 0.92);
      const tMat = new THREE.MeshStandardMaterial({ color: terrainColor, roughness: 0.85, metalness: 0.05 });
      const tMesh = new THREE.Mesh(tGeo, tMat);
      tMesh.position.set(x, h / 2, z);
      tMesh.userData = { r, c };
      cityGroup.add(tMesh);
      tRow.push(tMesh);

      const wGeo = new THREE.BoxGeometry(CELL_SIZE * 0.68, 0.05, CELL_SIZE * 0.68);
      const wMat = new THREE.MeshStandardMaterial({
        color: 0x2fbf8f, transparent: true, opacity: 0.85, roughness: 0.25, metalness: 0.1, emissive: 0x000000
      });
      const wMesh = new THREE.Mesh(wGeo, wMat);
      wMesh.position.set(x, h + 0.025, z);
      wMesh.visible = false;
      wMesh.userData = { r, c, baseY: h, critical: false };
      cityGroup.add(wMesh);
      wRow.push(wMesh);

      if (cell.name) hotspotAnchors.push({ name: cell.name, x, y: h, z });
    }
    terrainMeshes.push(tRow);
    waterMeshes.push(wRow);
  }
  buildLabels();
}

function clearLabels() {
  document.getElementById('labelsOverlay').innerHTML = '';
}

function buildLabels() {
  const overlay = document.getElementById('labelsOverlay');
  hotspotAnchors.forEach(h => {
    const el = document.createElement('div');
    el.className = 'hotspot-label';
    el.textContent = h.name;
    overlay.appendChild(el);
    h.el = el;
  });
}

function updateSceneFromGrid(grid) {
  if (!renderer) return;
  let arrowIdx = 0, flowIdx = 0;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      const wMesh = waterMeshes[r][c];
      const targetH = Math.max(0.05, (clamp(cell.pct, 0, 160) / 100) * WATER_MAX_HEIGHT);
      wMesh.visible = cell.pct > 1;
      wMesh.scale.y = targetH / 0.05;
      wMesh.position.y = wMesh.userData.baseY + targetH / 2;

      const color = cell.status === 'critical' ? 0xe4483c : cell.status === 'warning' ? 0xf2a93b : 0x2fbf8f;
      wMesh.material.color.setHex(color);
      wMesh.userData.critical = cell.status === 'critical';
      wMesh.material.emissive.setHex(wMesh.userData.critical ? 0x661a15 : 0x000000);
      wMesh.material.emissiveIntensity = wMesh.userData.critical ? 0.5 : 0;

      if (cell.status === 'critical') {
        const evac = evacuationFor(grid, r, c);
        const tMesh = terrainMeshes[r][c];

        if (arrowIdx < arrowPool.length) {
          const arrow = arrowPool[arrowIdx++];
          arrow.visible = true;
          arrow.position.set(tMesh.position.x, wMesh.position.y + targetH / 2 + 0.3, tMesh.position.z);
          arrow.rotation.y = evac.angle;
        }
        if (evac.target && flowIdx < flowPool.length) {
          const line = flowPool[flowIdx];
          const a = tMesh.position, b = terrainMeshes[evac.target.r][evac.target.c].position;
          const pos = line.geometry.attributes.position;
          pos.setXYZ(0, a.x, a.y + 0.2, a.z);
          pos.setXYZ(1, b.x, b.y + 0.2, b.z);
          pos.needsUpdate = true;
          line.visible = true;
          flowIdx++;
        }
      }
    }
  }
  for (; arrowIdx < arrowPool.length; arrowIdx++) arrowPool[arrowIdx].visible = false;
  for (; flowIdx < flowPool.length; flowIdx++) flowPool[flowIdx].visible = false;
}

/* ---------------- Camera interaction ---------------- */
function onPointerDown(e) {
  isDragging = true; lastX = e.clientX; lastY = e.clientY; dragDistance = 0;
  autoRotate = false;
  e.target.setPointerCapture(e.pointerId);
}
function onPointerMove(e) {
  if (!isDragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  dragDistance += Math.abs(dx) + Math.abs(dy);
  lastX = e.clientX; lastY = e.clientY;
  azimuth -= dx * 0.006;
  polar = clamp(polar - dy * 0.006, 0.35, 1.4);
}
function onPointerUp(e) {
  isDragging = false;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { autoRotate = true; }, 2500);
  if (dragDistance < 6) handleCanvasSelect(e);
}
function onWheel(e) {
  e.preventDefault();
  radius = clamp(radius + e.deltaY * 0.01, 6, 15);
}

function handleCanvasSelect(e) {
  if (!renderer || !terrainMeshes.length) return;
  const canvas = document.getElementById('sceneCanvas');
  const rect = canvas.getBoundingClientRect();
  pointerVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointerVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerVec, camera);
  const hits = raycaster.intersectObjects(terrainMeshes.flat());
  if (hits.length > 0) {
    const { r, c } = hits[0].object.userData;
    selectCell(r, c);
  }
}

function resizeRenderer() {
  if (!renderer) return;
  const canvas = document.getElementById('sceneCanvas');
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function updateRainParticles(dt) {
  const active = Math.round((clamp(rainfall, 0, 120) / 120) * MAX_RAIN);
  rainGeo.setDrawRange(0, active);
  if (active === 0) return;
  const pos = rainGeo.attributes.position.array;
  for (let i = 0; i < active; i++) {
    pos[i * 3 + 1] -= rainVelocities[i] * dt * 2.2;
    if (pos[i * 3 + 1] < 0.1) pos[i * 3 + 1] = 5 + Math.random() * 2;
  }
  rainGeo.attributes.position.needsUpdate = true;
}

function updateLabels() {
  const canvas = document.getElementById('sceneCanvas');
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  const v = new THREE.Vector3();
  hotspotAnchors.forEach(hp => {
    v.set(hp.x, hp.y + 0.5, hp.z);
    v.project(camera);
    if (!hp.el) return;
    if (v.z > 1) { hp.el.style.display = 'none'; return; }
    hp.el.style.display = 'block';
    hp.el.style.left = ((v.x * 0.5 + 0.5) * w) + 'px';
    hp.el.style.top = ((-v.y * 0.5 + 0.5) * h) + 'px';
  });
}

function loop(now) {
  rafId = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000 || 0.016);
  lastFrameTime = now;

  if (autoRotate) azimuth += 0.18 * dt;
  camera.position.set(
    radius * Math.sin(polar) * Math.sin(azimuth),
    radius * Math.cos(polar) + 0.4,
    radius * Math.sin(polar) * Math.cos(azimuth)
  );
  camera.lookAt(0, 0.6, 0);

  updateRainParticles(dt);
  updateLabels();

  const pulse = 0.6 + 0.4 * Math.sin(now / 1000 * 3.2);
  flowPool.forEach(l => { if (l.visible) l.material.opacity = 0.3 + 0.55 * pulse; });
  arrowPool.forEach(a => { if (a.visible) a.scale.setScalar(0.9 + 0.15 * pulse); });
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const wMesh = waterMeshes[r] && waterMeshes[r][c];
    if (wMesh && wMesh.userData.critical) wMesh.material.emissiveIntensity = 0.35 + 0.45 * pulse;
  }

  renderer.render(scene, camera);
}

function startLoop() {
  if (rafId == null && renderer) { lastFrameTime = performance.now(); rafId = requestAnimationFrame(loop); }
}
function stopLoop() {
  if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
}

/* ======================================================================
   DOM rendering (side panel — unchanged by the 3D upgrade)
   ====================================================================== */
function renderCityCards() {
  const container = document.getElementById('cityGrid');
  container.innerHTML = CITIES.map(city => `
    <button class="city-card" data-id="${city.id}">
      <span class="city-name">${city.name}</span>
      <span class="city-state">${city.state}</span>
      <span class="city-blurb">${city.blurb}</span>
      <span class="city-hotspots">Known hotspots: ${city.hotspots.map(h => h.name).join(', ')}</span>
    </button>
  `).join('');
  container.querySelectorAll('.city-card').forEach(btn => {
    btn.addEventListener('click', () => selectCity(btn.dataset.id));
  });
}

function selectCity(id) {
  activeCity = CITIES.find(c => c.id === id);
  terrain = generateTerrain(activeCity);
  rainfall = 0;
  duration = 0;
  previousStatus = {};
  alertLog = [];
  selectedCell = null;

  document.getElementById('cityTitle').textContent = `${activeCity.name} Flood Terrain`;
  document.getElementById('cityBlurb').textContent = activeCity.blurb;
  document.getElementById('rainSlider').value = 0;
  document.getElementById('durationSlider').value = 0;
  document.getElementById('rainSliderValue').textContent = '0 mm/hr';
  document.getElementById('durationSliderValue').textContent = '0.0 hr';
  document.getElementById('rainHint').textContent = 'No rain';

  document.getElementById('citySelectScreen').classList.add('hidden');
  document.getElementById('simulatorScreen').classList.remove('hidden');

  if (ensureThree()) {
    buildCityScene(terrain);
    resizeRenderer();
    startLoop();
  }
  recompute();
}

function backToCitySelect() {
  stopAutoRun();
  stopLoop();
  document.getElementById('simulatorScreen').classList.add('hidden');
  document.getElementById('citySelectScreen').classList.remove('hidden');
}

function selectCell(r, c) {
  selectedCell = { r, c };
  renderCellDetail();
}

function renderCellDetail() {
  const el = document.getElementById('cellDetail');
  if (!selectedCell) { el.textContent = 'Click any terrain block for its data.'; return; }
  const { r, c } = selectedCell;
  const cell = gridResult[r][c];
  const label = cell.name ? `${cell.name} (Zone ${zoneCode(r, c)})` : `Zone ${zoneCode(r, c)}`;
  let evacLine = '';
  if (cell.status === 'critical') {
    evacLine = `<dt>Evacuation</dt><dd>${evacuationFor(gridResult, r, c).text}</dd>`;
  }
  el.innerHTML = `
    <dl>
      <dt>Zone</dt><dd>${label}</dd>
      <dt>Status</dt><dd style="color:var(--${cell.status})">${cell.status.toUpperCase()}</dd>
      <dt>Water level</dt><dd>${cell.pct.toFixed(1)}%</dd>
      <dt>Elevation</dt><dd>${(cell.elevation * 100).toFixed(0)} / 100 (lower = low-lying)</dd>
      <dt>Imperviousness</dt><dd>${(cell.imperviousness * 100).toFixed(0)}% paved/concrete</dd>
      <dt>Drainage capacity</dt><dd>${(cell.drainage * 100).toFixed(0)}%</dd>
      ${evacLine}
    </dl>
  `;
}

function renderStats() {
  const counts = { normal: 0, warning: 0, critical: 0 };
  gridResult.flat().forEach(cell => counts[cell.status]++);

  document.getElementById('countNormal').textContent = counts.normal;
  document.getElementById('countWarning').textContent = counts.warning;
  document.getElementById('countCritical').textContent = counts.critical;

  document.getElementById('affectedReadout').textContent = `${counts.warning + counts.critical} / ${ROWS * COLS}`;
  document.getElementById('rainReadout').textContent = `${rainfall} mm/hr`;
  document.getElementById('durationReadout').textContent = `${duration.toFixed(1)} hr`;

  const worst = counts.critical > 0 ? 'critical' : counts.warning > 0 ? 'warning' : 'normal';
  const pill = document.getElementById('cityStatus');
  pill.textContent = worst.charAt(0).toUpperCase() + worst.slice(1);
  pill.style.setProperty('--risk-color', `var(--${worst})`);
}

function renderAlerts() {
  const feed = document.getElementById('alertFeed');
  if (alertLog.length === 0) {
    feed.innerHTML = '<p class="alert-empty">No active alerts.</p>';
    return;
  }
  feed.innerHTML = alertLog.map(a =>
    `<div class="alert-item ${a.level === 'warning' ? 'warning-alert' : ''}">⚠ ${a.text}</div>`
  ).join('');
}

function renderAll() {
  updateSceneFromGrid(gridResult);
  renderStats();
  renderAlerts();
  renderCellDetail();
}

function rainHintText(mmhr) {
  if (mmhr === 0) return 'No rain';
  if (mmhr < 15) return 'Light rain';
  if (mmhr < 40) return 'Moderate rain';
  if (mmhr < 65) return 'Heavy rain';
  if (mmhr < 90) return 'Very heavy rain';
  return 'Extreme / cloudburst-level rain';
}

/* ---------------- Controls ---------------- */
function stopAutoRun() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  document.getElementById('runBtn').textContent = '▶ Run simulation';
}

function toggleAutoRun() {
  if (autoTimer) { stopAutoRun(); return; }
  document.getElementById('runBtn').textContent = '⏸ Pause';
  autoTimer = setInterval(() => {
    duration = clamp(duration + AUTO_STEP_HOURS, 0, AUTO_MAX_HOURS);
    document.getElementById('durationSlider').value = duration;
    document.getElementById('durationSliderValue').textContent = `${duration.toFixed(1)} hr`;
    recompute();
    if (duration >= AUTO_MAX_HOURS) stopAutoRun();
  }, AUTO_INTERVAL_MS);
}

function stepOnce() {
  duration = clamp(duration + 0.25, 0, AUTO_MAX_HOURS);
  document.getElementById('durationSlider').value = duration;
  document.getElementById('durationSliderValue').textContent = `${duration.toFixed(1)} hr`;
  recompute();
}

function resetSimulation() {
  stopAutoRun();
  rainfall = 0;
  duration = 0;
  previousStatus = {};
  alertLog = [];
  selectedCell = null;
  document.getElementById('rainSlider').value = 0;
  document.getElementById('durationSlider').value = 0;
  document.getElementById('rainSliderValue').textContent = '0 mm/hr';
  document.getElementById('durationSliderValue').textContent = '0.0 hr';
  document.getElementById('rainHint').textContent = 'No rain';
  recompute();
}

/* ---------------- Init ---------------- */
window.addEventListener('DOMContentLoaded', () => {
  renderCityCards();

  document.getElementById('backBtn').addEventListener('click', backToCitySelect);

  document.getElementById('rainSlider').addEventListener('input', (e) => {
    rainfall = Number(e.target.value);
    document.getElementById('rainSliderValue').textContent = `${rainfall} mm/hr`;
    document.getElementById('rainHint').textContent = rainHintText(rainfall);
    recompute();
  });

  document.getElementById('durationSlider').addEventListener('input', (e) => {
    duration = Number(e.target.value);
    document.getElementById('durationSliderValue').textContent = `${duration.toFixed(1)} hr`;
    recompute();
  });

  document.getElementById('runBtn').addEventListener('click', toggleAutoRun);
  document.getElementById('stepBtn').addEventListener('click', stepOnce);
  document.getElementById('resetBtn').addEventListener('click', resetSimulation);
});
