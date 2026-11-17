/* Sentinel site: an original hardware study in three.js (r128).
   Two objects, drawn from primitives: a white pan-tilt camera and an edge compute board with a fan heatsink.
   They illustrate the featured build's two roles (capture, process). They are not replicas of any product and
   carry no maker's marks. 1 unit = 10 cm. */
(function (root) {
  "use strict";

  function build(THREE, opts) {
    const o = opts || {};
    const M = {};
    const std = (p) => new THREE.MeshStandardMaterial(p);
    const phys = (p) => new THREE.MeshPhysicalMaterial(p);
    M.shell = phys({ color: 0xeceae5, roughness: 0.46, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.45 });
    M.shellDark = std({ color: 0x1a1c1d, roughness: 0.75 });
    M.seam = std({ color: 0x2a2b2b, roughness: 0.9 });
    M.visor = phys({ color: 0x050607, roughness: 0.07, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, alphaTest: 0.5 });
    M.bezel = std({ color: 0x1b1d20, roughness: 0.38, metalness: 0.85, envMapIntensity: 0.5 });
    M.barrel = std({ color: 0x040506, roughness: 1, metalness: 0, envMapIntensity: 0 });
    M.ring = std({ color: 0x111317, roughness: 0.18, metalness: 0.9 });
    M.glass = phys({ color: 0x2b3442, roughness: 0.03, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false });
    M.pcb = std({ color: 0xffffff, roughness: 0.62, metalness: 0.08 });
    M.pcbEdge = std({ color: 0x1a3a2e, roughness: 0.7 });
    M.heat = std({ color: 0x7c8186, roughness: 0.4, metalness: 0.85 });
    M.heatDark = std({ color: 0x53585d, roughness: 0.46, metalness: 0.85 });
    M.fan = std({ color: 0x4a4f54, roughness: 0.5, metalness: 0.3 });
    M.fanHub = std({ color: 0x24272a, roughness: 0.35, metalness: 0.4 });
    M.steel = std({ color: 0xb9bcc0, roughness: 0.3, metalness: 0.95 });
    M.steelDark = std({ color: 0x6f7377, roughness: 0.4, metalness: 0.9 });
    M.port = std({ color: 0x0b0c0d, roughness: 0.6 });
    M.tongue = std({ color: 0x2f5fa8, roughness: 0.5 });
    M.black = std({ color: 0x121314, roughness: 0.55 });
    M.chip = std({ color: 0x1c1d1f, roughness: 0.38, metalness: 0.1 });
    M.gold = std({ color: 0xd9b25a, roughness: 0.35, metalness: 1 });
    M.cap = std({ color: 0xa9adb1, roughness: 0.3, metalness: 0.9 });
    M.white = std({ color: 0xe8e6df, roughness: 0.6 });
    M.led = new THREE.MeshBasicMaterial({ color: 0xb4eed0 });
    M.ledDim = new THREE.MeshBasicMaterial({ color: 0x35554a });
    // r128 reads material colours as linear light: these are written as they should look on screen, so convert them
    for (const k in M) if (M[k].color) M[k].color.convertSRGBToLinear();

    const mesh = (geo, mat, x, y, z, cast) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      m.castShadow = cast !== false; m.receiveShadow = true;
      return m;
    };
    const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
    const cyl = (r, h, mat, x, y, z, seg) => mesh(new THREE.CylinderGeometry(r, r, h, seg || 32), mat, x, y, z);

    // ------------------------------------------------------------ the camera
    const camera = new THREE.Group();
    camera.name = "camera";
    {
      const BR = 0.4, BH = 0.38;
      const profile = [[0.001, 0], [BR - 0.02, 0], [BR - 0.006, 0.006], [BR, 0.022], [BR, BH - 0.045], [BR - 0.004, BH - 0.022],
        [BR - 0.016, BH - 0.007], [BR - 0.04, BH], [0.33, BH], [0.315, BH - 0.006]].map(([x, y]) => new THREE.Vector2(x, y));
      const base = mesh(new THREE.LatheGeometry(profile, 96), M.shell);
      base.name = "base";
      const foot = cyl(BR - 0.025, 0.012, M.shellDark, 0, -0.004, 0, 64);
      const well = cyl(0.315, 0.012, M.shellDark, 0, BH - 0.004, 0, 48);  // the shadowed seat the head turns in
      const status = mesh(new THREE.CircleGeometry(0.011, 16), M.led, 0, 0.11, BR + 0.001, false);
      status.name = "status";
      const baseGroup = new THREE.Group();
      baseGroup.add(base, foot, well, status);
      baseGroup.name = "baseGroup";

      const head = new THREE.Group();
      head.name = "head";
      head.position.set(0, 0.73, 0);
      const R = 0.42;
      const ball = mesh(new THREE.SphereGeometry(R, 96, 64), M.shell);
      const seam = mesh(new THREE.TorusGeometry(Math.sqrt(R * R - 0.0036) + 0.0006, 0.003, 8, 160), M.seam, 0, 0, -0.06, false);
      // the dark window: a second sphere, shown only inside a rounded upright slot facing +Z
      const alpha = document.createElement("canvas");
      alpha.width = 1024; alpha.height = 512;
      const a = alpha.getContext("2d");
      a.fillStyle = "#000"; a.fillRect(0, 0, 1024, 512);
      a.fillStyle = "#fff";
      const cx = 256, cy = 236, hw = 74, hh = 124, rr = 74;  // a tall window with round ends
      a.beginPath();
      a.moveTo(cx - hw + rr, cy - hh); a.lineTo(cx + hw - rr, cy - hh); a.quadraticCurveTo(cx + hw, cy - hh, cx + hw, cy - hh + rr);
      a.lineTo(cx + hw, cy + hh - rr); a.quadraticCurveTo(cx + hw, cy + hh, cx + hw - rr, cy + hh);
      a.lineTo(cx - hw + rr, cy + hh); a.quadraticCurveTo(cx - hw, cy + hh, cx - hw, cy + hh - rr);
      a.lineTo(cx - hw, cy - hh + rr); a.quadraticCurveTo(cx - hw, cy - hh, cx - hw + rr, cy - hh); a.fill();
      const alphaMap = new THREE.CanvasTexture(alpha);
      M.visor.alphaMap = alphaMap;
      const visor = mesh(new THREE.SphereGeometry(R + 0.0025, 96, 64), M.visor, 0, 0, 0, false);
      visor.name = "visor";
      // the lens, a little below the head's centre line
      const lens = new THREE.Group();
      lens.name = "lens";
      const lat = -0.2;
      const dir = new THREE.Vector3(0, Math.sin(lat), Math.cos(lat));
      lens.position.copy(dir.clone().multiplyScalar(R - 0.012));
      lens.lookAt(dir.clone().multiplyScalar(4));
      const bezel = mesh(new THREE.TorusGeometry(0.112, 0.013, 16, 96), M.bezel, 0, 0, 0.012, false);
      const barrel = mesh(new THREE.CylinderGeometry(0.104, 0.07, 0.11, 64, 1, true), M.barrel, 0, 0, -0.04, false);
      barrel.rotation.x = Math.PI / 2; barrel.material.side = THREE.BackSide;
      const rings = [[0.088, 0.0, 0.006], [0.07, -0.028, 0.005], [0.052, -0.056, 0.005]].map(([r, z, tube]) =>
        mesh(new THREE.TorusGeometry(r, tube, 12, 72), M.ring, 0, 0, z, false));
      const sensor = mesh(new THREE.CircleGeometry(0.05, 48), new THREE.MeshBasicMaterial({ color: 0x010202 }), 0, 0, -0.09, false);
      sensor.name = "sensor";  // the film puts the courtyard picture here
      const glass = mesh(new THREE.SphereGeometry(0.21, 48, 24, 0, Math.PI * 2, 0, 0.5), M.glass, 0, 0, -0.166, false);
      glass.rotation.x = Math.PI / 2; glass.renderOrder = 5;
      const ir = mesh(new THREE.CircleGeometry(0.014, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3a1216).convertSRGBToLinear() }), 0.0, 0.205, 0.004, false);
      const pin = mesh(new THREE.CircleGeometry(0.006, 16), M.ledDim, 0.0, 0.25, 0.004, false);
      lens.add(barrel, ...rings, sensor, bezel, glass, ir, pin);
      head.add(ball, seam, visor, lens);
      camera.add(baseGroup, head);
      camera.userData = { head, lens, sensor, glass, base: baseGroup, status, window: { cx, cy, hw, hh, rr }, headY: 0.73, baseH: BH, baseR: BR };
    }

    // ------------------------------------------------------------ the compute board
    const board = new THREE.Group();
    board.name = "board";
    {
      const Wb = 1.0, Db = 0.8, T = 0.016, Y = 0.07;
      // printed circuit: a drawn pattern, so it reads as a board and not a slab
      const art = document.createElement("canvas");
      art.width = 1024; art.height = 820;
      const c = art.getContext("2d");
      c.fillStyle = "#17392c"; c.fillRect(0, 0, 1024, 820);
      const rnd = (n) => { const s = Math.sin(n * 91.7 + 17.3) * 43758.5453; return s - Math.floor(s); };
      c.strokeStyle = "#235242"; c.lineWidth = 3;
      for (let i = 0; i < 70; i += 1) {
        let x = 30 + rnd(i) * 960, y = 30 + rnd(i + 100) * 760;
        c.beginPath(); c.moveTo(x, y);
        for (let k = 0; k < 4; k += 1) {
          if ((i + k) % 2) x += (rnd(i * 7 + k) - 0.5) * 300; else y += (rnd(i * 5 + k) - 0.5) * 240;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      c.fillStyle = "#b99a4e";
      for (let i = 0; i < 150; i += 1) c.fillRect(20 + rnd(i + 300) * 980, 20 + rnd(i + 500) * 780, 5, 5);
      c.strokeStyle = "#c9d2cc"; c.lineWidth = 1.5; c.globalAlpha = 0.5;
      for (let i = 0; i < 26; i += 1) c.strokeRect(40 + rnd(i + 700) * 900, 40 + rnd(i + 800) * 720, 26 + rnd(i) * 50, 16 + rnd(i + 3) * 26);
      c.globalAlpha = 0.7; c.fillStyle = "#cfd8d2"; c.font = "600 15px ui-monospace, Menlo, Consolas, monospace";
      c.fillText("EDGE COMPUTE / STUDY 02", 42, 792); c.fillText("J1", 960, 60); c.fillText("FAN", 300, 150);
      c.globalAlpha = 1;
      const tex = new THREE.CanvasTexture(art);
      tex.anisotropy = 8; if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
      const top = std({ map: tex, roughness: 0.6, metalness: 0.1 });
      const pcb = mesh(new THREE.BoxGeometry(Wb, T, Db), [M.pcbEdge, M.pcbEdge, top, M.pcbEdge, M.pcbEdge, M.pcbEdge], 0, Y, 0);
      pcb.name = "pcb";
      const tray = box(Wb + 0.1, 0.03, Db + 0.1, M.black, 0, 0.015, 0);
      tray.name = "tray";
      board.add(tray);
      const deck = new THREE.Group();
      deck.name = "deck";
      board.add(deck);
      deck.add(pcb);
      for (const [x, z] of [[-0.45, -0.35], [0.45, -0.35], [-0.45, 0.35], [0.45, 0.35]]) {
        deck.add(cyl(0.022, Y, M.steelDark, x, Y / 2 - T / 2, z, 16), cyl(0.03, 0.006, M.gold, x, Y + T / 2 + 0.003, z, 20));
      }
      const top0 = Y + T / 2;

      // heatsink with a fan: base plate, fins, a shroud with a round opening, the fan
      const sink = new THREE.Group();
      sink.name = "sink";
      const SX = 0.6, SZ = 0.5, cx = -0.1, cz = -0.06;
      sink.position.set(cx, top0, cz);
      sink.add(box(SX + 0.04, 0.05, SZ + 0.04, M.chip, 0, 0.025, 0));           // the module under it
      sink.add(box(SX, 0.03, SZ, M.heat, 0, 0.065, 0));
      const fins = 19, finH = 0.15;
      const fin = new THREE.InstancedMesh(new THREE.BoxGeometry(0.009, finH, SZ), M.heat, fins);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < fins; i += 1) { m4.makeTranslation(-SX / 2 + 0.006 + (i * (SX - 0.012)) / (fins - 1), 0.08 + finH / 2, 0); fin.setMatrixAt(i, m4); }
      fin.castShadow = true; fin.receiveShadow = true;
      sink.add(fin);
      const shape = new THREE.Shape();
      const sx = SX / 2, sz = SZ / 2, cr = 0.03;
      shape.moveTo(-sx + cr, -sz); shape.lineTo(sx - cr, -sz); shape.quadraticCurveTo(sx, -sz, sx, -sz + cr);
      shape.lineTo(sx, sz - cr); shape.quadraticCurveTo(sx, sz, sx - cr, sz); shape.lineTo(-sx + cr, sz);
      shape.quadraticCurveTo(-sx, sz, -sx, sz - cr); shape.lineTo(-sx, -sz + cr); shape.quadraticCurveTo(-sx, -sz, -sx + cr, -sz);
      const hole = new THREE.Path(); hole.absarc(0, 0, 0.205, 0, Math.PI * 2, true); shape.holes.push(hole);
      const shroudGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.028, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 48 });
      shroudGeo.rotateX(-Math.PI / 2);
      const shroud = mesh(shroudGeo, M.heatDark, 0, 0.08 + finH - 0.004, 0);
      shroud.name = "shroud";
      sink.add(shroud);
      const fan = new THREE.Group();
      fan.name = "fan";
      fan.position.set(0, 0.08 + finH - 0.012, 0);
      fan.add(cyl(0.062, 0.03, M.fanHub, 0, 0.012, 0, 32), cyl(0.03, 0.004, M.steelDark, 0, 0.029, 0, 24));
      const bladeShape = new THREE.Shape();
      bladeShape.moveTo(0.05, -0.012); bladeShape.quadraticCurveTo(0.13, -0.05, 0.196, -0.018);
      bladeShape.quadraticCurveTo(0.2, 0.012, 0.185, 0.04); bladeShape.quadraticCurveTo(0.12, 0.02, 0.05, 0.03); bladeShape.lineTo(0.05, -0.012);
      const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.006, bevelEnabled: false, curveSegments: 10 });
      bladeGeo.rotateX(-Math.PI / 2);
      for (let i = 0; i < 9; i += 1) {
        const blade = mesh(bladeGeo, M.fan, 0, 0.008, 0, false);
        blade.rotation.y = (i / 9) * Math.PI * 2; blade.rotation.z = 0.0;
        const tilt = new THREE.Group(); tilt.rotation.y = blade.rotation.y; blade.rotation.y = 0; blade.rotation.x = -0.32; tilt.add(blade);
        fan.add(tilt);
      }
      sink.add(fan);
      sink.add(cyl(0.21, 0.004, M.black, 0, 0.082, 0, 48));  // the dark floor seen through the opening
      board.add(sink);

      // connectors along the front edge (+Z), left to right
      const fz = Db / 2;
      const ports = new THREE.Group();
      ports.name = "ports";
      const shell = (w, h, d, x, name) => {
        const g = new THREE.Group();
        g.add(box(w, h, d, M.steel, 0, h / 2, 0), box(w - 0.02, h - 0.022, 0.012, M.port, 0, h / 2, d / 2 + 0.0005));
        g.position.set(x, top0, fz - d / 2 + 0.03); g.name = name;
        return g;
      };
      const jack = new THREE.Group();
      jack.add(box(0.1, 0.1, 0.13, M.black, 0, 0.05, 0));
      const barrel = cyl(0.03, 0.012, M.steelDark, 0, 0.052, 0.066, 24); barrel.rotation.x = Math.PI / 2; jack.add(barrel);
      jack.position.set(-0.41, top0, fz - 0.045);
      const video = shell(0.17, 0.062, 0.15, -0.255, "video");
      const usbA = shell(0.145, 0.158, 0.175, -0.08, "usbA");
      const usbB = shell(0.145, 0.158, 0.175, 0.085, "usbB");
      for (const g of [usbA, usbB]) for (const y of [0.045, 0.115]) g.add(box(0.11, 0.012, 0.02, M.tongue, 0, y, 0.085));
      const lan = shell(0.165, 0.138, 0.2, 0.26, "lan");
      lan.add(mesh(new THREE.PlaneGeometry(0.02, 0.012), M.led, -0.06, 0.122, 0.1012, false), mesh(new THREE.PlaneGeometry(0.02, 0.012), new THREE.MeshBasicMaterial({ color: 0xd9a441 }), 0.06, 0.122, 0.1012, false));
      const usbC = shell(0.092, 0.036, 0.08, 0.405, "usbC");
      ports.add(jack, video, usbA, usbB, lan, usbC);
      deck.add(ports);

      // the pin header on the right edge, and what else populates a board
      const header = new THREE.Group();
      header.add(box(0.052, 0.026, 0.51, M.black, 0, 0.013, 0));
      const pins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0065, 0.06, 0.0065), M.gold, 40);
      for (let i = 0; i < 40; i += 1) { m4.makeTranslation(i % 2 ? 0.0125 : -0.0125, 0.05, -0.2375 + Math.floor(i / 2) * 0.025); pins.setMatrixAt(i, m4); }
      header.add(pins);
      header.position.set(0.455, top0, -0.1);
      deck.add(header);
      const parts = new THREE.Group();
      parts.name = "parts";
      [[-0.44, 0.02, -0.3, 0.05], [-0.44, 0.02, -0.19, 0.05], [0.29, 0.02, 0.1, 0.045], [0.33, 0.02, -0.3, 0.04]].forEach(([x, , z, r]) => {
        parts.add(cyl(r * 0.62, 0.075, M.cap, x, top0 + 0.0375, z, 24), cyl(r * 0.56, 0.003, M.black, x, top0 + 0.0765, z, 24));
      });
      [[0.3, -0.13, 0.11, 0.09], [0.3, 0.0, 0.07, 0.07], [-0.43, 0.08, 0.06, 0.12], [0.2, 0.2, 0.1, 0.05]].forEach(([x, z, w, d]) => parts.add(box(w, 0.018, d, M.chip, x, top0 + 0.009, z)));
      [[-0.46, -0.02], [-0.46, 0.2]].forEach(([x, z]) => parts.add(box(0.035, 0.022, 0.17, M.white, x, top0 + 0.011, z)));  // ribbon sockets
      const small = new THREE.InstancedMesh(new THREE.BoxGeometry(0.016, 0.008, 0.009), M.steelDark, 46);
      for (let i = 0; i < 46; i += 1) {
        const x = -0.47 + rnd(i + 40) * 0.94, z = -0.38 + rnd(i + 90) * 0.62;
        const inSink = Math.abs(x - cx) < SX / 2 + 0.03 && Math.abs(z - cz) < SZ / 2 + 0.03;
        m4.makeRotationY(i % 2 ? Math.PI / 2 : 0); m4.setPosition(inSink ? 0.38 : x, top0 + 0.004, inSink ? -0.36 + i * 0.008 : z);
        small.setMatrixAt(i, m4);
      }
      parts.add(small);
      const power = mesh(new THREE.BoxGeometry(0.018, 0.008, 0.012), M.led, 0.4, top0 + 0.004, 0.27, false);
      power.name = "power";
      parts.add(power);
      deck.add(parts);
      board.userData = { fan, sink, deck, tray, sinkY: top0, ports, pcb, power, top: top0 + 0.08 + finH + 0.03, sinkCentre: new THREE.Vector3(cx, top0 + 0.26, cz) };
    }

    return { camera, board, materials: M };
  }

  root.SentinelHardware = { build };
})(typeof self !== "undefined" ? self : this);
