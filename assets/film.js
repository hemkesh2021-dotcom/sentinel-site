/* Sentinel site: the hardware film, drawn as a field study in dots and lines. One WebGL canvas (three.js r128), three passes:
     A  the studio: the two hardware studies as point clouds on a dotted floor;
     B  the courtyard: the shared yard model (courtyard.js), the same dots the dashboard's picture is drawn from;
     C  screen passes that carry the frame between them (an iris through the lens).
   What is shown is a pure function of progress p in [0,1] (plus a small idle drift that `calm` turns off), so the
   scroll position, the chapter buttons and the recorder all drive the same thing. Copy lives in the page: this file
   only moves the elements it finds under `overlay` by their data-k names. Every colour here is a final sRGB value. */
(function (root) {
  "use strict";

  const BEATS = [
    { id: "pair", at: 0.0, hold: 0.045 }, { id: "lens", at: 0.1, hold: 0.2 }, { id: "frame", at: 0.33, hold: 0.365 },
    { id: "depth", at: 0.4, hold: 0.545 }, { id: "track", at: 0.58, hold: 0.695 }, { id: "travel", at: 0.76, hold: 0.875 },
    { id: "record", at: 0.9, hold: 0.985 },
  ];
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const seg = (p, a, b) => clamp01((p - a) / (b - a));
  const smooth = (k) => k * k * (3 - 2 * k);
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---------------------------------------------------------------- shaders
  const CLIP = `
    if (uRevealOn > 0.0) {
      vec4 c = uClip * w; vec2 q = c.xy / c.w;
      float inside = step(0.0, c.w) * step(abs(q.x), 1.0) * step(abs(q.y), 1.0);
      a *= mix(uReveal, 1.0, inside);
    }`;
  const COMMON_U = "uniform float uNear0, uNear1, uRevealOn, uReveal; uniform mat4 uClip;";
  const POINT_VERT = `attribute float aAlpha; attribute float aSeed; ${COMMON_U}
    uniform float uSize, uDpr, uFocal, uSpacing, uLit, uGrow, uTime, uDust;
    varying float vA;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      float dust = 0.0;
      if (uDust > 0.0 && aSeed > 1.0 - uDust) {
        dust = fract(uTime * (0.045 + 0.06 * fract(aSeed * 13.7)) + aSeed * 7.31);
        w.xyz += vec3(sin(dust * 6.2832 + aSeed * 40.0) * 0.04, dust * 0.55, cos(dust * 5.0 + aSeed * 21.0) * 0.04);
      }
      vec4 mv = viewMatrix * w; gl_Position = projectionMatrix * mv;
      float d = max(-mv.z, 1e-3), a = aAlpha;
      if (dust > 0.0) a *= (1.0 - dust) * smoothstep(0.0, 0.08, dust) * 1.5;
      if (uSpacing > 0.0) a *= clamp(uSpacing * uFocal / d / (6.0 * uDpr), 0.28, 1.0);
      if (uLit > 0.0) {
        vec3 n = normalize(normalMatrix * normal); vec3 v = normalize(-mv.xyz);
        float facing = dot(n, v), lam = max(dot(n, normalize(vec3(-0.45, 0.62, 0.64))), 0.0);
        a *= mix(1.0, (0.12 + 0.88 * smoothstep(-0.06, 0.34, facing)) * (0.56 + 0.44 * lam), uLit);
      }
      if (uNear1 > 0.0) a *= smoothstep(uNear0, uNear1, d);
      ${CLIP}
      vA = a; gl_PointSize = uSize * uDpr * (uGrow > 0.0 ? clamp(sqrt(uFocal / d / (90.0 * uDpr)), 1.0, 1.8) : 1.0);
    }`;
  const POINT_FRAG = `uniform vec3 uColor, uIris; uniform float uOpacity, uWorld; varying float vA;
    void main() {
      if (distance(gl_FragCoord.xy, uIris.xy) > uIris.z) discard;
      vec2 q = gl_PointCoord - 0.5; float r = dot(q, q); if (r > 0.25) discard;
      float a = vA * uOpacity * uWorld * (1.0 - smoothstep(0.17, 0.25, r)); if (a < 0.003) discard;
      gl_FragColor = vec4(uColor, a);
    }`;
  const LINE_VERT = `attribute float aAlpha; attribute float aDist; ${COMMON_U} varying float vA; varying float vDist;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0); vec4 mv = viewMatrix * w; gl_Position = projectionMatrix * mv;
      float d = max(-mv.z, 1e-3), a = aAlpha;
      if (uNear1 > 0.0) a *= smoothstep(uNear0, uNear1, d);
      ${CLIP}
      vA = a; vDist = aDist;
    }`;
  const LINE_FRAG = `uniform vec3 uColor, uIris; uniform float uOpacity, uWorld, uDash, uGap; varying float vA; varying float vDist;
    void main() {
      if (distance(gl_FragCoord.xy, uIris.xy) > uIris.z) discard;
      if (uDash > 0.0 && mod(vDist, uDash + uGap) > uDash) discard;
      gl_FragColor = vec4(uColor, vA * uOpacity * uWorld);
    }`;
  const FILL_VERT = `attribute float aAlpha; ${COMMON_U} varying float vA; varying vec2 vUv;
    void main() { vec4 w = modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * viewMatrix * w; float a = aAlpha; ${CLIP} vA = a; vUv = uv; }`;
  const FILL_FRAG = `uniform vec3 uColor, uIris; uniform float uOpacity, uWorld, uRadial; varying float vA; varying vec2 vUv;
    void main() {
      if (distance(gl_FragCoord.xy, uIris.xy) > uIris.z) discard;
      float a = vA * uOpacity * uWorld;
      if (uRadial > 0.0) { float r = length(vUv * 2.0 - 1.0); a *= pow(max(0.0, 1.0 - r), 1.8); }
      gl_FragColor = vec4(uColor, a);
    }`;

  function create(opts) {
    const THREE = opts.THREE, yard = opts.courtyard, canvas = opts.canvas, overlay = opts.overlay || null;
    const G = yard.GEOM, FW = yard.W, FH = yard.H, MODEL = yard.MODEL;
    const low = opts.quality === "low";
    const clock = opts.clock || (() => performance.now() / 1000);
    let calm = !!opts.calm;
    const SAGE = 0xb4eed0, CYAN = 0x86cfdc, BG = new THREE.Color(0x080d0d);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.autoClear = false;
    let cw = 2, ch = 2, dpr = 1, aspect = 1;
    const dprCap = low ? 1.75 : 2;
    const rect = { x: 0, y: 0, w: 1, h: 1 }, shift = { x: 0, y: 0 };

    // ---- materials: every world has a shared set of uniforms; each material keeps its colour, size and opacity
    const uniformsFor = () => ({ uTime: { value: 0 }, uDust: { value: 0 }, uWorld: { value: 1 }, uDpr: { value: 1 }, uFocal: { value: 1000 }, uNear0: { value: 0 }, uNear1: { value: 0 },
      uReveal: { value: 1 }, uClip: { value: new THREE.Matrix4() }, uIris: { value: new THREE.Vector3(0, 0, 1e9) } });
    const UA = uniformsFor(), UB = uniformsFor();
    const share = (U, own) => Object.assign({ uWorld: U.uWorld, uNear0: U.uNear0, uNear1: U.uNear1, uReveal: U.uReveal, uClip: U.uClip, uIris: U.uIris }, own);
    function pointsMat(U, o) {
      return new THREE.ShaderMaterial({
        uniforms: share(U, { uColor: { value: new THREE.Color(o.color) }, uOpacity: { value: o.opacity == null ? 1 : o.opacity }, uSize: { value: o.size || 1.3 },
          uDpr: U.uDpr, uFocal: U.uFocal, uSpacing: { value: o.spacing || 0 }, uLit: { value: o.lit || 0 }, uGrow: { value: o.grow ? 1 : 0 }, uTime: U.uTime, uDust: U.uDust, uRevealOn: { value: o.reveal ? 1 : 0 } }),
        vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, transparent: true, depthWrite: false, depthTest: false,
      });
    }
    function lineMat(U, o) {
      return new THREE.ShaderMaterial({
        uniforms: share(U, { uColor: { value: new THREE.Color(o.color) }, uOpacity: { value: o.opacity == null ? 1 : o.opacity },
          uDash: { value: o.dash || 0 }, uGap: { value: o.gap || 0 }, uRevealOn: { value: o.reveal ? 1 : 0 } }),
        vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, transparent: true, depthWrite: false, depthTest: false,
      });
    }
    function fillMat(U, o) {
      return new THREE.ShaderMaterial({
        uniforms: share(U, { uColor: { value: new THREE.Color(o.color) }, uOpacity: { value: o.opacity == null ? 1 : o.opacity },
          uRadial: { value: o.radial ? 1 : 0 }, uRevealOn: { value: o.reveal ? 1 : 0 } }),
        vertexShader: FILL_VERT, fragmentShader: FILL_FRAG, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      });
    }
    const alphaAttr = (n, a) => { const arr = new Float32Array(n); if (typeof a === "number") arr.fill(a); else arr.set(a); return new THREE.BufferAttribute(arr, 1); };
    function pointsGeo(pos, alpha, normals, seeds) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("aAlpha", alphaAttr(pos.length / 3, alpha == null ? 1 : alpha));
      if (normals) g.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
      if (seeds) g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
      return g;
    }
    function linesGeo(pos, alpha, dashed) {
      const g = new THREE.BufferGeometry(), n = pos.length / 3;
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("aAlpha", alphaAttr(n, alpha == null ? 1 : alpha));
      const dist = new Float32Array(n);
      if (dashed) for (let i = 0; i < n; i += 2) { const j = i * 3; dist[i + 1] = Math.hypot(pos[j + 3] - pos[j], pos[j + 4] - pos[j + 1], pos[j + 5] - pos[j + 2]); }
      g.setAttribute("aDist", new THREE.BufferAttribute(dist, 1));
      return g;
    }
    const flipZ = (a) => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i += 3) { o[i] = a[i]; o[i + 1] = a[i + 1]; o[i + 2] = -a[i + 2]; } return o; };
    const noCull = (o) => { o.frustumCulled = false; return o; };

    // ======================================================================= A: the studio
    const A = new THREE.Scene();
    {
      const step = low ? 0.1 : 0.075, pos = [], al = [];
      for (let x = -4.8; x <= 4.8; x += step) for (let z = -3.8; z <= 3.8; z += step) {
        const r = Math.hypot(x * 0.92, z - 0.15), a = 0.46 * (1 - smooth(clamp01((r - 1.2) / 3.4)));
        if (a > 0.01) { pos.push(x, 0, z); al.push(a); }
      }
      A.add(noCull(new THREE.Points(pointsGeo(new Float32Array(pos), new Float32Array(al)), pointsMat(UA, { color: 0x9db7a9, size: 1.2 }))));
      const lp = [], la = [], s = 0.12;
      const fade = (x, z) => 0.1 * (1 - smooth(clamp01((Math.hypot(x * 0.92, z - 0.15) - 1.0) / 3.4)));
      for (let g = -4.8; g <= 4.81; g += 0.6) {
        for (let u = -3.8; u < 3.8; u += s) { lp.push(g, 0, u, g, 0, u + s); la.push(fade(g, u), fade(g, u + s)); }
        if (Math.abs(g) <= 3.8) for (let u = -4.8; u < 4.8; u += s) { lp.push(u, 0, g, u + s, 0, g); la.push(fade(u, g), fade(u + s, g)); }
      }
      A.add(noCull(new THREE.LineSegments(linesGeo(new Float32Array(lp), new Float32Array(la)), lineMat(UA, { color: 0xa9c4b6 }))));
    }
    const kit = opts.hardware.build(THREE);
    const camObj = kit.camera, board = kit.board, head = camObj.userData.head, fan = board.userData.fan;
    camObj.position.set(-0.92, 0, 0); camObj.rotation.y = 0.35;
    board.position.set(0.95, 0, 0.2); board.rotation.y = -0.55;
    A.add(camObj, board);
    const stats = pointify(THREE, kit, { low, pointsMat: (o) => pointsMat(UA, o), lineMat: (o) => lineMat(UA, o), pointsGeo, linesGeo });
    { // footprints: a ring under the camera, a dashed outline under the board
      const ringPos = [];
      for (let i = 0; i < 64; i += 1) { const a = (i / 64) * Math.PI * 2, b = ((i + 1) / 64) * Math.PI * 2; ringPos.push(0.56 * Math.cos(a), 0.003, 0.56 * Math.sin(a), 0.56 * Math.cos(b), 0.003, 0.56 * Math.sin(b)); }
      const r = noCull(new THREE.LineSegments(linesGeo(new Float32Array(ringPos), 0.5), lineMat(UA, { color: 0xbfe3d1 })));
      r.position.copy(camObj.position); A.add(r);
      const hw = 0.6, hd = 0.5, c = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]], rp = [];
      for (let i = 0; i < 4; i += 1) { const [x1, z1] = c[i], [x2, z2] = c[(i + 1) % 4]; rp.push(x1, 0.003, z1, x2, 0.003, z2); }
      const b = noCull(new THREE.LineSegments(linesGeo(new Float32Array(rp), 0.45, true), lineMat(UA, { color: 0xbfe3d1, dash: 0.05, gap: 0.04 })));
      b.position.copy(board.position); b.rotation.y = board.rotation.y; A.add(b);
    }
    // the assembly comes apart: the head lifts off its base, the heatsink and the board lift off the tray; dashed guides join them
    const guideGeo = linesGeo(new Float32Array(5 * 6), 1, true);
    guideGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const guides = noCull(new THREE.LineSegments(guideGeo, lineMat(UA, { color: 0xbfe3d1, opacity: 0, dash: 0.035, gap: 0.03 })));
    A.add(guides);
    const CU = camObj.userData, BU = board.userData, gp = new THREE.Vector3();
    function setGuides(e, lift) {
      const Pa = guideGeo.attributes.position.array, Dd = guideGeo.attributes.aDist.array;
      const put = (i, a, b) => { Pa.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6); Dd[i * 2] = 0; Dd[i * 2 + 1] = a.distanceTo(b); };
      put(0, gp.set(0, CU.baseH, 0).applyMatrix4(camObj.matrixWorld).clone(), gp.set(0, CU.headY + lift.head - 0.42, 0).applyMatrix4(camObj.matrixWorld).clone());
      [[-0.5, -0.4], [0.5, -0.4], [0.5, 0.4], [-0.5, 0.4]].forEach(([x, z], i) => put(i + 1, gp.set(x, 0.03, z).applyMatrix4(board.matrixWorld).clone(), gp.set(x, BU.top + lift.sink, z).applyMatrix4(board.matrixWorld).clone()));
      guideGeo.attributes.position.needsUpdate = true; guideGeo.attributes.aDist.needsUpdate = true;
      guides.material.uniforms.uOpacity.value = 0.55 * e;
    }
    const HEAD_REST = { x: 0.0, y: -0.12 }, HEAD_LOOK = { x: -0.2, y: 0.0 };
    const L0 = new THREE.Vector3(), LD = new THREE.Vector3();
    head.rotation.set(HEAD_LOOK.x, HEAD_LOOK.y, 0);
    camObj.updateMatrixWorld(true);
    camObj.userData.sensor.getWorldPosition(L0);
    camObj.userData.lens.getWorldDirection(LD);
    const SENSOR_R = 0.044;
    const camA = new THREE.PerspectiveCamera(30, 1, 0.01, 80);
    const P = {};

    // the card: the frame as the dashboard got it, drawn by the same 2D renderer, carried to the board
    const CARD_H = 0.62, CARD_W = (CARD_H * FW) / FH, CARD_DOCK = 0.62;
    const cardCan = document.createElement("canvas"); cardCan.width = FW * 2; cardCan.height = FH * 2;
    const cardTex = new THREE.CanvasTexture(cardCan); cardTex.minFilter = THREE.LinearFilter; cardTex.generateMipmaps = false;
    let cardDrawn = false;
    const card = new THREE.Group();
    const cardRim = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W + 0.008, CARD_H + 0.008), new THREE.MeshBasicMaterial({ color: 0x9cc4b1, transparent: true, depthTest: false, depthWrite: false }));
    const cardPic = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), new THREE.MeshBasicMaterial({ map: cardTex, transparent: true, depthTest: false, depthWrite: false }));
    cardRim.renderOrder = 1; cardPic.renderOrder = 2; cardRim.position.z = -0.001;
    card.add(cardRim, cardPic); card.traverse((o) => o.layers.set(1)); card.visible = false; A.add(card);
    const STREAM_N = low ? 3200 : 6500;
    const streamGeo = new THREE.BufferGeometry();
    streamGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(STREAM_N * 3), 3));
    streamGeo.setAttribute("aUV", new THREE.BufferAttribute(new Float32Array(STREAM_N * 2), 2));
    streamGeo.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(STREAM_N * 3), 3));
    streamGeo.setAttribute("aAlpha", alphaAttr(STREAM_N, 0));
    streamGeo.setAttribute("aSeed", alphaAttr(STREAM_N, 0));
    const streamMat = new THREE.ShaderMaterial({
      uniforms: { uFrom: { value: new THREE.Matrix4() }, uTo: { value: new THREE.Matrix4() }, uCtrl: { value: new THREE.Vector3() }, uK: { value: 0 },
        uDpr: UA.uDpr, uSize: { value: 1.7 }, uHalf: { value: new THREE.Vector2(CARD_W / 2, CARD_H / 2) } },
      vertexShader: `attribute vec2 aUV; attribute vec3 aColor; attribute float aAlpha; attribute float aSeed;
        uniform mat4 uFrom, uTo; uniform vec3 uCtrl; uniform float uK, uDpr, uSize; uniform vec2 uHalf;
        varying float vA; varying vec3 vC;
        void main() {
          vec4 q = vec4(aUV * uHalf * 2.0, 0.0, 1.0);
          vec3 p0 = (uFrom * q).xyz, p1 = (uTo * q).xyz;
          float delay = (aUV.x + 0.5) * 0.42 + aSeed * 0.12;
          float t = clamp((uK - delay) / 0.44, 0.0, 1.0); t = t * t * (3.0 - 2.0 * t);
          vec3 c = uCtrl + vec3(sin(aSeed * 91.0), cos(aSeed * 57.0) * 0.6, sin(aSeed * 33.0)) * 0.22;
          vec3 p = mix(mix(p0, c, t), mix(c, p1, t), t);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          vA = aAlpha * smoothstep(0.0, 0.04, uK) * (1.0 - smoothstep(0.95, 1.0, uK)) * (0.75 + 0.5 * sin(3.14159 * t));
          vC = aColor;
          gl_PointSize = uSize * uDpr * (1.0 + 0.7 * sin(3.14159 * t));
        }`,
      fragmentShader: `varying float vA; varying vec3 vC;
        void main() { vec2 q = gl_PointCoord - 0.5; float r = dot(q, q); if (r > 0.25) discard; gl_FragColor = vec4(vC, vA * (1.0 - smoothstep(0.15, 0.25, r))); }`,
      transparent: true, depthTest: false, depthWrite: false,
    });
    const stream = noCull(new THREE.Points(streamGeo, streamMat)); stream.layers.set(1); stream.visible = false; A.add(stream);
    function fillStream() {  // dots wherever the frame is lit, in its own colours
      const g = cardCan.getContext("2d"), W2 = cardCan.width, H2 = cardCan.height, px = g.getImageData(0, 0, W2, H2).data;
      const cand = [];
      for (let y = 0; y < H2; y += 2) for (let x = 0; x < W2; x += 2) { const o = (y * W2 + x) * 4, l = (0.3 * px[o] + 0.59 * px[o + 1] + 0.11 * px[o + 2]) / 255; if (l > 0.16) cand.push(o, l); }
      const r = rng(11), uv = streamGeo.attributes.aUV.array, col = streamGeo.attributes.aColor.array, al = streamGeo.attributes.aAlpha.array, sd = streamGeo.attributes.aSeed.array;
      for (let i = 0; i < STREAM_N && cand.length; i += 1) {
        let o = 0, l = 0;
        for (let tries = 0; tries < 6; tries += 1) { const j = Math.floor(r() * (cand.length / 2)) * 2; o = cand[j]; l = cand[j + 1]; if (r() < l * 1.6) break; }
        const pi = o / 4, x = pi % W2, y = Math.floor(pi / W2);
        uv[i * 2] = x / W2 - 0.5; uv[i * 2 + 1] = 0.5 - y / H2;
        col[i * 3] = px[o] / 255; col[i * 3 + 1] = px[o + 1] / 255; col[i * 3 + 2] = px[o + 2] / 255;
        al[i] = Math.min(1, 0.35 + l * 1.4); sd[i] = r();
      }
      ["aUV", "aColor", "aAlpha", "aSeed"].forEach((k) => { streamGeo.attributes[k].needsUpdate = true; });
    }
    const dock = new THREE.Vector3(), dockQ = new THREE.Quaternion(), dockNow = new THREE.Vector3(), mFrom = new THREE.Matrix4(), mTo = new THREE.Matrix4(), unit = new THREE.Vector3(1, 1, 1);
    const ARC_N = 72, arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(ARC_N * 3), 3));
    const arc = noCull(new THREE.Line(arcGeo, new THREE.LineDashedMaterial({ color: CYAN, dashSize: 0.05, gapSize: 0.045, transparent: true, opacity: 0, depthWrite: false, depthTest: false })));
    A.add(arc);
    const arcCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());

    // ======================================================================= B: the courtyard
    const B = new THREE.Scene();
    const addB = (o) => { noCull(o); B.add(o); return o; };
    const SP = MODEL.spacing;
    addB(new THREE.LineSegments(linesGeo(flipZ(MODEL.grid), 0.075), lineMat(UB, { color: 0xa9c4b6, reveal: true })));
    addB(new THREE.Points(pointsGeo(flipZ(MODEL.floor), 0.4), pointsMat(UB, { color: 0xa3bcaf, size: 1.1, spacing: SP, reveal: true })));
    const wallMat = pointsMat(UB, { color: 0x93ab9f, size: 1.1, spacing: SP, reveal: true });
    addB(new THREE.Points(pointsGeo(flipZ(MODEL.back), 0.34), wallMat));
    addB(new THREE.Points(pointsGeo(flipZ(MODEL.left), 0.34), wallMat));
    const rightMat = pointsMat(UB, { color: 0x93ab9f, size: 1.1, spacing: SP, reveal: true });
    addB(new THREE.Points(pointsGeo(flipZ(MODEL.right), 0.3), rightMat));
    addB(new THREE.LineSegments(linesGeo(flipZ(MODEL.edges), 0.34), lineMat(UB, { color: 0xa9c4b6, reveal: true })));
    const rightEdgeMat = lineMat(UB, { color: 0xa9c4b6, reveal: true });
    addB(new THREE.LineSegments(linesGeo(flipZ(MODEL.rightEdges), 0.34), rightEdgeMat));
    addB(new THREE.LineSegments(linesGeo(flipZ(MODEL.propLines), 0.42), lineMat(UB, { color: 0xa9c4b6, reveal: true })));
    addB(new THREE.Points(pointsGeo(flipZ(MODEL.props), 0.45), pointsMat(UB, { color: 0xa3bcaf, size: 1.15, reveal: true })));
    const dyn = (count, alpha, mat) => { const g = pointsGeo(new Float32Array(count * 3), alpha); g.attributes.position.setUsage(THREE.DynamicDrawUsage); return addB(new THREE.Points(g, mat)); };
    const crown = dyn(MODEL.crown.length / 3, 0.5, pointsMat(UB, { color: 0xa3bcaf, size: 1.2, reveal: true, grow: true }));
    const leaves = dyn(yard.LEAF_COUNT, 0.62, pointsMat(UB, { color: 0xa9c6b7, size: 1.2, reveal: true, grow: true }));
    // Zone A: a fill and a dashed edge on the paving
    const Z = G.ZONE_RECT;
    const zoneGeo = new THREE.PlaneGeometry(Z.x2 - Z.x1, Z.z2 - Z.z1); zoneGeo.rotateX(-Math.PI / 2);
    zoneGeo.setAttribute("aAlpha", alphaAttr(zoneGeo.attributes.position.count, 1));
    const zoneFill = addB(new THREE.Mesh(zoneGeo, fillMat(UB, { color: SAGE, opacity: 0, reveal: true })));
    zoneFill.position.set((Z.x1 + Z.x2) / 2, 0.004, -(Z.z1 + Z.z2) / 2);
    const zc = [[Z.x1, Z.z1], [Z.x2, Z.z1], [Z.x2, Z.z2], [Z.x1, Z.z2]], zp = [];
    for (let i = 0; i < 4; i += 1) { const [x1, z1] = zc[i], [x2, z2] = zc[(i + 1) % 4]; zp.push(x1, 0.006, -z1, x2, 0.006, -z2); }
    const zoneEdge = addB(new THREE.LineSegments(linesGeo(new Float32Array(zp), 1, true), lineMat(UB, { color: SAGE, opacity: 0.42, dash: 0.09, gap: 0.09, reveal: true })));
    // the person: dots posed by the script, a ring at their feet, a soft light, the trail behind
    const person = dyn(yard.BODY_N, 0.88, pointsMat(UB, { color: 0xd9f6e7, size: 1.4, reveal: true, grow: true }));
    const bodyBuf = new Float32Array(yard.BODY_N * 3);
    const rp = [];
    for (let i = 0; i < 48; i += 1) { const a = (i / 48) * Math.PI * 2, b = ((i + 1) / 48) * Math.PI * 2; rp.push(0.34 * Math.cos(a), 0, 0.34 * Math.sin(a), 0.34 * Math.cos(b), 0, 0.34 * Math.sin(b)); }
    const ringB = addB(new THREE.LineSegments(linesGeo(new Float32Array(rp), 1), lineMat(UB, { color: 0xbee9d3, opacity: 0.55, reveal: true })));
    const glowGeo = new THREE.PlaneGeometry(3.4, 3.4); glowGeo.rotateX(-Math.PI / 2); glowGeo.setAttribute("aAlpha", alphaAttr(glowGeo.attributes.position.count, 1));
    const glow = addB(new THREE.Mesh(glowGeo, fillMat(UB, { color: SAGE, opacity: 0.13, radial: true, reveal: true })));
    const TRAIL_N = 16, trailGeo = linesGeo(new Float32Array(TRAIL_N * 6), 1, true);
    trailGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const trail = addB(new THREE.LineSegments(trailGeo, lineMat(UB, { color: SAGE, opacity: 0.32, dash: 0.07, gap: 0.12, reveal: true })));
    // the camera's own view: its cone and where it stands
    const far = G.YARD.back * 2, corner = (x, y, d) => [((x - FW / 2) * d) / G.F, G.CAM_H - ((y - G.Y0) * d) / G.F, -d];
    const cone = [];
    for (const [x, y] of [[0, 0], [FW, 0], [FW, FH], [0, FH]]) {
      const c = corner(x, y, y ? G.CAM_H * G.F / (FH - G.Y0) : far), d = [c[0], c[1] - G.CAM_H, -c[2]];   // in yard coordinates, z away
      let tt = 1;
      if (d[0] < 0) tt = Math.min(tt, G.YARD.left / d[0]); if (d[0] > 0) tt = Math.min(tt, G.YARD.right / d[0]);
      if (d[2] > 0) tt = Math.min(tt, G.YARD.back / d[2]); if (d[1] < 0) tt = Math.min(tt, -G.CAM_H / d[1]);
      cone.push(0, G.CAM_H, 0, d[0] * tt, G.CAM_H + d[1] * tt, -d[2] * tt);
    }
    const frustum = addB(new THREE.LineSegments(linesGeo(new Float32Array(cone), 1), lineMat(UB, { color: SAGE, opacity: 0 })));
    const apex = addB(new THREE.Points(pointsGeo(new Float32Array([0, G.CAM_H, 0]), 1), pointsMat(UB, { color: SAGE, size: 6, opacity: 0 })));
    const camB = new THREE.PerspectiveCamera(60, 1, 0.3, 300), camRT = new THREE.PerspectiveCamera(60, 1, 0.3, 300);
    function pinhole(cam, f, px, py, w, h) {  // a pinhole with its principal point anywhere: (px, py) from the top left of a w by h picture
      const n = cam.near;
      cam.projectionMatrix.makePerspective((-px * n) / f, ((w - px) * n) / f, (py * n) / f, (-(h - py) * n) / f, n, cam.far);
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    }
    camRT.position.set(0, G.CAM_H, 0); camRT.lookAt(0, G.CAM_H, -10); camRT.updateMatrixWorld(true);
    pinhole(camRT, G.F, FW / 2, G.Y0, FW, FH);
    UB.uClip.value.multiplyMatrices(camRT.projectionMatrix, camRT.matrixWorldInverse);

    // ======================================================================= C: the screen passes
    const camC = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const screenMat = (mode) => new THREE.ShaderMaterial({
      uniforms: { uIris: UB.uIris, alpha: { value: 1 } },
      vertexShader: "void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: mode === "fill"
        ? "uniform vec3 uIris; uniform float alpha; void main(){ if (distance(gl_FragCoord.xy, uIris.xy) > uIris.z) discard; gl_FragColor = vec4(0.0314, 0.051, 0.051, alpha); }"
        : `uniform vec3 uIris; uniform float alpha; void main(){ float d = distance(gl_FragCoord.xy, uIris.xy); if (d > uIris.z) discard;
             float k = smoothstep(uIris.z * 0.6, uIris.z, d); float lip = smoothstep(uIris.z - 3.0, uIris.z - 1.0, d);
             gl_FragColor = vec4(0.012, 0.016, 0.018, max(k * k * 0.82 * alpha, lip * 0.6 * alpha)); }`,
      transparent: true, depthTest: false, depthWrite: false,
    });
    const C1 = new THREE.Scene(), C2 = new THREE.Scene();
    const fill = noCull(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), screenMat("fill"))), shade = noCull(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), screenMat("shade")));
    C1.add(fill); C2.add(shade);

    // ======================================================================= layout
    const tanH = (fov) => Math.tan((fov * Math.PI) / 360);
    const fit = (sx, sy, fov) => Math.max(sy / (2 * tanH(fov)), sx / (2 * tanH(fov) * aspect));
    const orbit = (tx, ty, tz, az, el, d, fov) => ({ pos: new THREE.Vector3(tx + d * Math.sin(az) * Math.cos(el), ty + d * Math.sin(el), tz + d * Math.cos(az) * Math.cos(el)), tgt: new THREE.Vector3(tx, ty, tz), fov });
    // B's poses, in the yard's own coordinates (x right, z away from the camera): the field study, and closer in
    const YC = [[G.YARD.left, 0, G.NEAR], [G.YARD.right, 0, G.NEAR], [G.YARD.right, 0, G.YARD.back], [G.YARD.left, 0, G.YARD.back],
      [G.YARD.left, G.YARD.wallH, G.YARD.back], [G.YARD.right, G.YARD.wallH, G.YARD.back], [G.YARD.left, G.YARD.wallH, G.NEAR]];
    const NEARC = [[Z.x1, 0, Z.z1], [Z.x2, 0, Z.z1], [Z.x2, 0, Z.z2], [Z.x1, 0, Z.z2], [G.YARD.left, 2.4, G.DOOR.z1], [-0.4, 2.1, 6.4], [-2.4, 2.1, 6.0]];
    function fitLook(az, el, dist, target, pts, box) {
      const dir = [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
      const eye = [target[0] + dir[0] * dist, target[1] + dir[1] * dist, target[2] + dir[2] * dist];
      const v = yard.makeView("fit", eye, target, 1, 0, 0), q = [0, 0, 0, 0];
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const c of pts) { v.proj(c[0], c[1], c[2], q); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
      const bw = box[2] - box[0], bh = box[3] - box[1], f = Math.min(bw / (x1 - x0), bh / (y1 - y0));
      return { eye, target, f, cx: box[0] + bw / 2 - f * (x0 + x1) / 2, cy: box[1] + bh / 2 - f * (y0 + y1) / 2 };
    }
    const PB = {};
    function resize() {
      const w = Math.max(2, canvas.clientWidth), h = Math.max(2, canvas.clientHeight);
      const want = Math.min(opts.pixelRatio || root.devicePixelRatio || 1, dprCap);
      if (w === cw && h === ch && want === dpr) return;
      cw = w; ch = h; dpr = want; aspect = cw / ch;
      renderer.setPixelRatio(dpr); renderer.setSize(cw, ch, false);
      UA.uDpr.value = UB.uDpr.value = dpr;
      const tall = aspect < 1.05;
      shift.x = tall ? 0 : cw * 0.11; shift.y = tall ? 0 : -ch * 0.055;
      if (tall) { rect.w = cw - 24; rect.h = (rect.w * FH) / FW; rect.x = 12; rect.y = Math.round((ch - rect.h) / 2); }
      else { rect.h = Math.min(ch * 0.6, ((cw * 0.76) * FH) / FW); rect.w = (rect.h * FW) / FH; rect.x = (cw - rect.w) / 2 + shift.x * 0.85; rect.y = (ch - rect.h) / 2 + shift.y - ch * 0.02; }
      const b = board.position;
      if (!tall) {
        P.pair = orbit(0.03, 0.5, 0.05, 0.1, 0.17, fit(4.3, 1.75, 30), 30);
        P.hand = orbit(0.0, 0.66, 0.1, 0.3, 0.25, fit(4.4, 2.8, 30), 30);
        P.dock = orbit(b.x + 0.22, 0.5, b.z + 0.05, -0.42, 0.46, fit(2.9, 1.95, 30), 30);
      } else {
        P.pair = orbit(-0.05, 0.62, 0.1, 0.92, 0.36, fit(3.3, 3.6, 36), 36);
        P.hand = orbit(0.1, 0.62, 0.1, 0.95, 0.38, fit(3.1, 3.6, 36), 36);
        P.dock = orbit(b.x + 0.12, 0.42, b.z, -0.2, 0.28, fit(1.5, 1.6, 36), 36);
      }
      dock.set(b.x - 0.1, board.userData.top + 0.015 + (CARD_H * CARD_DOCK) / 2, b.z - 0.06);
      P.far = { pos: L0.clone().addScaledVector(LD, 2.4), tgt: L0.clone(), fov: P.pair.fov };
      dockQ.setFromRotationMatrix(new THREE.Matrix4().lookAt(P.dock.pos, dock, new THREE.Vector3(0, 1, 0)));
      const start = L0.clone().addScaledVector(LD, 0.26), mid = start.clone().lerp(dock, 0.5); mid.y += 0.85;
      arcCurve.v0.copy(start); arcCurve.v1.copy(mid); arcCurve.v2.set(dock.x, board.userData.top + 0.02, dock.z);
      const pts = arcCurve.getPoints(ARC_N - 1), pa = arcGeo.attributes.position;
      pts.forEach((v, i) => pa.setXYZ(i, v.x, v.y, v.z)); pa.needsUpdate = true; arc.computeLineDistances();
      camA.aspect = aspect;
      const boxIso = tall ? [cw * 0.04, ch * 0.13, cw * 0.96, ch * 0.92] : [cw * 0.3, ch * 0.1, cw * 0.97, ch * 0.88];
      const boxNear = tall ? [cw * 0.1, ch * 0.2, cw * 0.9, ch * 0.86] : [cw * 0.4, ch * 0.2, cw * 0.9, ch * 0.82];
      PB.iso = fitLook(0.62, 0.58, 30, [0.35, 0.9, 6.1], YC, boxIso);
      PB.near = fitLook(0.52, 0.52, 19, [-2.0, 0.9, 6.3], NEARC, boxNear);
      place();
    }

    // ======================================================================= the timeline
    const el = {};
    if (overlay) overlay.querySelectorAll("[data-k]").forEach((n) => { el[n.dataset.k] = n; });
    const show = (k, opacity, x, y) => {
      const n = el[k]; if (!n) return;
      const o = opacity < 0.01 ? 0 : opacity;
      n.style.opacity = o.toFixed(3); n.style.visibility = o ? "visible" : "hidden";
      if (x != null && o) { const w = n._w || (n._w = n.offsetWidth || 1); n.style.transform = `translate(${Math.max(8, Math.min(x, cw - w - 8)).toFixed(1)}px, ${(n.classList.contains("fl-pin") ? Math.max(y, 132) : y).toFixed(1)}px)`; }
    };
    function place() {
      for (const k in el) el[k]._w = 0;
      if (el.frame) Object.assign(el.frame.style, { left: rect.x + "px", top: rect.y + "px", width: rect.w + "px", height: rect.h + "px" });
      if (overlay) { overlay.style.setProperty("--frame-bottom", rect.y + rect.h + "px"); overlay.style.setProperty("--frame-top", rect.y + "px"); overlay.dataset.tall = aspect < 1.05 ? "1" : "0"; }
    }
    const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), tgtV = new THREE.Vector3();
    const toScreen = (v, cam) => { v0.copy(v).project(cam); return [(v0.x * 0.5 + 0.5) * cw, (-v0.y * 0.5 + 0.5) * ch]; };
    const TIME = [[0.33, 9.6], [0.4, 10.9], [0.58, 12.4], [0.7, 14.8]];
    function timeAt(p) {
      if (p <= TIME[0][0]) return TIME[0][1];
      for (let i = 1; i < TIME.length; i += 1) if (p <= TIME[i][0]) return lerp(TIME[i - 1][1], TIME[i][1], (p - TIME[i - 1][0]) / (TIME[i][0] - TIME[i - 1][0]));
      return TIME[TIME.length - 1][1];
    }
    let pTarget = 0, pShown = 0, running = false, raf = 0, last = 0, shownT = -1;
    const S = { showA: true, showB: false, card: false, back: 0, shade: 0 };

    function setYard(t, zone, mark) {
      const state = yard.sample(t);
      if (t !== shownT) {
        shownT = t;
        const cp = crown.geometry.attributes.position.array, cr = yard.crownPoints(t);
        for (let i = 0; i < cr.length; i += 3) { cp[i] = cr[i]; cp[i + 1] = cr[i + 1]; cp[i + 2] = -cr[i + 2]; }
        crown.geometry.attributes.position.needsUpdate = true;
        const lp = leaves.geometry.attributes.position.array, lf = yard.leafPoints(t);
        for (let i = 0; i < lf.length; i += 3) { lp[i] = lf[i]; lp[i + 1] = lf[i + 1]; lp[i + 2] = -lf[i + 2]; }
        leaves.geometry.attributes.position.needsUpdate = true;
      }
      const who = state.actors[0] || null;
      person.visible = ringB.visible = glow.visible = trail.visible = !!who;
      if (who) {
        const { points, count } = yard.bodyPoints(who, bodyBuf), pp = person.geometry.attributes.position.array;
        for (let i = 0; i < count * 3; i += 3) { pp[i] = points[i]; pp[i + 1] = points[i + 1]; pp[i + 2] = -points[i + 2]; }
        person.geometry.setDrawRange(0, count); person.geometry.attributes.position.needsUpdate = true;
        person.material.uniforms.uOpacity.value = who.appear;
        ringB.position.set(who.world.X, 0.006, -who.world.Z); ringB.material.uniforms.uOpacity.value = 0.25 + 0.4 * mark;
        glow.position.set(who.world.X, 0.005, -who.world.Z);
        const tr = yard.trailPoints(who.id, t, 3.5), tp = trailGeo.attributes.position.array, td = trailGeo.attributes.aDist.array;
        let px = who.world.X, pz = who.world.Z, d = 0, n = 0;
        for (const [x, z] of tr.slice(0, TRAIL_N)) { const j = n * 6; tp[j] = px; tp[j + 1] = 0.008; tp[j + 2] = -pz; tp[j + 3] = x; tp[j + 4] = 0.008; tp[j + 5] = -z; td[n * 2] = d; d += Math.hypot(x - px, z - pz); td[n * 2 + 1] = d; px = x; pz = z; n += 1; }
        trailGeo.setDrawRange(0, n * 2); trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.aDist.needsUpdate = true;
      }
      zoneFill.material.uniforms.uOpacity.value = 0.035 + 0.085 * zone;
      zoneEdge.material.uniforms.uOpacity.value = 0.42 + 0.5 * zone;
      return { state, who };
    }

    function compose(p, now) {
      const tall = aspect < 1.05, idle = calm ? 0 : 1;
      const t = timeAt(p), mark = smooth(seg(p, 0.575, 0.61)) * (1 - smooth(seg(p, 0.7, 0.72))), zone = smooth(seg(t, 13.7, 14.5));
      const { who } = setYard(t, zone, mark);
      const eStart = 1 - smooth(seg(p, 0.05, 0.15)), eDock = 0.75 * smooth(seg(p, 0.84, 0.885)) * (1 - smooth(seg(p, 0.93, 0.975)));
      const ex = Math.max(eStart, eDock), bob = idle * ex * Math.sin(now * 0.8) * 0.012;
      const lift = { head: 0.2 * eStart + bob, sink: 0.34 * ex + bob * 1.3, deck: 0.12 * ex + bob * 0.6 };
      head.position.y = CU.headY + lift.head; BU.sink.position.y = BU.sinkY + lift.sink; BU.deck.position.y = lift.deck;
      camObj.updateMatrixWorld(true); board.updateMatrixWorld(true);
      setGuides(ex, lift);
      UA.uTime.value = now; UA.uDust.value = calm ? 0 : 0.045;
      // ---- A: the camera's path
      const kA = seg(p, 0.1, 0.33), kTurn = smooth(clamp01(kA / 0.42)), kPush = clamp01((kA - 0.42) / 0.58);
      const kTravel = seg(p, 0.765, 0.89);
      const dA = 2.4 * Math.pow(0.05 / 2.4, Math.pow(kPush, 1.12));
      let pos, tgt, fov;
      if (p < 0.765) {
        pos = v1.copy(P.pair.pos).lerp(P.far.pos, kTurn); tgt = tgtV.copy(P.pair.tgt).lerp(L0, kTurn); fov = P.pair.fov;
        if (kPush > 0) pos.copy(L0).addScaledVector(LD, dA);
        const drift = idle * (1 - kTurn);
        pos.x += drift * 0.11 * Math.sin(now * 0.31) + (1 - kTurn) * lerp(-0.1, 0.14, seg(p, 0, 0.1));
        pos.y += drift * 0.035 * Math.sin(now * 0.23 + 1);
      } else {
        const e = smooth(seg(p, 0.765, 0.93));
        pos = v1.copy(P.hand.pos).lerp(P.dock.pos, e); tgt = tgtV.copy(P.hand.tgt).lerp(P.dock.tgt, e); fov = lerp(P.hand.fov, P.dock.fov, e);
        pos.x += idle * 0.07 * Math.sin(now * 0.29); pos.y += idle * 0.03 * Math.sin(now * 0.21 + 2);
      }
      camA.position.copy(pos); camA.fov = fov; camA.lookAt(tgt); camA.updateMatrixWorld(true);
      const aside = p < 0.765 ? cw * 0.06 * kTurn * (1 - smooth(seg(kPush, 0.25, 0.8))) * (tall ? 0 : 1) : 0;
      pinhole(camA, ch / 2 / tanH(fov), cw / 2 + shift.x + aside, ch / 2 + shift.y, cw, ch);
      UA.uFocal.value = (ch / 2 / tanH(fov)) * dpr;
      UA.uNear0.value = kPush > 0 && p < 0.765 ? 0.1 : 0; UA.uNear1.value = kPush > 0 && p < 0.765 ? 0.34 : 0;
      const look = p < 0.765 ? kTurn : 1 - smooth(seg(p, 0.765, 0.86));
      head.rotation.x = lerp(HEAD_REST.x, HEAD_LOOK.x, look);
      head.rotation.y = lerp(HEAD_REST.y + idle * 0.1 * Math.sin(now * 0.45), HEAD_LOOK.y, look);
      fan.rotation.y = -now * (calm ? 0 : 3 + 26 * smooth(seg(p, 0.84, 0.94))) - 9 * smooth(seg(p, 0.84, 1));
      // ---- the iris: the picture inside the lens, growing as the lens is entered
      const [sx, sy] = toScreen(L0, camA);
      const rLens = kPush > 0 ? (SENSOR_R / dA) * (ch / 2) / tanH(fov) : 0;
      const cover = 0.5 * Math.hypot(cw, ch) * 1.06;
      const inFrame = p >= 0.33 && p < 0.765;
      const settle = smooth(seg(kPush, 0.72, 1)), centre = smooth(seg(kPush, 0.45, 0.92));
      const fr = inFrame ? { h: rect.h, cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2 }
        : { h: lerp(Math.min(2.06 * rLens, 1.3 * rect.h), rect.h, settle), cx: lerp(sx, rect.x + rect.w / 2, centre), cy: lerp(sy, rect.y + rect.h / 2, centre) };
      const irisOn = kPush > 0 && p < 0.765;
      S.showB = irisOn;
      S.back = irisOn ? smooth(seg(kPush, 0, 0.1)) : 0;
      S.shade = irisOn && !inFrame ? 1 : inFrame ? 1 - smooth(seg(p, 0.33, 0.36)) : 0;
      const rIris = inFrame ? 1e9 : rLens;
      S.showA = !irisOn || rIris < cover;
      // ---- B: from the camera's own view up into the field study, in close on the event, and back
      const kOpen = easeInOut(seg(p, 0.4, 0.53)), kNear = easeInOut(seg(p, 0.58, 0.69)), kShut = easeInOut(seg(p, 0.7, 0.748));
      const a = kOpen * (1 - kShut), n = kNear * (1 - kShut);
      const s = fr.h / FH;
      const flat = { eye: [0, G.CAM_H, 0], target: [0, G.CAM_H, 10], f: G.F * s, cx: fr.cx, cy: fr.cy - (FH / 2 - G.Y0) * s };
      const mix3 = (x, y, k) => [lerp(x[0], y[0], k), lerp(x[1], y[1], k), lerp(x[2], y[2], k)];
      const up = { eye: mix3(PB.iso.eye, PB.near.eye, n), target: mix3(PB.iso.target, PB.near.target, n), f: lerp(PB.iso.f, PB.near.f, n), cx: lerp(PB.iso.cx, PB.near.cx, n), cy: lerp(PB.iso.cy, PB.near.cy, n) };
      const eye = mix3(flat.eye, up.eye, a), target = mix3(flat.target, up.target, a);
      const sway = idle * a * (1 - n * 0.5);
      camB.position.set(eye[0] + sway * 0.5 * Math.sin(now * 0.21), eye[1] + sway * 0.25 * Math.sin(now * 0.17 + 1), -eye[2]);
      camB.up.set(0, 1, 0); camB.lookAt(target[0], target[1], -target[2]); camB.updateMatrixWorld(true);
      const fB = lerp(flat.f, up.f, a);
      pinhole(camB, fB, lerp(flat.cx, up.cx, a), lerp(flat.cy, up.cy, a), cw, ch);
      UB.uFocal.value = fB * dpr;
      UB.uReveal.value = smooth(clamp01(a * 1.6));
      const cut = 1 - smooth(clamp01(a * 2.2));
      rightMat.uniforms.uOpacity.value = cut; rightEdgeMat.uniforms.uOpacity.value = cut;
      const study = a * (1 - seg(p, 0.7, 0.72));
      frustum.material.uniforms.uOpacity.value = 0.42 * study * (1 - 0.6 * n); apex.material.uniforms.uOpacity.value = 0.95 * study;
      glow.material.uniforms.uOpacity.value = 0.05 + 0.08 * mark;
      UB.uIris.value.set(sx * dpr, (ch - sy) * dpr, rIris >= 1e8 ? 1e9 : rIris * dpr);
      UB.uWorld.value = 1 - smooth(seg(p, 0.752, 0.765));
      // ---- the card: it appears over the frame as the yard folds back into it, then travels to the board
      const held = v2;
      {
        const d0 = (CARD_H * ch) / (rect.h * 2 * tanH(fov)), wpp = (2 * d0 * tanH(fov)) / ch;
        held.copy(camA.position).addScaledVector(v0.set(0, 0, -1).applyQuaternion(camA.quaternion), d0)
          .addScaledVector(v0.set(1, 0, 0).applyQuaternion(camA.quaternion), (rect.x + rect.w / 2 - cw / 2 - shift.x - aside) * wpp)
          .addScaledVector(v0.set(0, 1, 0).applyQuaternion(camA.quaternion), (ch / 2 + shift.y - (rect.y + rect.h / 2)) * wpp);
      }
      S.card = p >= 0.752;
      if (S.card) {
        if (!cardDrawn) {
          const g = cardCan.getContext("2d"); g.setTransform(2, 0, 0, 2, 0, 0);
          yard.render(g, yard.sample(TIME[TIME.length - 1][1]), { view: yard.CAMERA, annotations: true, zoneStrength: 1 });
          cardTex.needsUpdate = true; cardDrawn = true;
        }
        if (!stream.userData.filled) { fillStream(); stream.userData.filled = true; }
        const kS = seg(p, 0.79, 0.885), fadeIn = smooth(seg(p, 0.752, 0.765));
        dockNow.copy(dock); dockNow.y += lift.sink;
        mFrom.compose(held, camA.quaternion, unit);
        mTo.compose(dockNow, dockQ, v0.set(CARD_DOCK, CARD_DOCK, CARD_DOCK));
        if (kS < 0.5) {      // still the frame, then coming apart from its left edge
          card.position.copy(held); card.quaternion.copy(camA.quaternion); card.scale.setScalar(1);
          const gone = smooth(seg(kS, 0.0, 0.1));
          cardPic.material.opacity = fadeIn * (1 - gone); cardRim.material.opacity = fadeIn * (1 - gone) * smooth(seg(p, 0.765, 0.79));
        } else {             // re-formed on the board
          card.position.copy(dockNow); card.quaternion.copy(dockQ); card.scale.setScalar(CARD_DOCK);
          if (!calm && p > 0.9) card.position.y += 0.006 * Math.sin(now * 0.9);
          const back = smooth(seg(kS, 0.9, 1.0));
          cardPic.material.opacity = back; cardRim.material.opacity = back;
        }
        stream.visible = kS > 0 && kS < 1;
        streamMat.uniforms.uK.value = kS; streamMat.uniforms.uFrom.value.copy(mFrom); streamMat.uniforms.uTo.value.copy(mTo);
        streamMat.uniforms.uCtrl.value.copy(arcCurve.getPoint(0.5)).lerp(held, 0.25);
        const kSig = easeInOut(seg(kTravel, 0.1, 0.9));
        arc.material.opacity = 0.55 * smooth(seg(kTravel, 0.1, 0.2)) * (1 - 0.6 * smooth(seg(p, 0.93, 1)));
        arcGeo.setDrawRange(0, Math.max(2, Math.round(ARC_N * kSig)));
        if (p >= 0.765) { S.showB = false; S.back = 1 - smooth(seg(kTravel, 0, 0.3)); }
        else { S.showB = true; S.back = 1; S.showA = false; }
        UB.uIris.value.z = 1e9;
      } else { arc.material.opacity = 0; stream.visible = false; }
      card.visible = S.card;
      const pulse = p > 0.86 && !calm && Math.sin(now * 5.2) < -0.3;
      stats.leds.forEach((m) => { m.uniforms.uOpacity.value = pulse ? 0.35 : 1; });
      // ---- the page's own elements
      const fade = (x0, x1, x2, x3) => seg(p, x0, x1) * (1 - seg(p, x2, x3));
      const hc = toScreen(v1.set(camObj.position.x, 1.26 + lift.head, camObj.position.z), camA), bc = toScreen(v1.set(board.position.x, 0.52 + lift.sink, board.position.z), camA);
      const early = 1 - seg(p, 0.07, 0.11);
      show("capture", early, hc[0], hc[1]); show("process", early, bc[0], bc[1]);
      show("frame", seg(p, 0.315, 0.335) * (1 - seg(p, 0.76, 0.77)) * (1 - smooth(clamp01(a * 2))));
      show("depth", smooth(clamp01(a * 2.5)));
      if (el.cam) { const c = toScreen(v1.set(0, G.CAM_H, 0), camB); show("cam", study * (c[0] > 0 && c[0] < cw && c[1] > 0 && c[1] < ch ? 1 : 0), c[0] + 10, c[1] - 6); }
      if (who && el.track && mark > 0.01) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        const pp = person.geometry.attributes.position.array, count = person.geometry.drawRange.count;
        for (let i = 0; i < count * 3; i += 9) { const q = toScreen(v0.set(pp[i], pp[i + 1], pp[i + 2]), camB); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
        const pad = 8;
        Object.assign(el.track.style, { width: (x1 - x0 + 2 * pad).toFixed(1) + "px", height: (y1 - y0 + 1.6 * pad).toFixed(1) + "px" });
        el.track.style.opacity = mark.toFixed(3); el.track.style.visibility = "visible";
        el.track.style.transform = `translate(${(x0 - pad).toFixed(1)}px, ${(y0 - pad).toFixed(1)}px)`;
      } else show("track", 0);
      if (el.event) { const z = toScreen(v1.set(Z.x1, 0, -Z.z1), camB); show("event", fade(0.668, 0.682, 0.735, 0.75), z[0] - 6, z[1] + 12); }
      const am = toScreen(arcCurve.getPoint(0.42), camA);
      show("stream", fade(0.835, 0.86, 0.9, 0.925), am[0], am[1]);
      if (el.record) {
        const c = toScreen(card.position, camA), halfW = (CARD_W * card.scale.x / 2 / wppAt(card.position)), halfH = (CARD_H * card.scale.x / 2 / wppAt(card.position));
        if (tall) show("record", seg(p, 0.905, 0.95), 12, Math.min(ch - 8, c[1] + halfH + 18));
        else show("record", seg(p, 0.905, 0.95), Math.min(cw - 16, c[0] + halfW + 34), c[1] - halfH);
      }
      return { t };
    }
    function wppAt(point) { const d = v0.copy(point).sub(camA.position).dot(v1.set(0, 0, -1).applyQuaternion(camA.quaternion)); return (2 * Math.max(0.05, d) * tanH(camA.fov)) / ch; }

    function draw() {
      renderer.setClearColor(BG, 1); renderer.clear();
      if (S.showA) { camA.layers.set(0); renderer.render(A, camA); }
      if (S.back > 0.003) { fill.material.uniforms.alpha.value = S.back; renderer.render(C1, camC); }
      if (S.showB) {
        renderer.clearDepth(); renderer.render(B, camB);
        if (S.shade > 0.003) { shade.material.uniforms.alpha.value = S.shade; renderer.render(C2, camC); }
      }
      if (S.card) { renderer.clearDepth(); camA.layers.set(1); renderer.render(A, camA); camA.layers.set(0); }
    }
    function frame(now) { resize(); const out = compose(pShown, now); draw(); if (opts.onFrame) opts.onFrame(pShown); return out; }
    function tick() {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      const now = clock(), dt = Math.min(0.1, Math.max(0, now - last)); last = now;
      const gap = pTarget - pShown;
      pShown = Math.abs(gap) < 0.0004 ? pTarget : pShown + gap * (1 - Math.exp(-dt * 9));
      frame(now);
    }
    resize();
    return {
      beats: BEATS, renderer, stats,
      setProgress(p, now) { pTarget = clamp01(p); if (now) pShown = pTarget; },
      get progress() { return pShown; },
      get running() { return running; },
      beatAt(p) { let i = 0; for (let j = 0; j < BEATS.length; j += 1) if (p >= BEATS[j].at - 0.012) i = j; return i; },
      render(time) { return frame(time == null ? clock() : time); },
      start() { if (running) return; running = true; last = clock(); raf = requestAnimationFrame(tick); },
      stop() { running = false; cancelAnimationFrame(raf); },
      setCalm(v) { calm = !!v; },
      resize, dispose() { running = false; cancelAnimationFrame(raf); renderer.dispose(); },
    };
  }

  // ---------------------------------------------------------------- the hardware as dots
  // Each solid of the two studies keeps its place and motion (the head turns, the fan spins) but is drawn as dots
  // sampled over its surface, lit by a light from the upper left, plus the outline of its hard edges.
  function pointify(THREE, kit, f) {
    const M = kit.materials, rand = rng(7);
    const D = f.low ? 0.6 : 1;
    const ROLE = new Map([
      [M.shell, { color: 0xe8f0ea, alpha: 0.78, density: 2300, lit: 1, size: 1.4 }],
      [M.shellDark, { color: 0x7d8c85, alpha: 0.4, density: 1500, lit: 1, size: 1.3, edges: true }],
      [M.seam, { color: 0x95a69e, alpha: 0.5, density: 5200, lit: 0.5, size: 1.2 }],
      [M.visor, { color: 0xa3b6ad, alpha: 0.17, density: 2600, lit: 1, size: 1.3, mask: true }],
      [M.bezel, { color: 0xd6efe2, alpha: 0.85, density: 7000, lit: 0.4, size: 1.5 }],
      [M.ring, { color: 0xd6efe2, alpha: 0.8, density: 9000, lit: 0.4, size: 1.4 }],
      [M.barrel, { color: 0x55625d, alpha: 0.28, density: 2400, lit: 1, size: 1.2, edges: true }],
      [M.heat, { color: 0xd2ddd7, alpha: 0.8, density: 1500, lit: 1, size: 1.4 }],
      [M.heatDark, { color: 0xc4d1ca, alpha: 0.75, density: 1800, lit: 1, size: 1.4, edges: true }],
      [M.fan, { color: 0xc9d8d1, alpha: 0.85, density: 2600, lit: 1, size: 1.4, edges: true }],
      [M.fanHub, { color: 0xa3b2ab, alpha: 0.7, density: 2600, lit: 1, size: 1.4, edges: true }],
      [M.steel, { color: 0xdbe5df, alpha: 0.8, density: 2200, lit: 1, size: 1.4, edges: true }],
      [M.steelDark, { color: 0xb5c3bc, alpha: 0.7, density: 1900, lit: 1, size: 1.4, edges: true }],
      [M.port, { color: 0x83918b, alpha: 0.55, density: 1900, lit: 1, size: 1.3, edges: true }],
      [M.black, { color: 0x8a9892, alpha: 0.6, density: 1900, lit: 1, size: 1.3, edges: true }],
      [M.chip, { color: 0x8f9d97, alpha: 0.62, density: 1900, lit: 1, size: 1.3, edges: true }],
      [M.gold, { color: 0xe6ebda, alpha: 0.75, density: 3000, lit: 1, size: 1.3 }],
      [M.cap, { color: 0xd0dbd5, alpha: 0.75, density: 2400, lit: 1, size: 1.35, edges: true }],
      [M.white, { color: 0xe6eee9, alpha: 0.75, density: 2400, lit: 1, size: 1.35, edges: true }],
      [M.tongue, { color: 0xb4eed0, alpha: 0.6, density: 3000, lit: 0.6, size: 1.25 }],
      [M.pcbEdge, { color: 0x8fb0a0, alpha: 0.6, density: 2000, lit: 1, size: 1.3, edges: true }],
      [M.led, { color: 0xb4eed0, alpha: 1, led: true, size: 3.2 }],
      [M.ledDim, { color: 0x5f8a78, alpha: 0.9, led: true, size: 2.2 }],
    ]);
    const PCB = { color: 0xa9d6be, alpha: 0.7, density: 3200, lit: 1, size: 1.3, edges: true, texture: true };
    const mats = new Map(), lineMats = new Map(), leds = [];
    const matFor = (spec) => { if (!mats.has(spec)) { const m = f.pointsMat({ color: spec.color, size: spec.size, lit: spec.lit || 0 }); mats.set(spec, m); if (spec === ROLE.get(M.led)) leds.push(m); } return mats.get(spec); };
    const lineFor = (spec) => { if (!lineMats.has(spec.color)) lineMats.set(spec.color, f.lineMat({ color: spec.color, opacity: 0.26 })); return lineMats.get(spec.color); };
    const WIN = kit.camera.userData.window;
    const visorInside = (u, v) => {  // the window's rounded rectangle, as hardware.js draws its alpha map (1024 by 512)
      const x = u * 1024, y = (1 - v) * 512, { cx, cy, hw, hh, rr } = WIN;
      const dx = Math.max(0, Math.abs(x - cx) - (hw - rr)), dy = Math.max(0, Math.abs(y - cy) - (hh - rr));
      return Math.abs(x - cx) <= hw && Math.abs(y - cy) <= hh && dx * dx + dy * dy <= rr * rr;
    };
    // Dots laid out in order where the solid allows it (rings on turned parts, a lattice on spheres, a grid on boxes),
    // scattered evenly elsewhere. Returns positions, normals and, where the solid has them, texture coordinates.
    const TAU = Math.PI * 2;
    function structured(geo, s) {
      const q = geo.parameters || {}, P = [], N = [], U = [];
      if (geo.type === "SphereGeometry" && (q.phiLength == null || q.phiLength >= TAU - 1e-6) && (q.thetaLength == null || q.thetaLength >= Math.PI - 1e-6)) {
        const R = q.radius, n = Math.max(12, Math.round((4 * Math.PI * R * R) / (s * s))), ga = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < n; i += 1) {
          const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), ph = i * ga, x = Math.cos(ph) * r, z = Math.sin(ph) * r;
          let phi = Math.atan2(z, -x); if (phi < 0) phi += TAU;
          P.push(R * x, R * y, R * z); N.push(x, y, z); U.push(phi / TAU, 1 - Math.acos(y) / Math.PI);
        }
      } else if (geo.type === "LatheGeometry") {
        const pts = q.points, lens = [0];
        for (let i = 1; i < pts.length; i += 1) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
        let ring = 0;
        for (let d = s / 2, i = 1; d < lens[lens.length - 1]; d += s, ring += 1) {
          while (i < lens.length - 1 && lens[i] < d) i += 1;
          const k = (d - lens[i - 1]) / (lens[i] - lens[i - 1] || 1), a = pts[i - 1], b = pts[i];
          const r = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k, dr = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dr, dy) || 1;
          const nr = dy / l, ny = -dr / l, n = Math.max(1, Math.round((TAU * r) / s));
          for (let j = 0; j < n; j += 1) { const t = ((j + (ring % 2) * 0.5) / n) * TAU; P.push(r * Math.sin(t), y, r * Math.cos(t)); N.push(nr * Math.sin(t), ny, nr * Math.cos(t)); }
        }
      } else if (geo.type === "TorusGeometry") {
        const R = q.radius, n = Math.max(12, Math.round((TAU * R) / (s * 0.6)));
        for (let j = 0; j < n; j += 1) { const t = (j / n) * TAU; P.push(R * Math.cos(t), R * Math.sin(t), 0); N.push(Math.cos(t), Math.sin(t), 0); }
      } else if (geo.type === "BoxGeometry") {
        const w = q.width, h = q.height, d = q.depth;
        const grid2 = (la, lb, put) => { const na = Math.max(1, Math.round(la / s)), nb = Math.max(1, Math.round(lb / s)); for (let i = 0; i < na; i += 1) for (let j = 0; j < nb; j += 1) put(((i + 0.5) / na - 0.5) * la, ((j + 0.5) / nb - 0.5) * lb); };
        for (const sg of [-1, 1]) {
          grid2(h, d, (y, z) => { P.push(sg * w / 2, y, z); N.push(sg, 0, 0); U.push(0, 0); });
          grid2(w, d, (x, z) => { P.push(x, sg * h / 2, z); N.push(0, sg, 0); U.push(x / w + 0.5, 0.5 - z / d); });
          grid2(w, h, (x, y) => { P.push(x, y, sg * d / 2); N.push(0, 0, sg); U.push(0, 0); });
        }
      } else if (geo.type === "CylinderGeometry") {
        const rt = q.radiusTop, rb = q.radiusBottom, hh = q.height, m = Math.max(1, Math.round(hh / s)), slope = (rb - rt) / hh;
        for (let j = 0; j <= m; j += 1) {
          const y = -hh / 2 + (hh * j) / m, r = rb + (rt - rb) * (j / m), n = Math.max(6, Math.round((TAU * r) / s));
          for (let k = 0; k < n; k += 1) { const t = ((k + (j % 2) * 0.5) / n) * TAU, l = Math.hypot(1, slope); P.push(r * Math.sin(t), y, r * Math.cos(t)); N.push(Math.sin(t) / l, slope / l, Math.cos(t) / l); }
        }
        if (!q.openEnded) for (const sg of [-1, 1]) {
          const R = sg > 0 ? rt : rb;
          for (let rr = s; rr < R - s * 0.4; rr += s) { const n = Math.max(6, Math.round((TAU * rr) / s)); for (let k = 0; k < n; k += 1) { const t = (k / n) * TAU; P.push(rr * Math.sin(t), (sg * hh) / 2, rr * Math.cos(t)); N.push(0, sg, 0); } }
        }
      } else return null;
      return { P, N, U: U.length ? U : null };
    }
    const area3 = (a, b, c) => { const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
      const x = aby * acz - abz * acy, y = abz * acx - abx * acz, z = abx * acy - aby * acx; return 0.5 * Math.sqrt(x * x + y * y + z * z); };
    let total = 0;
    const meshes = [];
    kit.camera.traverse((o) => { if (o.isMesh) meshes.push(o); });
    kit.board.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tC = new THREE.Vector3(), nA = new THREE.Vector3(), nB = new THREE.Vector3(), nC = new THREE.Vector3();
    const p = new THREE.Vector3(), nn = new THREE.Vector3(), m4 = new THREE.Matrix4(), n3 = new THREE.Matrix3();
    for (const mesh of meshes) {
      const many = Array.isArray(mesh.material);
      const spec = many ? PCB : ROLE.get(mesh.material);
      const hide = () => { (many ? mesh.material : [mesh.material]).forEach((m) => { m.visible = false; }); };
      if (!spec) { hide(); continue; }
      const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
      const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
      const out = [], outN = [], outA = [];
      if (spec.led) {
        geo.computeBoundingBox(); geo.boundingBox.getCenter(p);
        out.push(p.x, p.y, p.z); outN.push(0, 0, 1); outA.push(spec.alpha);
      } else {
        let img = null;
        if (spec.texture && many) { const map = mesh.material[2] && mesh.material[2].map; if (map && map.image && map.image.getContext) { const c = map.image; img = { d: c.getContext("2d").getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }; } }
        const shade = (u, v, ny) => {  // the board's printed traces show through as brighter dots
          if (!img || ny < 0.9) return 1;
          const px = Math.min(img.w - 1, Math.max(0, Math.floor(u * img.w))), py = Math.min(img.h - 1, Math.max(0, Math.floor((1 - v) * img.h)));
          const o = (py * img.w + px) * 4, l = (0.3 * img.d[o] + 0.59 * img.d[o + 1] + 0.11 * img.d[o + 2]) / 255;
          return Math.min(1.7, Math.max(0.22, (l - 0.12) * 3.2));
        };
        const st = structured(mesh.geometry, 1 / Math.sqrt(spec.density * D));
        if (st) {
          for (let i = 0, j = 0; i < st.P.length; i += 3, j += 2) {
            if (spec.mask && st.U && !visorInside(st.U[j], st.U[j + 1])) continue;
            out.push(st.P[i], st.P[i + 1], st.P[i + 2]); outN.push(st.N[i], st.N[i + 1], st.N[i + 2]);
            outA.push(spec.alpha * (st.U ? shade(st.U[j], st.U[j + 1], st.N[i + 1]) : 1));
          }
        } else {
          for (let i = 0; i < pos.count; i += 3) {
            tA.fromBufferAttribute(pos, i); tB.fromBufferAttribute(pos, i + 1); tC.fromBufferAttribute(pos, i + 2);
            let k = Math.floor(area3(tA, tB, tC) * spec.density * D + rand());
            if (k <= 0) continue;
            if (nor) { nA.fromBufferAttribute(nor, i); nB.fromBufferAttribute(nor, i + 1); nC.fromBufferAttribute(nor, i + 2); }
            while (k-- > 0) {
              let r1 = rand(), r2 = rand(); if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
              const r0 = 1 - r1 - r2;
              let a = spec.alpha;
              if (uv && (spec.mask || img)) {
                const u = uv.getX(i) * r0 + uv.getX(i + 1) * r1 + uv.getX(i + 2) * r2, v = uv.getY(i) * r0 + uv.getY(i + 1) * r1 + uv.getY(i + 2) * r2;
                if (spec.mask && !visorInside(u, v)) continue;
                a *= shade(u, v, nA.y);
              }
              p.set(tA.x * r0 + tB.x * r1 + tC.x * r2, tA.y * r0 + tB.y * r1 + tC.y * r2, tA.z * r0 + tB.z * r1 + tC.z * r2);
              if (nor) nn.set(nA.x * r0 + nB.x * r1 + nC.x * r2, nA.y * r0 + nB.y * r1 + nC.y * r2, nA.z * r0 + nB.z * r1 + nC.z * r2).normalize(); else nn.set(0, 1, 0);
              out.push(p.x, p.y, p.z); outN.push(nn.x, nn.y, nn.z); outA.push(a);
            }
          }
        }
      }
      // an instanced solid repeats its dots at every instance, in the solid's own space
      let P3 = out, N3 = outN, A1 = outA;
      if (mesh.isInstancedMesh) {
        P3 = []; N3 = []; A1 = [];
        for (let j = 0; j < mesh.count; j += 1) {
          mesh.getMatrixAt(j, m4); n3.getNormalMatrix(m4);
          for (let i = 0; i < out.length; i += 3) {
            p.set(out[i], out[i + 1], out[i + 2]).applyMatrix4(m4); nn.set(outN[i], outN[i + 1], outN[i + 2]).applyMatrix3(n3).normalize();
            P3.push(p.x, p.y, p.z); N3.push(nn.x, nn.y, nn.z); A1.push(outA[i / 3]);
          }
        }
      }
      if (P3.length) {
        const seeds = new Float32Array(P3.length / 3); for (let i = 0; i < seeds.length; i += 1) seeds[i] = rand();
        const pts = new THREE.Points(f.pointsGeo(new Float32Array(P3), new Float32Array(A1), new Float32Array(N3), seeds), matFor(spec));
        pts.frustumCulled = false; mesh.add(pts); total += P3.length / 3;
      }
      if (spec.mask) {  // the window's outline, on the sphere
        const R = mesh.geometry.parameters.radius + 0.002, loop = [], path = [];
        const { cx, cy, hw, hh, rr } = WIN;
        const arcPts = (ax, ay, a0) => { for (let s = 0; s <= 8; s += 1) { const a = a0 + (s / 8) * (Math.PI / 2); path.push([ax + rr * Math.cos(a), ay + rr * Math.sin(a)]); } };
        arcPts(cx + hw - rr, cy - hh + rr, -Math.PI / 2); arcPts(cx + hw - rr, cy + hh - rr, 0); arcPts(cx - hw + rr, cy + hh - rr, Math.PI / 2); arcPts(cx - hw + rr, cy - hh + rr, Math.PI);
        const toS = ([x, y]) => { const phi = (x / 1024) * Math.PI * 2, th = (y / 512) * Math.PI; return [-R * Math.cos(phi) * Math.sin(th), R * Math.cos(th), R * Math.sin(phi) * Math.sin(th)]; };
        for (let i = 0; i < path.length; i += 1) loop.push(...toS(path[i]), ...toS(path[(i + 1) % path.length]));
        const ln = new THREE.LineSegments(f.linesGeo(new Float32Array(loop), 0.5), f.lineMat({ color: 0xcfe3d9, opacity: 1 }));
        ln.frustumCulled = false; mesh.add(ln);
      }
      if (spec.edges) {
        const eg = new THREE.EdgesGeometry(mesh.geometry, 28), ep = eg.attributes.position.array;
        let E = ep;
        if (mesh.isInstancedMesh) {
          const arr = [];
          for (let j = 0; j < mesh.count; j += 1) { mesh.getMatrixAt(j, m4); for (let i = 0; i < ep.length; i += 3) { p.set(ep[i], ep[i + 1], ep[i + 2]).applyMatrix4(m4); arr.push(p.x, p.y, p.z); } }
          E = new Float32Array(arr);
        }
        if (E.length) { const ln = new THREE.LineSegments(f.linesGeo(new Float32Array(E), 1), lineFor(spec)); ln.frustumCulled = false; mesh.add(ln); }
      }
      hide();
    }
    return { points: total, leds };
  }

  root.SentinelFilm = { create, BEATS };
})(typeof self !== "undefined" ? self : this);
