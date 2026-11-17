/* Site-only replay of the synthetic incident in dashboard.html. The recording's
   opening observation spans source frames 212 through 227 at 15 fps. */
(() => {
  "use strict";
  const yard = window.SentinelCourtyard;
  const recording = Object.freeze({ track: 73, entered: 212 / 15, opened: 227 / 15 });
  const start = yard.SCENARIOS.find((scene) => scene.id === "zone").t;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stills = () => reduced.matches || new URLSearchParams(location.search).get("calm") === "1";
  const stamp = (t) => t.toFixed(2) + " s";
  const dialog = document.createElement("dialog");
  dialog.className = "track-replay";
  dialog.setAttribute("aria-labelledby", "track-replay-title");
  dialog.innerHTML = `
    <div class="tr-head"><div><p class="tr-label">Camera 01 / Zone A</p><h2 id="track-replay-title">Track 73</h2></div>
      <button type="button" data-close-replay aria-label="Close replay">Close</button></div>
    <div class="tr-frame"><canvas width="960" height="540" role="img" aria-label="Illustrated courtyard. A ring at Track 73’s feet fills as the person stays inside Zone A."></canvas>
      <span class="tr-sample">Synthetic replay</span></div>
    <div class="tr-readout"><span data-phase role="status"></span><span data-dwell></span></div>
    <div class="tr-timeline" aria-hidden="true"><i></i></div>
    <dl class="tr-receipt">
      <div><dt>Track</dt><dd>73 · Zone A</dd></div><div><dt>Source time</dt><dd data-source></dd></div>
      <div><dt>Stored</dt><dd data-store></dd></div><div><dt>Snapshot</dt><dd data-snapshot></dd></div>
    </dl>
    <div class="tr-controls"><button type="button" data-play></button><span>1.0 s zone rule</span></div>`;
  document.body.append(dialog);
  const find = (selector) => dialog.querySelector(selector);
  const canvas = find("canvas"), ctx = canvas.getContext("2d");
  const phase = find("[data-phase]"), source = find("[data-source]"), dwellLabel = find("[data-dwell]");
  const store = find("[data-store]"), snapshot = find("[data-snapshot]");
  const play = find("[data-play]"), bar = find(".tr-timeline i");
  let time = start, frame = 0, earlier = 0, trigger;

  function draw() {
    const state = yard.sample(time);
    const who = state.actors.find((actor) => actor.track === recording.track);
    const dwell = Math.max(0, Math.min(1, (time - recording.entered) / (recording.opened - recording.entered)));
    const done = time >= recording.opened;
    // One crop for both layers keeps the ring on the projected ground contact.
    ctx.save();
    ctx.scale(1.36, 1.36);
    ctx.translate(-98, -65);
    yard.render(ctx, state, { view: yard.CAMERA, annotations: false, zoneStrength: time < recording.entered ? 0.4 : 1 });
    if (who) {
      const x = who.foot[0] * yard.W, y = who.foot[1] * yard.H;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, 0.47);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = time < recording.entered ? "#9eb6aa" : "#6f9382";
      ctx.beginPath(); ctx.arc(0, 0, 23, 0, Math.PI * 2); ctx.stroke();
      if (dwell > 0) {
        ctx.lineWidth = 6; ctx.strokeStyle = "#c5ffe1";
        ctx.beginPath(); ctx.arc(0, 0, 23, -Math.PI / 2, -Math.PI / 2 + dwell * Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
    const message = done ? "Incident opened" : time >= recording.entered ? "Inside Zone A" : "Approaching Zone A";
    if (phase.textContent !== message) {
      phase.textContent = message;
      store.textContent = done ? "Local SQLite" : "Awaiting rule";
      snapshot.textContent = done ? "No snapshot saved" : "—";
    }
    source.textContent = stamp(time);
    dwellLabel.textContent = dwell.toFixed(2) + " / 1.00 s";
    bar.style.transform = "scaleX(" + ((time - start) / (recording.opened - start)) + ")";
    play.textContent = done ? "Replay Track 73" : frame ? "Pause replay" : stills() ? "Next moment" : "Play replay";
  }
  function pause() { cancelAnimationFrame(frame); frame = 0; draw(); }
  function tick(now) {
    time = Math.min(recording.opened, time + (now - earlier) / 1000);
    earlier = now;
    frame = time < recording.opened ? requestAnimationFrame(tick) : 0;
    draw();
  }
  function run() {
    earlier = performance.now(); frame = requestAnimationFrame(tick); draw();
  }
  function open(button) {
    if (dialog.open) return;
    trigger = button; time = start;
    dialog.showModal(); dialog.scrollTop = 0;
    if (stills()) draw(); else run();
  }
  play.addEventListener("click", () => {
    if (frame) return pause();
    if (stills()) {
      time = time < recording.entered ? recording.entered : time < recording.opened ? recording.opened : start;
      draw();
    } else {
      if (time >= recording.opened) time = start;
      run();
    }
  });
  find("[data-close-replay]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    pause();
    const focus = trigger?.isConnected ? trigger : document.querySelector("[data-track-replay]") || document.querySelector("#inc-preview [data-close]");
    if (focus) focus.focus({preventScroll: true});
  });
  reduced.addEventListener("change", () => { if (dialog.open) pause(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && dialog.open) pause(); });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-track-replay]");
    if (button) open(button);
  });
  document.querySelectorAll("[data-track-replay]").forEach((button) => { button.hidden = false; });

  // The embedded application redraws its selection after each status refresh.
  // Enhance only the recorded loop incident, leaving historical selections intact.
  function enhanceDashboard(pane, matchesRecording) {
    function update() {
      const link = pane.querySelector('a.button[href^="/incidents/"]');
      if (!link) return;
      const id = link.getAttribute("href").slice("/incidents/".length).split("?")[0];
      if (!matchesRecording(id)) return;
      const button = document.createElement("button");
      button.type = "button"; button.className = link.className; button.dataset.trackReplay = "";
      button.textContent = "Replay Track 73"; link.replaceWith(button);
    }
    new MutationObserver(update).observe(pane, {childList: true});
    update();
  }
  window.SentinelTrackReplay = { recording, enhanceDashboard };
})();
