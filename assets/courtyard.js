/* Sentinel site: the shared synthetic courtyard.
   An illustration, never footage: one small walled courtyard seen from a camera 2.6 m up, with a scripted loop of
   two people, drawn as dots and lines (a field study, not a scan: no depth is measured anywhere). Deterministic:
   sample(t) is a pure function of t. Used by the live dashboard (its "camera picture"), the page's field study and
   evidence plate, and the hardware film (which draws the same model in WebGL).
   Contract: shared/CONTRACT.md. No dependencies; classic script (window.SentinelCourtyard) or CommonJS. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SentinelCourtyard = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------- the camera and the yard (metres)
  const W = 960, H = 540;
  const F = 560;          // focal length in px of the logical frame
  const CAM_H = 2.6;      // lens height above the paving
  const Y0 = 110;         // the horizon's row: a level camera whose frame is shifted down (a tilt-free "shift" view)
  const LOOP_S = 72;
  const YARD = { left: -3.6, right: 4.4, back: 10.5, wallH: 3.4 };
  const GATE = { x1: 1.3, x2: 2.8, h: 2.3 };                   // in the back wall
  const DOOR = { z1: 5.35, z2: 6.6, h: 2.15 };                 // in the left wall
  const ZONE_RECT = { x1: -3.35, x2: -1.3, z1: 5.0, z2: 7.4 }; // Zone A, on the paving before that door
  const TREE = { x: -1.75, z: 9.2 };
  const BENCH = { x1: 3.25, x2: 4.2, z1: 6.9, z2: 8.9, h: 0.46 };
  const PLANT = { x: 2.25, z: 3.75 };

  function project(X, Y, Z) { return [W / 2 + (F * X) / Z, Y0 + (F * (CAM_H - Y)) / Z]; }
  const ground = (X, Z) => project(X, 0, Z);
  const norm = (p) => [p[0] / W, p[1] / H];
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => k * k * (3 - 2 * k);
  function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  const ZONE = {
    name: "Zone A",
    world: ZONE_RECT,
    polygon: [[ZONE_RECT.x1, ZONE_RECT.z1], [ZONE_RECT.x2, ZONE_RECT.z1], [ZONE_RECT.x2, ZONE_RECT.z2],
      [ZONE_RECT.x1, ZONE_RECT.z2]].map(([x, z]) => norm(ground(x, z))),
  };

  // ---------------------------------------------------------------- the script
  // Keyframes: [t, X, Z]. Between two equal positions the person stands.
  const PATHS = {
    a: [[6.0, 2.05, 10.3], [8.2, 1.7, 8.9], [11.2, 0.35, 7.25], [14.0, -1.3, 6.45], [17.0, -2.35, 6.0],
      [20.0, -2.35, 6.0], [21.2, -2.62, 5.9], [24.5, -2.62, 5.9], [25.6, -2.5, 6.1], [30.0, -2.5, 6.1],
      [31.5, -1.3, 6.6], [33.6, 0.55, 8.25], [36.0, 2.05, 10.3]],
    b: [[44.0, 2.05, 10.3], [46.6, 2.75, 8.9], [48.6, 2.9, 8.15], [53.0, 2.9, 8.15], [55.2, 2.6, 9.0],
      [58.0, 2.05, 10.3]],
  };
  const ACTORS = {
    a: { track: 73, enrolled: true, note: "the enrolled demo identity",
      coat: "#34454a", coatLit: "#46595e", legs: "#565f5f", hair: "#2b2623", skin: "#caa187" },
    b: { track: 74, enrolled: false, note: "a visitor, not enrolled",
      coat: "#9c614a", coatLit: "#b3755b", legs: "#3d3b39", hair: "#1e1b19", skin: "#ad7d60" },
  };
  // Where each person looks while standing (radians: 0 faces the camera, PI faces away, +PI/2 faces the left wall).
  const STANCE = { a: [[17.0, 20.0, 0.0], [20.0, 30.0, 2.15]], b: [[48.6, 53.0, 0.15]] };
  const FACE = { a: [[9.0, 20.0], [30.0, 32.0]], b: [[45.5, 53.0]] };
  const STALL = [65.5, 68.5];

  const EVENTS = [
    { t: 6.0, kind: "enter", actor: "a" }, { t: 7.0, kind: "confirmed", actor: "a" },
    { t: 9.0, kind: "face_on", actor: "a" }, { t: 14.0, kind: "zone_enter", actor: "a" },
    { t: 20.0, kind: "face_off", actor: "a" }, { t: 30.0, kind: "face_on", actor: "a" },
    { t: 31.5, kind: "zone_exit", actor: "a" }, { t: 32.0, kind: "face_off", actor: "a" },
    { t: 36.0, kind: "leave", actor: "a" },
    { t: 44.0, kind: "enter", actor: "b" }, { t: 45.0, kind: "confirmed", actor: "b" },
    { t: 45.5, kind: "face_on", actor: "b" }, { t: 53.0, kind: "face_off", actor: "b" },
    { t: 58.0, kind: "leave", actor: "b" },
    { t: STALL[0], kind: "stall_start" }, { t: STALL[1], kind: "stall_end" },
  ];
  const SCENARIOS = [
    { id: "arrival", label: "Arrival", t: 5.0 }, { id: "zone", label: "Zone event", t: 12.5 },
    { id: "retained", label: "Looks away", t: 19.0 }, { id: "visitor", label: "Unknown visitor", t: 43.0 },
    { id: "stall", label: "Stream stalls", t: 64.5 },
  ];

  function wrap(t) { const m = t % LOOP_S; return m < 0 ? m + LOOP_S : m; }

  function inPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
      if ((yi > point[1]) !== (yj > point[1]) && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function along(id, t) {  // position, speed and heading of one person, or null when out of the frame
    const keys = PATHS[id];
    if (t < keys[0][0] || t >= keys[keys.length - 1][0]) return null;
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1][0]) i += 1;
    const [t0, x0, z0] = keys[i], [t1, x1, z1] = keys[i + 1];
    const k = (t - t0) / (t1 - t0);
    const still = x0 === x1 && z0 === z1;
    const e = still ? k : smooth(k) * 0.35 + k * 0.65;  // nearly even pace, eased at the turns
    const X = lerp(x0, x1, e), Z = lerp(z0, z1, e);
    const dist = Math.hypot(x1 - x0, z1 - z0);
    const speed = still ? 0 : dist / (t1 - t0);
    let heading = Math.atan2(x0 - x1, z0 - z1);  // 0 = walking toward the camera
    if (still) {
      heading = 0;
      for (const [s0, s1, angle] of STANCE[id] || []) if (t >= s0 && t < s1) heading = angle;
    }
    // distance walked so far drives the stride, so the legs never slide
    let walked = 0;
    for (let j = 0; j < i; j += 1) walked += Math.hypot(keys[j + 1][1] - keys[j][1], keys[j + 1][2] - keys[j][2]);
    walked += dist * e;
    return { X, Z, speed, heading, walked, still };
  }

  function sample(time) {
    const t = wrap(time);
    const stalled = t >= STALL[0] && t < STALL[1];
    const actors = [];
    for (const id of Object.keys(PATHS)) {
      const at = along(id, t);
      if (!at) continue;
      const spec = ACTORS[id];
      const first = PATHS[id][0][0], last = PATHS[id][PATHS[id].length - 1][0];
      const s = F / at.Z;                       // px per metre at this depth
      const foot = ground(at.X, at.Z);
      const top = project(at.X, 1.78, at.Z)[1];
      const half = 0.31 * s;
      const headC = project(at.X, 1.62, at.Z);
      const hr = 0.15 * s;
      const faceVisible = (FACE[id] || []).some(([f0, f1]) => t >= f0 && t < f1);
      const box = [clamp01((foot[0] - half) / W), clamp01((top - 0.03 * s) / H), clamp01((foot[0] + half) / W),
        clamp01((foot[1] + 0.04 * s) / H)];
      const head = [clamp01((headC[0] - hr) / W), clamp01((headC[1] - hr * 1.1) / H), clamp01((headC[0] + hr) / W),
        clamp01((headC[1] + hr * 1.15) / H)];
      actors.push({
        id, track: spec.track, enrolled: spec.enrolled, box, head, foot: norm(foot), faceVisible,
        inZone: inPolygon(norm(foot), ZONE.polygon), confirmed: t >= first + 1.0, moving: !at.still,
        // beyond the contract (for the page and the film):
        world: { X: at.X, Z: at.Z }, heading: at.heading, walked: at.walked, speed: at.speed, scale: s,
        appear: clamp01((t - first) / 0.7) * clamp01((last - t) / 0.7),
      });
    }
    actors.sort((p, q) => q.world.Z - p.world.Z);
    return { t, stalled, actors };
  }

  // ---------------------------------------------------------------- the model: the yard as dots and lines, in metres
  // One model of the yard, drawn three ways: by render() below on a 2D canvas (the dashboard's camera picture, the
  // page's field view, the evidence plate) and by the hardware film in WebGL. Deterministic: no randomness at run time.
  const NEAR = 1.6;     // nothing nearer the camera than this is part of the yard
  const SPACING = 0.1;  // the dot grid on the paving and the walls

  function grid(out, x0, x1, y0, y1, step, put, skip) {
    for (let a = x0 + step / 2; a < x1; a += step) for (let b = y0 + step / 2; b < y1; b += step) if (!skip || !skip(a, b)) put(out, a, b);
  }
  function seg(out, a, b) { out.push(a[0], a[1], a[2], b[0], b[1], b[2]); }
  function boxLines(out, x1, x2, y1, y2, z1, z2) {
    const c = [[x1, y1, z1], [x2, y1, z1], [x2, y1, z2], [x1, y1, z2], [x1, y2, z1], [x2, y2, z1], [x2, y2, z2], [x1, y2, z2]];
    [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([i, j]) => seg(out, c[i], c[j]));
  }
  function ring(out, x, y, z, r, n) {
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
      seg(out, [x + r * Math.cos(a), y, z + r * Math.sin(a)], [x + r * Math.cos(b), y, z + r * Math.sin(b)]);
    }
  }

  const MODEL = (function build() {
    const { left: L, right: R, back: B, wallH: WH } = YARD;
    const floor = [], back = [], leftWall = [], rightWall = [], props = [];
    const gridLines = [], edges = [], rightEdges = [], propLines = [];
    grid(floor, L, R, NEAR, B, SPACING, (o, x, z) => o.push(x, 0, z));
    grid(back, L, R, 0, WH, SPACING, (o, x, y) => o.push(x, y, B), (x, y) => x > GATE.x1 && x < GATE.x2 && y < GATE.h);
    grid(leftWall, NEAR, B, 0, WH, SPACING, (o, z, y) => o.push(L, y, z), (z, y) => z > DOOR.z1 && z < DOOR.z2 && y < DOOR.h);
    grid(rightWall, NEAR, B, 0, WH, SPACING, (o, z, y) => o.push(R, y, z));
    // the paving's one-metre joints
    for (let x = Math.ceil(L); x < R; x += 1) seg(gridLines, [x, 0, NEAR], [x, 0, B]);
    for (let z = Math.ceil(NEAR); z < B; z += 1) seg(gridLines, [L, 0, z], [R, 0, z]);
    // the yard's outline, the door and the gate
    seg(edges, [L, 0, NEAR], [R, 0, NEAR]); seg(edges, [L, 0, NEAR], [L, 0, B]); seg(edges, [L, 0, B], [R, 0, B]);
    seg(edges, [L, WH, B], [R, WH, B]); seg(edges, [L, 0, B], [L, WH, B]); seg(edges, [R, 0, B], [R, WH, B]);
    seg(edges, [L, WH, NEAR], [L, WH, B]); seg(edges, [L, 0, NEAR], [L, WH, NEAR]);
    seg(edges, [L, 0, DOOR.z1], [L, DOOR.h, DOOR.z1]); seg(edges, [L, DOOR.h, DOOR.z1], [L, DOOR.h, DOOR.z2]); seg(edges, [L, DOOR.h, DOOR.z2], [L, 0, DOOR.z2]);
    seg(edges, [GATE.x1, 0, B], [GATE.x1, GATE.h, B]); seg(edges, [GATE.x1, GATE.h, B], [GATE.x2, GATE.h, B]); seg(edges, [GATE.x2, GATE.h, B], [GATE.x2, 0, B]);
    seg(rightEdges, [R, 0, NEAR], [R, 0, B]); seg(rightEdges, [R, WH, NEAR], [R, WH, B]); seg(rightEdges, [R, 0, NEAR], [R, WH, NEAR]);
    // the bench, the tree's planter and its trunk, the plant's pot
    boxLines(propLines, BENCH.x1, BENCH.x2, 0, BENCH.h, BENCH.z1, BENCH.z2);
    grid(props, BENCH.x1, BENCH.x2, BENCH.z1, BENCH.z2, SPACING, (o, x, z) => o.push(x, BENCH.h, z));
    const p = 0.5;
    boxLines(propLines, TREE.x - p, TREE.x + p, 0, 0.46, TREE.z - p, TREE.z + p);
    grid(props, TREE.x - p, TREE.x + p, TREE.z - p, TREE.z + p, SPACING, (o, x, z) => o.push(x, 0.46, z));
    seg(propLines, [TREE.x, 0.46, TREE.z], [TREE.x, 2.05, TREE.z]);
    for (let y = 0.52; y < 2.05; y += 0.06) props.push(TREE.x, y, TREE.z);
    ring(propLines, PLANT.x, 0.42, PLANT.z, 0.27, 28); ring(propLines, PLANT.x, 0.0, PLANT.z, 0.2, 24);
    for (let i = 0; i < 4; i += 1) { const a = (i / 4) * Math.PI * 2 + 0.4; seg(propLines, [PLANT.x + 0.2 * Math.cos(a), 0, PLANT.z + 0.2 * Math.sin(a)], [PLANT.x + 0.27 * Math.cos(a), 0.42, PLANT.z + 0.27 * Math.sin(a)]); }
    for (let k = 1; k < 4; k += 1) for (let i = 0; i < 30; i += 1) {
      const h = k * 0.105, r = 0.2 + 0.07 * (h / 0.42), a = (i / 30) * Math.PI * 2;
      props.push(PLANT.x + r * Math.cos(a), h, PLANT.z + r * Math.sin(a));
    }
    // the tree's crown: clusters of dots on rough spheres (the sway is applied when drawn)
    const crown = [];
    const blobs = [[0, 2.75, 0.95, 0], [-0.72, 2.5, 0.66, 0.25], [0.74, 2.55, 0.7, -0.2], [-0.35, 3.3, 0.7, -0.15], [0.42, 3.36, 0.62, 0.2],
      [0.05, 2.25, 0.6, 0.35], [-1.02, 2.95, 0.42, 0], [1.05, 3.02, 0.42, 0.1]];
    let s = 1;
    blobs.forEach(([dx, y, r, dz], i) => {
      const n = Math.round(240 * r * r);
      for (let k = 0; k < n; k += 1) {
        const u = hash(s += 1), v = hash(s += 1), w = hash(s += 1);
        const th = Math.acos(2 * u - 1), ph = v * Math.PI * 2, rr = r * (0.72 + 0.28 * Math.sqrt(w));
        crown.push(TREE.x + dx + rr * Math.sin(th) * Math.cos(ph), y + rr * Math.cos(th), TREE.z + dz + rr * Math.sin(th) * Math.sin(ph));
      }
      s += i;
    });
    const f32 = (a) => new Float32Array(a);
    return { floor: f32(floor), back: f32(back), left: f32(leftWall), right: f32(rightWall), props: f32(props), crown: f32(crown),
      grid: f32(gridLines), edges: f32(edges), rightEdges: f32(rightEdges), propLines: f32(propLines), spacing: SPACING };
  })();

  function swayAt(t) { return Math.sin(t * 0.9) * 0.035 + Math.sin(t * 2.3 + 1) * 0.012; }
  function crownPoints(t, out) {  // the crown, moved by the wind
    const c = MODEL.crown, k = swayAt(t), o = out || new Float32Array(c.length);
    for (let i = 0; i < c.length; i += 3) { o[i] = c[i] + k * (c[i + 1] - 1.6); o[i + 1] = c[i + 1]; o[i + 2] = c[i + 2]; }
    return o;
  }
  const LEAVES = [[-0.42, 0.95, -0.55, 0.2], [-0.2, 1.22, -0.2, -0.1], [0.05, 1.3, 0.05, 0.25], [0.3, 1.14, 0.35, -0.15], [0.5, 0.86, 0.62, 0.1],
    [-0.55, 0.66, -0.8, -0.2], [0.62, 0.6, 0.86, 0.22]];
  const LEAF_N = 15;
  function leafPoints(t, out) {  // the plant's leaves: each an outline of dots, swaying a little
    const o = out || new Float32Array(LEAVES.length * (LEAF_N * 2 + 6) * 3);
    let n = 0;
    const put = (x, y, z) => { o[n] = x; o[n + 1] = y; o[n + 2] = z; n += 3; };
    LEAVES.forEach(([dx, hh, lean, dz], i) => {
      const sw = Math.sin(t * 1.1 + i) * 0.02;
      const rx = PLANT.x + lean * 0.06, rz = PLANT.z + dz * 0.15, ry = 0.42;
      const tx = PLANT.x + dx + sw, tz = PLANT.z + dz, ty = 0.42 + hh;
      const ax = tx - rx, az = tz - rz, len = Math.hypot(ax, az) || 1, nx = -az / len, nz = ax / len;  // across the leaf
      for (const side of [-1, 1]) {
        for (let k = 0; k < LEAF_N; k += 1) {
          const u = k / (LEAF_N - 1), wdt = Math.sin(Math.PI * u) * 0.11 * side;
          put(rx + ax * u + nx * wdt, ry + (ty - ry) * (u * (2 - u)) * 0.9 + (ty - ry) * 0.1 * u, rz + az * u + nz * wdt);
        }
      }
      for (let k = 1; k <= 6; k += 1) { const u = k / 7; put(rx + ax * u, ry + (ty - ry) * (u * (2 - u)) * 0.9 + (ty - ry) * 0.1 * u, rz + az * u); }
    });
    return o;
  }

  // A person as dots on the meridians of a few simple solids, posed by the script: heading, stride, bob.
  const BODY_N = 1000;
  function bodyPoints(actor, out) {
    const o = out || new Float32Array(BODY_N * 3);
    const h = actor.heading, fx = -Math.sin(h), fz = -Math.cos(h), sx = Math.cos(h), sz = -Math.sin(h);
    const ox = actor.world.X, oz = actor.world.Z;
    const phase = actor.walked * 4.4, stride = actor.moving ? Math.sin(phase) : 0;
    const bob = actor.moving ? Math.abs(Math.cos(phase)) * 0.025 : 0;
    let n = 0;
    const put = (lx, ly, lz) => { if (n >= o.length) return; o[n] = ox + sx * lx + fx * lz; o[n + 1] = ly + bob; o[n + 2] = oz + sz * lx + fz * lz; n += 3; };
    const TAU = Math.PI * 2;
    for (let i = 0; i < 20; i += 1) {  // torso and hips, shoulders rounded
      const a = (i / 20) * TAU, c = Math.cos(a), s = Math.sin(a);
      for (let j = 0; j < 17; j += 1) {
        const k = j / 16, y = 0.86 + 0.6 * k;
        const rx = 0.15 + 0.06 * k - (k > 0.86 ? (k - 0.86) * 0.8 : 0), rz = 0.095 + 0.015 * k;
        put(rx * c, y, rz * s);
      }
    }
    for (let i = 0; i < 12; i += 1) {  // head
      const a = (i / 12) * TAU;
      for (let j = 1; j < 9; j += 1) { const th = (j / 9) * Math.PI, r = Math.sin(th); put(0.088 * r * Math.cos(a), 1.635 + 0.112 * Math.cos(th), 0.01 + 0.098 * r * Math.sin(a)); }
    }
    for (let i = 0; i < 6; i += 1) { const a = (i / 6) * TAU; for (let j = 0; j < 3; j += 1) put(0.045 * Math.cos(a), 1.47 + j * 0.03, 0.045 * Math.sin(a)); }  // neck
    for (const side of [-1, 1]) {  // legs and feet
      const th = 0.36 * stride * side, ct = Math.cos(th), st = Math.sin(th), Lg = 0.84;
      for (let j = 0; j < 16; j += 1) {
        const u = j / 15, r = 0.068 - 0.022 * u, y = -Lg * u;
        for (let i = 0; i < 9; i += 1) { const a = (i / 9) * TAU, z = r * Math.sin(a); put(side * 0.085 + r * Math.cos(a), 0.9 + y * ct - z * st, y * st + z * ct); }
      }
      const ay = 0.9 - Lg * ct, az = -Lg * st;
      for (const w of [-0.03, 0.03]) for (let v = 0; v < 6; v += 1) put(side * 0.085 + w, Math.max(0.02, ay - 0.04), az + v * 0.035);
    }
    for (const side of [-1, 1]) {  // arms and hands, swinging against the legs
      const ph = -0.3 * stride * side, cp = Math.cos(ph), sp = Math.sin(ph), ab = 0.07, La = 0.58;
      for (let j = 0; j < 12; j += 1) {
        const u = j / 11, r = 0.044 - 0.01 * u;
        for (let i = 0; i < 7; i += 1) {
          const a = (i / 7) * TAU, x = side * (0.205 + Math.sin(ab) * La * u) + r * Math.cos(a), y = -Math.cos(ab) * La * u, z = r * Math.sin(a);
          put(x, 1.42 + y * cp - z * sp, y * sp + z * cp);
        }
      }
      const hy = -Math.cos(ab) * La * 1.06;
      for (let i = 0; i < 6; i += 1) { const a = (i / 6) * TAU; put(side * (0.205 + Math.sin(ab) * La * 1.06) + 0.035 * Math.cos(a), 1.42 + hy * cp, hy * sp + 0.035 * Math.sin(a)); }
    }
    return { points: o, count: n / 3 };
  }

  function trailPoints(id, t, span) {  // where a person was over the last seconds, newest first: [X, Z, age]
    const out = [];
    for (let k = 1; k * 0.25 <= (span || 3.5); k += 1) { const at = along(id, wrap(t) - k * 0.25); if (!at) break; out.push([at.X, at.Z, k * 0.25]); }
    return out;
  }

  // ---------------------------------------------------------------- views
  // A view maps a world point to the logical 960 by 540 picture: [x, y, depth, px per metre]. "camera" is the fixed
  // camera itself (the dashboard's picture); a look view is any other viewpoint (the page's field study).
  const CAMERA = { id: "camera", walls: { right: true }, proj(x, y, z, out) {
    if (z < 0.25) return false;
    out[0] = W / 2 + (F * x) / z; out[1] = Y0 + (F * (CAM_H - y)) / z; out[2] = z; out[3] = F / z; return true;
  } };
  function lookBasis(eye, target) {
    let fx = target[0] - eye[0], fy = target[1] - eye[1], fz = target[2] - eye[2];
    const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
    let rx = fz, rz = -fx; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;      // up x forward: screen right
    const ux = fy * rz, uy = fz * rx - fx * rz, uz = -fy * rx;                      // forward x right: screen up
    return { f: [fx, fy, fz], r: [rx, 0, rz], u: [ux, uy, uz] };
  }
  function makeView(id, eye, target, focal, cx, cy, walls) {
    const b = lookBasis(eye, target);
    return { id, eye, target, focal, cx, cy, walls: walls || { right: false }, proj(x, y, z, out) {
      const dx = x - eye[0], dy = y - eye[1], dz = z - eye[2];
      const pz = dx * b.f[0] + dy * b.f[1] + dz * b.f[2];
      if (pz < 0.25) return false;
      const px = dx * b.r[0] + dz * b.r[2], py = dx * b.u[0] + dy * b.u[1] + dz * b.u[2];
      out[0] = cx + (focal * px) / pz; out[1] = cy - (focal * py) / pz; out[2] = pz; out[3] = focal / pz; return true;
    } };
  }
  const YARD_CORNERS = (() => {
    const { left: L, right: R, back: B, wallH: WH } = YARD;
    return [[L, 0, NEAR], [R, 0, NEAR], [R, 0, B], [L, 0, B], [L, WH, B], [R, WH, B], [L, WH, NEAR], [TREE.x, 3.9, TREE.z]];
  })();
  // A view of the whole yard from the front right and above, fitted into a box of the picture (fractions of W, H).
  function fieldView(o) {
    const opt = Object.assign({ az: 0.62, el: 0.58, dist: 30, target: [0.35, 0.9, 6.1], box: [0.04, 0.08, 0.96, 0.95], id: "field" }, o || {});
    const dir = [Math.sin(opt.az) * Math.cos(opt.el), Math.sin(opt.el), -Math.cos(opt.az) * Math.cos(opt.el)];
    const eye = [opt.target[0] + dir[0] * opt.dist, opt.target[1] + dir[1] * opt.dist, opt.target[2] + dir[2] * opt.dist];
    const unit = makeView("fit", eye, opt.target, 1, 0, 0), p = [0, 0, 0, 0];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const c of YARD_CORNERS) { unit.proj(c[0], c[1], c[2], p); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const bw = (opt.box[2] - opt.box[0]) * W, bh = (opt.box[3] - opt.box[1]) * H;
    const focal = Math.min(bw / (x1 - x0), bh / (y1 - y0));
    const cx = opt.box[0] * W + bw / 2 - focal * (x0 + x1) / 2, cy = opt.box[1] * H + bh / 2 - focal * (y0 + y1) / 2;
    return makeView(opt.id, eye, opt.target, focal, cx, cy, { right: false });
  }

  // ---------------------------------------------------------------- the 2D renderer
  const INK = { bg: "#080d0d", dot: "#a3bcaf", wall: "#93ab9f", line: "#a9c4b6", person: "#d9f6e7", sage: "#b4eed0", ivory: "#eef2ec", muted: "#8d9b95" };
  const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  const P = [0, 0, 0, 0], Q = [0, 0, 0, 0];

  function dotsOf(ctx, arr, view, size, alpha, spacing, count) {
    const n = count != null ? count * 3 : arr.length, r = size / 2;
    for (let i = 0; i < n; i += 3) {
      if (!view.proj(arr[i], arr[i + 1], arr[i + 2], P)) continue;
      if (P[0] < -4 || P[0] > W + 4 || P[1] < -4 || P[1] > H + 4) continue;
      ctx.globalAlpha = spacing ? alpha * Math.min(1, Math.max(0.28, (spacing * P[3]) / 6)) : alpha;
      ctx.fillRect(P[0] - r, P[1] - r, size, size);
    }
    ctx.globalAlpha = 1;
  }
  function linesOf(ctx, arr, view) {
    ctx.beginPath();
    for (let i = 0; i < arr.length; i += 6) {
      if (!view.proj(arr[i], arr[i + 1], arr[i + 2], P) || !view.proj(arr[i + 3], arr[i + 4], arr[i + 5], Q)) continue;
      ctx.moveTo(P[0], P[1]); ctx.lineTo(Q[0], Q[1]);
    }
    ctx.stroke();
  }
  function floorPath(ctx, view, pts) {  // a closed outline on the paving
    ctx.beginPath();
    pts.forEach(([x, z], i) => { view.proj(x, 0, z, P); if (i) ctx.lineTo(P[0], P[1]); else ctx.moveTo(P[0], P[1]); });
    ctx.closePath();
  }

  const caches = new Map();
  function paintStill(ctx, view, k) {  // what never moves: the paving, the walls, the joints, the bench, planter and pot
    const dot = Math.max(1.05, 1.25 / k);
    ctx.fillStyle = INK.bg; ctx.fillRect(0, 0, W, H);
    const v = ctx.createRadialGradient(W * 0.5, H * 0.55, 60, W * 0.5, H * 0.55, W * 0.62);
    v.addColorStop(0, "rgba(28,40,37,.55)"); v.addColorStop(1, "rgba(8,13,13,0)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = Math.max(0.7, 1 / k);
    ctx.strokeStyle = "rgba(169,196,182,.075)"; linesOf(ctx, MODEL.grid, view);
    ctx.fillStyle = INK.dot; dotsOf(ctx, MODEL.floor, view, dot, 0.4, SPACING);
    ctx.fillStyle = INK.wall; dotsOf(ctx, MODEL.back, view, dot, 0.34, SPACING); dotsOf(ctx, MODEL.left, view, dot, 0.34, SPACING);
    if (view.walls.right) dotsOf(ctx, MODEL.right, view, dot, 0.3, SPACING);
    ctx.strokeStyle = "rgba(169,196,182,.34)"; linesOf(ctx, MODEL.edges, view);
    if (view.walls.right) linesOf(ctx, MODEL.rightEdges, view);
    ctx.strokeStyle = "rgba(169,196,182,.42)"; linesOf(ctx, MODEL.propLines, view);
    ctx.fillStyle = INK.dot; dotsOf(ctx, MODEL.props, view, dot, 0.45, 0);
  }
  function still(ctx, view) {
    const m = ctx.getTransform(), k = Math.max(0.25, Math.hypot(m.a, m.b));
    if (typeof document === "undefined") { paintStill(ctx, view, k); return; }
    const key = view.id + "@" + k.toFixed(3) + "/" + (view.focal || 0).toFixed(2);
    let c = caches.get(key);
    if (!c) {
      c = document.createElement("canvas"); c.width = Math.round(W * k); c.height = Math.round(H * k);
      const g = c.getContext("2d"); g.scale(c.width / W, c.height / H); paintStill(g, view, k);
      if (caches.size > 6) caches.delete(caches.keys().next().value);
      caches.set(key, c);
    }
    ctx.drawImage(c, 0, 0, W, H);
  }

  function zoneOf(ctx, view, strength, k) {
    const z = ZONE_RECT, s = strength || 0;
    floorPath(ctx, view, [[z.x1, z.z1], [z.x2, z.z1], [z.x2, z.z2], [z.x1, z.z2]]);
    if (s > 0.01) { ctx.fillStyle = `rgba(180,238,208,${(0.05 + 0.13 * s).toFixed(3)})`; ctx.fill(); }
    ctx.setLineDash([5, 5]); ctx.lineWidth = Math.max(0.8, 1.1 / k) + s * 0.6;
    ctx.strokeStyle = `rgba(180,238,208,${(0.42 + 0.48 * s).toFixed(3)})`; ctx.stroke(); ctx.setLineDash([]);
    // the label sits at the corner nearest the viewer
    let best = null;
    for (const [x, zz] of [[z.x1, z.z1], [z.x2, z.z1], [z.x1, z.z2], [z.x2, z.z2]]) if (view.proj(x, 0, zz, P) && (!best || P[1] > best[1])) best = [P[0], P[1]];
    if (best) {
      ctx.font = `500 11px ${MONO}`; ctx.fillStyle = `rgba(180,238,208,${(0.6 + 0.4 * s).toFixed(3)})`;
      ctx.fillText("ZONE A", Math.min(W - 60, best[0] + 8), Math.min(H - 8, best[1] - 8));
    }
  }

  function personOf(ctx, view, actor, buf, k, o) {
    const { points, count } = bodyPoints(actor, buf);
    view.proj(actor.world.X, 0, actor.world.Z, P);
    const fx = P[0], fy = P[1], ppm = P[3];
    if (o.glow !== false) {  // a soft light around the person
      const g = ctx.createRadialGradient(fx, fy - 0.5 * ppm, 4, fx, fy - 0.5 * ppm, 1.5 * ppm);
      g.addColorStop(0, `rgba(180,238,208,${(0.12 * actor.appear).toFixed(3)})`); g.addColorStop(1, "rgba(180,238,208,0)");
      ctx.fillStyle = g; ctx.fillRect(fx - 1.6 * ppm, fy - 2.2 * ppm, 3.2 * ppm, 3.2 * ppm);
    }
    if (o.trail !== false) {  // where they came from
      const tr = trailPoints(actor.id, actor.t);
      if (tr.length > 1) {
        ctx.beginPath(); ctx.moveTo(fx, fy);
        for (const [x, z] of tr) { view.proj(x, 0, z, Q); ctx.lineTo(Q[0], Q[1]); }
        ctx.setLineDash([3, 5]); ctx.strokeStyle = `rgba(180,238,208,${(0.32 * actor.appear).toFixed(3)})`; ctx.lineWidth = Math.max(0.8, 1 / k); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = `rgba(217,246,231,${(0.7 * actor.appear).toFixed(3)})`;
        for (const [x, z, age] of tr) if (Math.abs(age % 1) < 0.01) { view.proj(x, 0, z, Q); ctx.fillRect(Q[0] - 1.5, Q[1] - 1.5, 3, 3); }
      }
    }
    // the ring it stands in
    ctx.beginPath();
    for (let i = 0; i <= 36; i += 1) { const a = (i / 36) * Math.PI * 2; view.proj(actor.world.X + 0.34 * Math.cos(a), 0, actor.world.Z + 0.34 * Math.sin(a), Q); if (i) ctx.lineTo(Q[0], Q[1]); else ctx.moveTo(Q[0], Q[1]); }
    ctx.strokeStyle = `rgba(190,233,211,${(0.55 * actor.appear).toFixed(3)})`; ctx.lineWidth = Math.max(0.9, 1.2 / k); ctx.stroke();
    // the body
    const size = Math.max(1.1, 1.4 / k) * Math.min(1.6, Math.max(1, Math.sqrt(ppm / 90))), r = size / 2;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, hx0 = Infinity, hx1 = -Infinity, hy0 = Infinity, hy1 = -Infinity;
    ctx.fillStyle = INK.person; ctx.globalAlpha = 0.88 * actor.appear * (actor.confirmed ? 1 : 0.7);
    for (let i = 0; i < count * 3; i += 3) {
      if (!view.proj(points[i], points[i + 1], points[i + 2], Q)) continue;
      ctx.fillRect(Q[0] - r, Q[1] - r, size, size);
      if (Q[0] < x0) x0 = Q[0]; if (Q[0] > x1) x1 = Q[0]; if (Q[1] < y0) y0 = Q[1]; if (Q[1] > y1) y1 = Q[1];
      if (points[i + 1] > 1.52) { if (Q[0] < hx0) hx0 = Q[0]; if (Q[0] > hx1) hx1 = Q[0]; if (Q[1] < hy0) hy0 = Q[1]; if (Q[1] > hy1) hy1 = Q[1]; }
    }
    ctx.globalAlpha = 1;
    return { box: [x0, y0, x1, y1], head: [hx0, hy0, hx1, hy1] };
  }

  function bracket(ctx, x0, y0, x1, y1, len, width, color) {
    ctx.beginPath();
    for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { ctx.moveTo(x + sx * len, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * len); }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "square"; ctx.stroke(); ctx.lineCap = "butt";
  }
  const trackId = (n) => String(n).padStart(4, "0");

  function marksOf(ctx, actor, b, k) {  // the track's brackets and its number; a thin box on the face when it is seen
    const pad = 7, x0 = b.box[0] - pad, y0 = b.box[1] - pad, x1 = b.box[2] + pad, y1 = b.box[3] + pad * 0.6;
    const a = actor.appear;
    bracket(ctx, x0, y0, x1, y1, Math.max(7, Math.min(14, (x1 - x0) * 0.32)), Math.max(1.2, 1.6 / k), `rgba(217,239,227,${(0.95 * a).toFixed(3)})`);
    ctx.font = `500 ${Math.round(12 + Math.min(4, (y1 - y0) / 60))}px ${MONO}`;
    ctx.fillStyle = `rgba(238,242,236,${a.toFixed(3)})`;
    ctx.beginPath(); ctx.arc(x1 + 7, y0 + 1, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillText(trackId(actor.track), x1 + 13, y0 + 5.5);
    if (actor.faceVisible && isFinite(b.head[0])) {
      const p = 3;
      ctx.setLineDash([2, 3]); ctx.strokeStyle = `rgba(180,238,208,${(0.75 * a).toFixed(3)})`; ctx.lineWidth = Math.max(0.8, 1 / k);
      ctx.strokeRect(b.head[0] - p, b.head[1] - p, b.head[2] - b.head[0] + 2 * p, b.head[3] - b.head[1] + 2 * p); ctx.setLineDash([]);
    }
  }

  function bannerOf(ctx) {
    ctx.fillStyle = "rgba(8,13,13,.86)"; ctx.fillRect(0, 0, W, 30);
    ctx.fillStyle = "rgba(180,238,208,.9)"; ctx.fillRect(18, 13, 5, 5);
    ctx.font = `500 13px ${MONO}`; ctx.fillStyle = "#e9efe9"; ctx.fillText("SYNTHETIC SAMPLE  /  No camera connection", 32, 20);
    ctx.font = `500 12px ${MONO}`; ctx.fillStyle = "rgba(160,176,169,.85)"; ctx.fillText("Illustrated fixture · not recorded footage", 18, H - 14);
  }

  const bodyBufs = [new Float32Array(BODY_N * 3), new Float32Array(BODY_N * 3)];
  const crownBuf = new Float32Array(MODEL.crown.length), leafBuf = new Float32Array(LEAVES.length * (LEAF_N * 2 + 6) * 3);

  // render(ctx, state, opts): the whole picture into the logical 960 by 540 frame of ctx (scale ctx to your canvas).
  // opts: view (CAMERA, or one from fieldView()), zoneStrength 0..1, annotations (true: the tracks' marks), banner, glow, trail.
  function render(ctx, state, opts) {
    const o = opts || {}, view = o.view || CAMERA;
    const m = ctx.getTransform(), k = Math.max(0.25, Math.hypot(m.a, m.b));
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    still(ctx, view);
    zoneOf(ctx, view, o.zoneStrength, k);
    const size = Math.max(1.05, 1.3 / k);
    const crown = crownPoints(state.t, crownBuf), leaves = leafPoints(state.t, leafBuf);
    const drawCrown = () => { ctx.fillStyle = INK.dot; dotsOf(ctx, crown, view, size, 0.5, 0); };
    const behind = state.actors.filter((a) => a.world.Z > TREE.z), front = state.actors.filter((a) => a.world.Z <= TREE.z);
    const boxes = [];
    const one = (a) => { const t = Object.assign({}, a, { t: state.t }); boxes.push([t, personOf(ctx, view, t, bodyBufs[boxes.length % 2], k, o)]); };
    behind.forEach(one); drawCrown(); front.forEach(one);
    ctx.fillStyle = "#a9c6b7"; dotsOf(ctx, leaves, view, size, 0.62, 0);
    if (o.annotations) for (const [a, b] of boxes) if (a.confirmed && isFinite(b.box[0])) marksOf(ctx, a, b, k);
    if (o.banner) bannerOf(ctx);
    ctx.restore();
    return boxes.map(([a, b]) => ({ id: a.id, track: a.track, box: b.box }));
  }

  // draw(): the dashboard's and the shared contract's entry point: the fixed camera's picture.
  function draw(ctx, state, opts) { return render(ctx, state, Object.assign({ view: CAMERA }, opts || {})); }

  return {
    W, H, LOOP_S, ZONE, ACTORS: { a: { track: 73, enrolled: true, note: ACTORS.a.note }, b: { track: 74, enrolled: false, note: ACTORS.b.note } },
    EVENTS, SCENARIOS, sample, draw, render,
    // beyond the contract: the yard's geometry and its dot model, for the page's views and the film
    GEOM: { F, CAM_H, Y0, YARD, GATE, DOOR, TREE, BENCH, PLANT, NEAR, ZONE_RECT }, project,
    MODEL, crownPoints, leafPoints, bodyPoints, trailPoints, BODY_N, LEAF_COUNT: LEAVES.length * (LEAF_N * 2 + 6),
    CAMERA, fieldView, makeView, lookBasis, trackId, INK,
  };
});
