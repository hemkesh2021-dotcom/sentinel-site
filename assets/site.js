/* Sentinel v2 site candidate: the page's own behaviour. Everything visible here is driven by the shared synthetic
   courtyard (courtyard.js): the opening frame, the dashboard's scene director, the evidence plate and the hardware film. */
(function () {
  "use strict";
  const cfg = Object.assign({ three: "assets/three.min.js", dashboard: "dashboard.html", posters: "posters/", trackLabel: (a) => "Track " + a.track }, window.SENTINEL_SITE || {});
  const yard = window.SentinelCourtyard;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches || /[?&]calm=1/.test(location.search);
  const seen = (el, fn, o) => { const io = new IntersectionObserver((es) => es.forEach((e) => fn(e.isIntersecting, e)), o || {}); io.observe(el); return io; };
  const sec = (t) => (t < 10 ? "0" : "") + t.toFixed(1) + " s";

  // ---------------------------------------------------------------- what the scripted events are called
  const SAY = {
    enter: (a) => (a === "b" ? "A second person comes in through the gate" : "A person comes in through the gate"),
    confirmed: (a) => "Followed as track " + yard.ACTORS[a].track,
    face_on: () => "Face toward the camera",
    zone_enter: () => "Steps into Zone A · the zone rule starts counting",
    incident: () => "Still in Zone A past the threshold → an incident opens",
    face_off: () => "Turns away · still the same track",
    zone_exit: () => "Leaves Zone A",
    leave: () => "Leaves the frame",
    stall_start: () => "The stream stalls · freshness falls to stale",
    stall_end: () => "The stream resumes",
  };
  const said = (e) => (SAY[e.kind] ? SAY[e.kind](e.actor) : e.kind);
  // the script's events, plus the moment the demonstration's zone rule (a one second threshold) opens its incident
  const recording = window.SentinelTrackReplay.recording;
  const EVENTS = yard.EVENTS.concat({ t: recording.opened, kind: "incident", actor: "a" }).sort((a, b) => a.t - b.t);
  const lastEvent = (t) => { let hit = null; for (const e of EVENTS) if (e.t <= t + 1e-6) hit = e; return hit; };
  function sharp(canvas) {  // a 960 by 540 picture, drawn at the screen's density
    const k = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = yard.W * k; canvas.height = yard.H * k;
    const ctx = canvas.getContext("2d"); ctx.scale(k, k);
    return ctx;
  }

  // ---------------------------------------------------------------- entrances
  if (!calm) {
    const groups = [".sec-head > *", ".chain li", ".lanes", ".try li", ".notes li", ".status-row", ".links li", ".pair > *", ".evidence-plate", ".deck"];
    for (const g of groups) $$(g).forEach((n, i) => { n.classList.add("rv"); n.style.setProperty("--d", Math.min(i, 5) * 70 + "ms"); });
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    $$(".rv").forEach((n) => io.observe(n));
  }
  {
    const links = $$(".top-nav a"), map = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.setAttribute("aria-current", String(a === map.get(e.target.id)))); }), { rootMargin: "-45% 0px -50% 0px" });
    $$("main > section[id]").forEach((s) => io.observe(s));
  }

  // ---------------------------------------------------------------- the opening frame
  {
    const canvas = $("#hero-canvas"), ctx = sharp(canvas), line = $("#hero-event"), bar = $("#hero-bar");
    const FIELD = yard.fieldView({ box: [0.0, 0.03, 1.0, 1.0] });
    const T0 = yard.EVENTS.find((e) => e.kind === "confirmed").t, T1 = 60;
    let t = calm ? recording.opened : T0, on = false, last = 0, zone = 0, shownKey = "";
    function paint() {
      const state = yard.sample(t);
      zone += ((state.actors.some((a) => a.inZone) ? 1 : 0) - zone) * 0.12;
      yard.render(ctx, state, { view: FIELD, annotations: true, zoneStrength: calm ? 1 : zone });
      const e = lastEvent(t), key = e ? e.t + e.kind : "";
      if (key !== shownKey) {
        shownKey = key;
        line.innerHTML = e && t - e.t < 9 ? "<b>" + sec(e.t) + "</b><span>" + said(e) + "</span>" : "<b>" + sec(t) + "</b><span>Quiet · nothing to report</span>";
      }
      bar.style.width = (clamp01((t - T0) / (T1 - T0)) * 100).toFixed(2) + "%";
    }
    function tick(now) {
      if (!on) return;
      requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      t += dt; if (t > T1) { t = T0; shownKey = ""; }
      paint();
    }
    paint();
    if (!calm) {
      const run = (v) => { if (v && !on) { on = true; last = performance.now(); requestAnimationFrame(tick); } else if (!v) on = false; };
      let visible = false;
      seen(canvas, (v) => { visible = v; run(v && !document.hidden); });
      document.addEventListener("visibilitychange", () => run(visible && !document.hidden));
    }
  }

  // ---------------------------------------------------------------- 01: the chain fills as it is read
  {
    const chain = $("#chain"), items = $$("li", chain);
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) e.target.classList.add("in"); });
      chain.style.setProperty("--fill", String(items.filter((n) => n.classList.contains("in")).length / items.length));
    }, { rootMargin: "0px 0px -30% 0px" });
    items.forEach((n) => io.observe(n));
  }

  // ---------------------------------------------------------------- 02: the dashboard and its scene director
  {
    const deck = $("#deck"), frame = $("#deck-frame"), chipsBox = $("#deck-scenarios"), play = $("#deck-play"), range = $("#tape-range"), nowLine = $("#tape-now");
    const tap = $("#deck-tap"), fallback = $("#deck-fallback");
    let ready = false, playing = true, userPaused = false, dragging = false, started = false, stage = 0, shownKey = "", visible = false;
    const post = (msg) => { try { frame.contentWindow.postMessage(Object.assign({ source: "sentinel-site" }, msg), "*"); } catch (e) { /* not loaded yet */ } };
    $("#deck-open").href = cfg.dashboard; $$("a", fallback).forEach((a) => { a.href = cfg.dashboard; });
    const chips = yard.SCENARIOS.map((s) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.textContent = s.label; b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => { post({ type: "scenario", id: s.id }); post({ type: "play" }); userPaused = false; setPlaying(true); showTime(s.t); });
      chipsBox.appendChild(b);
      return { s, b };
    });
    // the tape: who is in the frame when, and each scripted event
    {
      const spans = $("#tape-spans"), L = yard.LOOP_S, open = {};
      const bar = (a, b, cls) => { const i = document.createElement("i"); if (cls) i.className = cls; i.style.left = (a / L) * 100 + "%"; i.style.width = ((b - a) / L) * 100 + "%"; spans.appendChild(i); };
      for (const e of EVENTS) {
        if (e.kind === "enter" || e.kind === "stall_start") open[e.actor || "stall"] = e.t;
        if (e.kind === "leave") bar(open[e.actor], e.t);
        if (e.kind === "stall_end") bar(open.stall, e.t, "stall");
        const m = document.createElement("b"); m.style.left = (e.t / L) * 100 + "%"; spans.appendChild(m);
      }
      range.max = String(L);
    }
    function setPlaying(v) {
      playing = v;
      play.setAttribute("aria-pressed", String(v)); play.setAttribute("aria-label", v ? "Pause the scene" : "Play the scene");
      play.firstElementChild.className = v ? "ico-pause" : "ico-play"; play.lastElementChild.textContent = v ? "Pause" : "Play";
    }
    function showTime(t) {
      if (!dragging) range.value = String(t);
      const e = lastEvent(t), key = (e ? e.t + e.kind : "") + "|" + Math.floor(t);
      if (key !== shownKey) {
        shownKey = key;
        nowLine.innerHTML = "<b>" + sec(t) + "</b><span>" + (e && t - e.t < 12 ? said(e) : "Quiet · nothing in the frame") + "</span>";
        range.setAttribute("aria-valuetext", t.toFixed(0) + " seconds. " + (e ? said(e) : ""));
      }
      let current = null;
      for (const c of chips) if (c.s.t <= t + 0.6) current = c;
      chips.forEach((c) => c.b.setAttribute("aria-pressed", String(c === current)));
    }
    play.addEventListener("click", () => { userPaused = playing; setPlaying(!playing); post({ type: playing ? "play" : "pause" }); });
    $$("#deck-theme button").forEach((b) => b.addEventListener("click", () => {
      $$("#deck-theme button").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
      post({ type: "theme", value: b.dataset.theme });
    }));
    range.addEventListener("input", () => { dragging = true; post({ type: "seek", t: Number(range.value) }); showTime(Number(range.value)); });
    const release = () => { dragging = false; };
    range.addEventListener("change", release); range.addEventListener("pointerup", release); range.addEventListener("blur", release);
    window.addEventListener("message", (ev) => {
      const d = ev.data;
      if (!d || d.source !== "sentinel-dashboard" || ev.source !== frame.contentWindow) return;
      if (d.type === "ready") {
        if (ready) return;                      // the dashboard answers every hello with a ready: once is enough
        ready = true; deck.dataset.state = "live";
        post({ type: "embed", value: true }); post({ type: "theme", value: "dark" });
        if (!visible || userPaused) post({ type: "pause" });
      } else if (d.type === "tick") {
        if (typeof d.playing === "boolean" && d.playing !== playing && visible) setPlaying(d.playing);
        if (typeof d.t === "number") showTime(d.t);
      }
    });
    frame.addEventListener("load", () => { if (!ready) post({ type: "hello" }); });   // in case its first ready came before this page listened
    function attempt() {  // an embedded page first; the same page inlined second; a still picture last
      stage += 1;
      if (ready) return;
      if (stage === 1) { frame.src = cfg.dashboard; setTimeout(attempt, 5000); }
      else if (stage === 2) {
        fetch(cfg.dashboard).then((r) => (r.ok ? r.text() : Promise.reject(new Error("unavailable")))).then((html) => { if (!ready) { frame.removeAttribute("src"); frame.srcdoc = html; } }).catch(() => {});
        setTimeout(attempt, 5000);
      } else { deck.dataset.state = "fallback"; fallback.hidden = false; $("#deck-poster").src = cfg.posters + "dashboard.jpg"; frame.hidden = true; tap.hidden = true; }
    }
    seen(deck, (v) => { if (v && !started) { started = true; attempt(); } }, { rootMargin: "900px 0px" });
    seen($(".deck-window"), (v) => {
      visible = v;
      if (ready) post({ type: v && !userPaused ? "play" : "pause" });
      if (!v && coarse) tap.hidden = false;
    }, { threshold: 0.05 });
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (coarse) { tap.hidden = false; tap.addEventListener("click", () => { tap.hidden = true; try { frame.focus(); } catch (e) { /* fine */ } }); }
    showTime(0);
  }

  // ---------------------------------------------------------------- evidence: the moment, and the record of it
  {
    const T = recording.opened, state = yard.sample(T), a = state.actors.find((actor) => actor.track === recording.track);
    yard.render(sharp($("#ev-canvas")), state, { view: yard.CAMERA, annotations: true, zoneStrength: 1 });
    const G = yard.GEOM, Y = G.YARD, P = (x, y, z) => yard.project(x, y, z).map((v) => +v.toFixed(1)).join(",");
    const path = [];
    let crossed = null;
    for (let i = 0; 6.0 + i * 0.05 <= T + 1e-6; i += 1) {
      const t = 6.0 + i * 0.05, who = yard.sample(t).actors[0];
      if (!who) continue;
      const at = { t, x: who.foot[0] * yard.W, y: who.foot[1] * yard.H };
      if (who.inZone && !crossed) crossed = at;
      if (i % 4 === 0) path.push(at);
    }
    path.push({ t: T, x: a.foot[0] * yard.W, y: a.foot[1] * yard.H });
    const svg = $("#ev-diagram"), wide = () => svg.getBoundingClientRect().width || 760;
    const fitText = () => { const k = Math.min(3, Math.max(1, 1050 / wide())); svg.style.setProperty("--k", k.toFixed(2)); svg.dataset.dense = k > 1.5 ? "1" : "0"; };
    fitText(); window.addEventListener("resize", fitText);
    const zone = yard.ZONE.polygon.map(([u, v]) => (u * yard.W).toFixed(1) + "," + (v * yard.H).toFixed(1)).join(" ");
    const end = path[path.length - 1], top = a.box[1] * yard.H;
    const beats = path.filter((p) => Math.abs(p.t - Math.round(p.t)) < 0.01 && Math.round(p.t) % 2 === 0);
    $("#ev-diagram").innerHTML = `
      <g fill="none" stroke="rgba(195,219,201,.22)" stroke-width="1">
        <polyline points="${P(Y.left, 0, G.NEAR)} ${P(Y.left, 0, Y.back)} ${P(Y.right, 0, Y.back)} ${P(Y.right, 0, G.NEAR)}"/>
        <polyline points="${P(Y.left, Y.wallH, G.NEAR)} ${P(Y.left, Y.wallH, Y.back)} ${P(Y.right, Y.wallH, Y.back)} ${P(Y.right, Y.wallH, G.NEAR)}"/>
        <line x1="${P(Y.left, 0, Y.back).split(",")[0]}" y1="${P(Y.left, 0, Y.back).split(",")[1]}" x2="${P(Y.left, Y.wallH, Y.back).split(",")[0]}" y2="${P(Y.left, Y.wallH, Y.back).split(",")[1]}"/>
        <line x1="${P(Y.right, 0, Y.back).split(",")[0]}" y1="${P(Y.right, 0, Y.back).split(",")[1]}" x2="${P(Y.right, Y.wallH, Y.back).split(",")[0]}" y2="${P(Y.right, Y.wallH, Y.back).split(",")[1]}"/>
        <polygon points="${P(G.GATE.x1, 0, Y.back)} ${P(G.GATE.x2, 0, Y.back)} ${P(G.GATE.x2, G.GATE.h, Y.back)} ${P(G.GATE.x1, G.GATE.h, Y.back)}"/>
        <polygon points="${P(Y.left, 0, G.DOOR.z1)} ${P(Y.left, 0, G.DOOR.z2)} ${P(Y.left, G.DOOR.h, G.DOOR.z2)} ${P(Y.left, G.DOOR.h, G.DOOR.z1)}"/>
      </g>
      <polygon points="${zone}" fill="rgba(180,238,208,.09)" stroke="#b4eed0" stroke-width="1.5" stroke-dasharray="9 7"/>
      <polyline points="${path.map((p) => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ")}" fill="none" stroke="#eef2ec" stroke-width="1.6"/>
      ${beats.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#080d0d" stroke="#eef2ec" stroke-width="1.2"/><text x="${(p.x + 9).toFixed(1)}" y="${(p.y - 9).toFixed(1)}" class="dg-t${Math.round(p.t) % 4 === 2 ? "" : " dg-x"}">${sec(p.t)}</text>`).join("")}
      <line x1="${end.x.toFixed(1)}" y1="${end.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${top.toFixed(1)}" stroke="#b4eed0" stroke-width="1.6"/>
      <circle cx="${end.x.toFixed(1)}" cy="${top.toFixed(1)}" r="4" fill="#b4eed0"/>
      ${crossed ? `<g stroke="#b4eed0" stroke-width="1.2" fill="none"><circle cx="${crossed.x.toFixed(1)}" cy="${crossed.y.toFixed(1)}" r="11"/><line x1="${(crossed.x - 20).toFixed(1)}" y1="${crossed.y.toFixed(1)}" x2="${(crossed.x + 20).toFixed(1)}" y2="${crossed.y.toFixed(1)}"/><line x1="${crossed.x.toFixed(1)}" y1="${(crossed.y - 20).toFixed(1)}" x2="${crossed.x.toFixed(1)}" y2="${(crossed.y + 20).toFixed(1)}"/></g>
        <text x="${(crossed.x + 30).toFixed(1)}" y="${(crossed.y + 34).toFixed(1)}" class="dg-s">CROSSING<tspan class="dg-x"> · x ${(crossed.x / yard.W).toFixed(2)} · y ${(crossed.y / yard.H).toFixed(2)}</tspan></text>` : ""}
      <text x="${(yard.ZONE.polygon[0][0] * yard.W + 16).toFixed(1)}" y="${(yard.ZONE.polygon[0][1] * yard.H + 24).toFixed(1)}" class="dg-s">ZONE A</text>
      <text x="${(end.x + 12).toFixed(1)}" y="${(top + 4).toFixed(1)}" class="dg-s">TRACK ${a.track}</text>
      <text x="24" y="40" class="dg-t dg-x">PATH OF ONE TRACK · ${sec(path[0].t)} TO ${sec(T)}</text>
      <text x="936" y="516" text-anchor="end" class="dg-t dg-x">DRAWN FROM THE SAME SCRIPT AS THE FRAME ABOVE</text>
      <style>.dg-t,.dg-s{font:500 calc(11px * var(--k, 1)) "IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;fill:#9aa7a0;letter-spacing:.08em}.dg-s{fill:#b4eed0}[data-dense="1"] .dg-x{display:none}</style>`;
    $("#ev-time").firstChild.textContent = T.toFixed(2) + " s ";
  }

  // ---------------------------------------------------------------- 03: the hardware film
  {
    const section = $("#hardware"), track = $("#film-track"), stage = $("#film-stage"), canvas = $("#film-canvas"), caps = $$("#film-caps .cap"), stepsBox = $("#film-steps");
    const playBtn = $("#film-play"), bar = $("#top-bar"), BEATS = window.SentinelFilm.BEATS;
    let film = null, beat = -1, auto = 0;
    const total = () => Math.max(1, track.offsetHeight - stage.offsetHeight);
    const top = () => track.getBoundingClientRect().top + window.scrollY;
    const progress = () => clamp01((window.scrollY - top()) / total());
    const jump = (y) => { try { window.scrollTo({ top: y, behavior: "instant" }); } catch (e) { window.scrollTo(0, y); } };
    const steps = BEATS.map((b, i) => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.setAttribute("aria-label", "Chapter " + (i + 1) + ": " + caps[i].querySelector("h3").textContent.trim());
      btn.title = caps[i].querySelector("h3").textContent.trim();
      btn.addEventListener("click", () => { stopAuto(); window.scrollTo({ top: top() + b.hold * total(), behavior: calm ? "auto" : "smooth" }); });
      btn.addEventListener("keydown", (e) => {
        const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!d) return;
        e.preventDefault(); const n = steps[Math.min(steps.length - 1, Math.max(0, i + d))]; n.focus(); n.click();
      });
      stepsBox.appendChild(btn);
      return btn;
    });
    function setBeat(i) {
      if (i === beat) return;
      beat = i; stage.dataset.beat = String(i);
      caps.forEach((c, j) => { c.classList.toggle("on", j === i); c.setAttribute("aria-hidden", String(j !== i)); });
      steps.forEach((s, j) => s.setAttribute("aria-current", String(j === i)));
    }
    const beatAt = (p) => { let i = 0; for (let j = 0; j < BEATS.length; j += 1) if (p >= BEATS[j].at - 0.012) i = j; return i; };
    function onScroll() {
      const p = progress();
      if (film) film.setProgress(p); else setBeat(beatAt(p));
      const r = track.getBoundingClientRect();
      bar.dataset.quiet = r.top < 60 && r.bottom > window.innerHeight * 0.6 ? "1" : "0";
    }
    function stopAuto() {
      if (!auto) return;
      cancelAnimationFrame(auto); auto = 0;
      playBtn.setAttribute("aria-pressed", "false"); playBtn.setAttribute("aria-label", "Play the sequence"); playBtn.firstElementChild.className = "ico-play"; playBtn.lastElementChild.textContent = "Play the sequence";
    }
    playBtn.addEventListener("click", () => {
      if (auto) return stopAuto();
      let p = progress(); if (p > 0.985) p = 0;
      const from = p, t0 = performance.now(), span = (1 - from) * 30000;
      playBtn.setAttribute("aria-pressed", "true"); playBtn.setAttribute("aria-label", "Pause the sequence"); playBtn.firstElementChild.className = "ico-pause"; playBtn.lastElementChild.textContent = "Pause";
      const step = (now) => {
        const k = clamp01((now - t0) / span);
        jump(top() + (from + (1 - from) * k) * total());
        if (k < 1) auto = requestAnimationFrame(step); else stopAuto();
      };
      auto = requestAnimationFrame(step);
    });
    ["wheel", "touchstart", "keydown"].forEach((n) => window.addEventListener(n, (e) => { if (n !== "keydown" || /^(Arrow|Page|Home|End| )/.test(e.key)) { if (!(e.target && e.target.closest && e.target.closest("#film-play"))) stopAuto(); } }, { passive: true }));
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    setBeat(0);

    function still() {  // no motion wanted, or no WebGL: the same seven beats as pictures
      section.dataset.static = "1";
      const list = $("#film-static"); list.hidden = false;
      const head = document.createElement("p"); head.className = "kicker mono film-static-h"; head.textContent = "03 — The hardware · shown as stills"; list.before(head);
      caps.forEach((c, i) => {
        const li = document.createElement("li"), img = document.createElement("img"), copy = c.cloneNode(true);
        img.src = cfg.posters + "film-" + (i + 1) + ".jpg"; img.alt = ""; img.loading = "lazy"; img.width = 1280; img.height = 720;
        copy.classList.add("on"); copy.removeAttribute("aria-hidden"); li.append(img, copy); list.appendChild(li);
      });
    }
    function load(src) { return new Promise((ok, no) => { if (window.THREE) return ok(); const s = document.createElement("script"); s.src = src; s.onload = () => ok(); s.onerror = () => no(new Error("three.js did not load")); document.head.appendChild(s); }); }
    const small = () => window.matchMedia("(max-width: 760px), (max-aspect-ratio: 5/6)").matches;
    $("#film-poster").src = cfg.posters + (small() ? "film-1-m.jpg" : "film-1.jpg");
    if (calm) still();
    else {
      let begun = false;
      seen(section, (v) => {
        if (!v || begun) return;
        begun = true;
        load(cfg.three).then(() => {
          film = window.SentinelFilm.create({ THREE: window.THREE, courtyard: yard, hardware: window.SentinelHardware, canvas, overlay: $("#film-overlay"),
            quality: small() || (navigator.deviceMemory && navigator.deviceMemory <= 4) ? "low" : "high",
            trackLabel: cfg.filmTrackLabel, onFrame: (p) => setBeat(film.beatAt(p)) });
          window.sentinelFilm = film;
          film.setProgress(progress(), true); film.render();
          stage.dataset.ready = "1";
          let inView = false;
          const run = () => (inView && !document.hidden ? film.start() : film.stop());
          seen(stage, (x) => { inView = x; run(); }, { rootMargin: "10% 0px" });
          document.addEventListener("visibilitychange", run);
        }).catch(() => still());
      }, { rootMargin: "150% 0px" });
    }
    onScroll();
  }
})();
