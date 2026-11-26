/**
 * Hidden maze easter egg — click the period in "Cloutyskies.org".
 *
 * A silent, text-free, full-screen cursor maze in the spirit of the 2003
 * "Scary Maze Game": drag the real pointer through a black corridor that
 * starts wide and narrows as it winds; white walls send you back to the start
 * pad; the red pad at the end fires the scare. Nothing is said and nothing is
 * heard until then — the maze, a pulsing start ring and the goal pad only.
 */
(function () {
  "use strict";

  /* The one optional global: a debug switch, off in production. */
  window.__mazeDebug = false;

  /* ----- Design space -------------------------------------------------- */

  var DESIGN_W = 1600;
  var DESIGN_H = 900;

  /* Corridor centerlines: [x1, y1, x2, y2, width]; widths narrow 64 → 11. */
  var SEGMENTS = [
    [110, 100, 1490, 100, 64],
    [1490, 100, 1490, 240, 56],
    [1490, 240, 110, 240, 50],
    [110, 240, 110, 380, 44],
    [110, 380, 1490, 380, 38],
    [1490, 380, 1490, 520, 32],
    [1490, 520, 110, 520, 27],
    [110, 520, 110, 660, 22],
    [110, 660, 1490, 660, 17],
    [1490, 660, 1490, 800, 14],
    [1490, 800, 240, 800, 11]
  ];

  var START_X = 110;
  var START_Y = 100;
  var START_HALF = 45; /* 90x90 black start pad */
  var GOAL_X = 228;
  var GOAL_Y = 800;
  var GOAL_HALF = 13; /* 26x26 red goal pad, drawn last */

  var SCARE_MS = 2600;
  var FLICKER_MS = 70;
  var SCREAM_SECONDS = 2.2;

  /* ----- State --------------------------------------------------------- */

  var overlay = null;
  var canvas = null;
  var ctx = null;
  var scareImg = null;
  var maze = null; /* offscreen collision canvas, exactly 1600x900 */
  var mazeCtx = null;

  var bound = false;
  var isOpen = false;
  var state = "idle"; /* "idle" | "run" | "scare" */

  var rafId = 0;
  var curX = null;
  var curY = null;
  var prevX = null;
  var prevY = null;

  var viewX = 0;
  var viewY = 0;
  var viewW = DESIGN_W;
  var viewH = DESIGN_H;
  var viewScale = 1;

  var flickerTimer = 0;
  var scareTimer = 0;

  var audioCtx = null;
  var screamEl = null;
  var shriekNodes = [];

  /* ----- Styles -------------------------------------------------------- */

  var CSS = [
    "#maze-dot { pointer-events: auto; position: relative; cursor: inherit; }",
    '#maze-dot::after { content: ""; position: absolute; inset: -8px; }',
    "html.maze-active #clouty-cursor-trail { display: none !important; }",
    "#maze-overlay { position: fixed; inset: 0; z-index: 2147483647; background: #fff;",
    "  margin: 0; padding: 0; overflow: hidden; touch-action: none;",
    "  user-select: none; -webkit-user-select: none;",
    "  -webkit-tap-highlight-color: transparent; cursor: default !important; }",
    "#maze-overlay.maze-scare-on { background: #000; }",
    "#maze-overlay, #maze-overlay * { cursor: default !important; }",
    "#maze-canvas { position: absolute; inset: 0; width: 100%; height: 100%;",
    "  display: block; background: #fff; }",
    "#maze-scare { position: absolute; inset: 0; width: 100%; height: 100%;",
    "  object-fit: cover; display: none; }",
    "#maze-scare.maze-visible { display: block; }",
    "#maze-scare.maze-shake { animation: maze-shake 560ms steps(1, end) infinite; }",
    "@keyframes maze-shake {",
    "  0% { transform: translate(-6px, 6px) scale(1); }",
    "  13% { transform: translate(6px, -6px) scale(1.02); }",
    "  26% { transform: translate(-6px, -6px) scale(1.03); }",
    "  39% { transform: translate(6px, 6px) scale(1.045); }",
    "  52% { transform: translate(-6px, 4px) scale(1.05); }",
    "  65% { transform: translate(6px, -4px) scale(1.06); }",
    "  78% { transform: translate(-4px, 6px) scale(1.06); }",
    "  91% { transform: translate(4px, -6px) scale(1.06); }",
    "  100% { transform: translate(-6px, 4px) scale(1.06); }",
    "}"
  ].join("\n");

  function injectCss() {
    var old = document.getElementById("maze-style");
    if (old) return;
    var style = document.createElement("style");
    style.id = "maze-style";
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  /* ----- Collision canvas ---------------------------------------------- */

  function buildMaze() {
    if (maze) return;
    maze = document.createElement("canvas");
    maze.width = DESIGN_W;
    maze.height = DESIGN_H;
    mazeCtx = maze.getContext("2d", { willReadFrequently: true });

    /* Order matters: white walls, black corridor, black pad, red goal. */
    mazeCtx.fillStyle = "#ffffff";
    mazeCtx.fillRect(0, 0, DESIGN_W, DESIGN_H);

    mazeCtx.fillStyle = "#000000";
    for (var i = 0; i < SEGMENTS.length; i++) {
      var s = SEGMENTS[i];
      var half = s[4] / 2;
      var left = Math.round(Math.min(s[0], s[2]) - half);
      var top = Math.round(Math.min(s[1], s[3]) - half);
      var right = Math.round(Math.max(s[0], s[2]) + half);
      var bottom = Math.round(Math.max(s[1], s[3]) + half);
      mazeCtx.fillRect(left, top, right - left, bottom - top);
    }

    mazeCtx.fillRect(
      START_X - START_HALF,
      START_Y - START_HALF,
      START_HALF * 2,
      START_HALF * 2
    );

    mazeCtx.fillStyle = "#ff0000";
    mazeCtx.fillRect(
      GOAL_X - GOAL_HALF,
      GOAL_Y - GOAL_HALF,
      GOAL_HALF * 2,
      GOAL_HALF * 2
    );
  }

  /* Pointer outside the design rect counts as wall; bounds are inclusive
     inside and exclusive outside, so the sampled pixel always exists. */
  function classify(x, y) {
    if (typeof x !== "number" || typeof y !== "number") return "wall";
    if (!isFinite(x) || !isFinite(y)) return "wall";
    if (x < 0 || y < 0 || x >= DESIGN_W || y >= DESIGN_H) return "wall";
    var px = Math.round(x);
    var py = Math.round(y);
    if (px < 0) px = 0;
    if (py < 0) py = 0;
    if (px > DESIGN_W - 1) px = DESIGN_W - 1;
    if (py > DESIGN_H - 1) py = DESIGN_H - 1;
    var data = mazeCtx.getImageData(px, py, 1, 1).data;
    var r = data[0];
    var g = data[1];
    var b = data[2];
    if (r > 200 && g > 200 && b > 200) return "wall";
    if (r > 150 && g < 80 && b < 80) return "goal";
    return "safe";
  }

  /* Sweep the straight line a → b in ≤2 virtual px steps so a fast flick
     cannot hop across a wall. Returns "wall", "goal" or "". */
  function sweepHit(ax, ay, bx, by) {
    var dx = bx - ax;
    var dy = by - ay;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var steps = Math.ceil(dist / 2);
    if (!isFinite(steps) || steps < 1) steps = 1;
    if (steps > 200) steps = 200;
    for (var i = 1; i <= steps; i++) {
      var t = i / steps;
      var kind = classify(ax + dx * t, ay + dy * t);
      if (kind !== "safe") return kind;
    }
    return "";
  }

  /* ----- Viewport mapping ---------------------------------------------- */

  function updateViewport() {
    var vw = window.innerWidth || DESIGN_W;
    var vh = window.innerHeight || DESIGN_H;
    var scale = Math.min(vw / DESIGN_W, vh / DESIGN_H);
    if (!isFinite(scale) || scale <= 0) scale = 1;
    viewScale = scale;
    viewW = DESIGN_W * scale;
    viewH = DESIGN_H * scale;
    viewX = (vw - viewW) / 2;
    viewY = (vh - viewH) / 2;
  }

  function toVirtual(clientX, clientY) {
    var scale = viewScale || 1;
    return {
      x: (clientX - viewX) / scale,
      y: (clientY - viewY) / scale
    };
  }

  /* ----- Render -------------------------------------------------------- */

  function draw() {
    if (!canvas || !ctx) return;
    var dpr = window.devicePixelRatio || 1;
    if (!isFinite(dpr) || dpr <= 0) dpr = 1;
    var vw = window.innerWidth || DESIGN_W;
    var vh = window.innerHeight || DESIGN_H;
    var cw = Math.max(1, Math.round(vw * dpr));
    var ch = Math.max(1, Math.round(vh * dpr));

    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    updateViewport();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, vw, vh);

    if (maze) {
      ctx.drawImage(maze, viewX, viewY, viewW, viewH);
    }

    if (state === "idle") drawRing();
  }

  /* The only affordance: a ring pulsing on the start pad, visible canvas
     only — never on the collision canvas. */
  function drawRing() {
    var now =
      window.performance && window.performance.now
        ? window.performance.now()
        : Date.now();
    var k = 0.5 + 0.5 * Math.sin((now / 1200) * Math.PI * 2);
    var v = Math.round(51 + 51 * k);
    var cx = viewX + START_X * viewScale;
    var cy = viewY + START_Y * viewScale;

    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgb(" + v + "," + v + "," + v + ")";
    ctx.stroke();
  }

  /* ----- Game loop ----------------------------------------------------- */

  function tick() {
    rafId = window.requestAnimationFrame(tick);
    if (!isOpen) return;
    if (state === "scare") return;
    draw();
    processPointer();
  }

  function isOnStartPad(x, y) {
    return (
      x >= START_X - START_HALF &&
      x <= START_X + START_HALF &&
      y >= START_Y - START_HALF &&
      y <= START_Y + START_HALF
    );
  }

  function processPointer() {
    if (!isOpen || state === "scare") return;
    if (curX === null || curY === null) return;

    if (state === "idle") {
      if (isOnStartPad(curX, curY)) beginRun();
      prevX = curX;
      prevY = curY;
      return;
    }

    var fromX = prevX === null ? curX : prevX;
    var fromY = prevY === null ? curY : prevY;
    prevX = curX;
    prevY = curY;

    var hit = sweepHit(fromX, fromY, curX, curY);
    if (!hit) return;
    if (hit === "goal") triggerScare();
    else failRun();
  }

  function beginRun() {
    state = "run";
  }

  function failRun() {
    if (state !== "run") return;
    state = "idle";
    flicker();
  }

  function flicker() {
    if (!canvas) return;
    if (flickerTimer) {
      window.clearTimeout(flickerTimer);
      flickerTimer = 0;
    }
    canvas.style.filter = "brightness(0.5)";
    flickerTimer = window.setTimeout(function () {
      flickerTimer = 0;
      if (canvas) canvas.style.filter = "";
    }, FLICKER_MS);
  }

  /* ----- Pointer input ------------------------------------------------- */

  function onPointerEvent(e) {
    if (!isOpen) return;
    if (e.isPrimary === false) return;
    if (typeof e.clientX !== "number" || typeof e.clientY !== "number") return;

    updateViewport();
    var p = toVirtual(e.clientX, e.clientY);
    curX = p.x;
    curY = p.y;

    if (state === "scare") {
      prevX = curX;
      prevY = curY;
      return;
    }

    processPointer();
  }

  function onPointerLeave() {
    if (!isOpen) return;
    if (state === "scare") return;
    if (state === "run") state = "idle";
    curX = null;
    curY = null;
    prevX = null;
    prevY = null;
  }

  /* ----- Scare --------------------------------------------------------- */

  function triggerScare() {
    if (!isOpen || state === "scare") return;
    state = "scare";
    prevX = curX;
    prevY = curY;

    if (canvas) canvas.style.display = "none";
    if (overlay) overlay.classList.add("maze-scare-on");
    if (scareImg) {
      scareImg.classList.add("maze-visible");
      scareImg.classList.add("maze-shake");
    }

    playScream();

    if (scareTimer) window.clearTimeout(scareTimer);
    scareTimer = window.setTimeout(endScare, SCARE_MS);
  }

  function endScare() {
    if (scareTimer) {
      window.clearTimeout(scareTimer);
      scareTimer = 0;
    }
    stopScream();
    closeGame();
    exitFullscreen();
  }

  /* ----- Open / close -------------------------------------------------- */

  function buildOverlay() {
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.id = "maze-overlay";

    canvas = document.createElement("canvas");
    canvas.id = "maze-canvas";
    ctx = canvas.getContext("2d");

    scareImg = document.createElement("img");
    scareImg.id = "maze-scare";
    scareImg.alt = "";
    scareImg.setAttribute("aria-hidden", "true");
    scareImg.draggable = false;
    scareImg.addEventListener("error", function () {
      if (scareImg.getAttribute("src") === "horrid.png") return;
      scareImg.setAttribute("src", "horrid.png");
    });

    overlay.appendChild(canvas);
    overlay.appendChild(scareImg);
    overlay.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });
    document.body.appendChild(overlay);

    buildMaze();
  }

  function openGame() {
    if (isOpen) return;
    injectCss();
    buildOverlay();

    isOpen = true;
    state = "idle";
    curX = null;
    curY = null;
    prevX = null;
    prevY = null;

    overlay.style.display = "block";
    overlay.classList.remove("maze-scare-on");
    if (canvas) {
      canvas.style.display = "block";
      canvas.style.filter = "";
    }
    if (scareImg) {
      scareImg.classList.remove("maze-visible");
      scareImg.classList.remove("maze-shake");
    }
    document.documentElement.classList.add("maze-active");

    updateViewport();

    requestFullscreen(overlay);
    preloadScare();
    armAudio();

    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = window.requestAnimationFrame(tick);
  }

  function closeGame() {
    isOpen = false;
    state = "idle";

    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (flickerTimer) {
      window.clearTimeout(flickerTimer);
      flickerTimer = 0;
    }

    document.documentElement.classList.remove("maze-active");

    if (canvas) {
      canvas.style.filter = "";
      canvas.style.display = "block";
    }
    if (scareImg) {
      scareImg.classList.remove("maze-visible");
      scareImg.classList.remove("maze-shake");
    }
    if (overlay) {
      overlay.classList.remove("maze-scare-on");
      overlay.style.display = "none";
    }

    curX = null;
    curY = null;
    prevX = null;
    prevY = null;
  }

  /* ----- Fullscreen ---------------------------------------------------- */

  function requestFullscreen(el) {
    if (!el) return;
    try {
      if (el.requestFullscreen) {
        var p = el.requestFullscreen({ navigationUI: "hide" });
        if (p && typeof p.catch === "function") p.catch(function () {});
        return;
      }
      if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
        return;
      }
      if (el.msRequestFullscreen) el.msRequestFullscreen();
    } catch (e) {
      /* iOS Safari has no element fullscreen: the fixed overlay stands in. */
    }
  }

  function exitFullscreen() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        var p = document.exitFullscreen();
        if (p && typeof p.catch === "function") p.catch(function () {});
        return;
      }
      if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    } catch (e) {}
  }

  function onFullscreenChange() {
    if (!isOpen) return;
    var fs =
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement ||
      null;
    if (fs) return;
    if (state === "scare") return; /* the scare must not be skippable */
    closeGame();
  }

  function onKeyDown(e) {
    if (!isOpen) return;
    if (e.key !== "Escape" && e.key !== "Esc") return;
    if (state === "scare") return;
    closeGame();
    exitFullscreen();
  }

  function onResize() {
    if (!isOpen) return;
    updateViewport();
    if (state !== "scare") draw();
  }

  /* ----- Audio: file first, synth shriek as the always-there fallback ---- */

  function preloadScare() {
    if (!scareImg) return;
    if (scareImg.getAttribute("src") !== "scare.png") {
      scareImg.setAttribute("src", "scare.png");
    }
    try {
      var warm = new Image();
      warm.src = "scare.png";
    } catch (e) {}
  }

  function armAudio() {
    if (!screamEl) {
      try {
        screamEl = new Audio();
        screamEl.preload = "auto";
        screamEl.volume = 1;
        screamEl.src = "scream.mp3";
        screamEl.load();
      } catch (e) {
        screamEl = null;
      }
    }

    if (screamEl) {
      try {
        screamEl.muted = true;
        var p = screamEl.play();
        if (p && typeof p.then === "function") {
          p.then(finishMutedUnlock).catch(function () {
            if (screamEl) screamEl.muted = false;
          });
        } else {
          finishMutedUnlock();
        }
      } catch (e) {
        if (screamEl) screamEl.muted = false;
      }
    }

    /* Unlock Web Audio inside the same gesture, for the synth fallback. */
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        if (!audioCtx) audioCtx = new AC();
        if (audioCtx.state === "suspended") {
          var r = audioCtx.resume();
          if (r && typeof r.catch === "function") r.catch(function () {});
        }
      }
    } catch (e) {}
  }

  function finishMutedUnlock() {
    if (!screamEl) return;
    if (state === "scare") return;
    try {
      screamEl.pause();
      screamEl.currentTime = 0;
      screamEl.muted = false;
    } catch (e) {}
  }

  function playScream() {
    var started = false;
    if (screamEl) {
      try {
        screamEl.muted = false;
        screamEl.volume = 1;
        screamEl.currentTime = 0;
        var p = screamEl.play();
        if (p && typeof p.then === "function") {
          p.catch(function () {
            startSynthShriek();
          });
        }
        started = true;
      } catch (e) {
        started = false;
      }
    }
    if (!started) startSynthShriek();
  }

  function stopScream() {
    if (screamEl) {
      try {
        screamEl.pause();
        screamEl.currentTime = 0;
      } catch (e) {}
    }
    for (var i = 0; i < shriekNodes.length; i++) {
      var n = shriekNodes[i];
      try {
        if (n && typeof n.stop === "function") n.stop(0);
      } catch (e) {}
      try {
        if (n && typeof n.disconnect === "function") n.disconnect();
      } catch (e) {}
    }
    shriekNodes = [];
  }

  function hardClipCurve() {
    var n = 2048;
    var curve = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      var y = x * 3.2;
      curve[i] = y > 1 ? 1 : y < -1 ? -1 : y;
    }
    return curve;
  }

  function startSynthShriek() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      if (!audioCtx) audioCtx = new AC();
    } catch (e) {
      return;
    }

    var ac = audioCtx;
    try {
      if (ac.state === "suspended") {
        var r = ac.resume();
        if (r && typeof r.catch === "function") r.catch(function () {});
      }
    } catch (e) {}

    var t0 = ac.currentTime + 0.01;
    var endT = t0 + SCREAM_SECONDS;

    var master = ac.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.linearRampToValueAtTime(0.9, t0 + 0.005);
    master.gain.setValueAtTime(0.9, Math.max(t0 + 0.006, endT - 0.5));
    master.gain.linearRampToValueAtTime(0.0001, endT);

    var shaper = ac.createWaveShaper();
    shaper.curve = hardClipCurve();
    shaper.oversample = "4x";
    shaper.connect(master);
    master.connect(ac.destination);
    shriekNodes.push(master, shaper);

    function sawSweep(f0, f1, level) {
      var osc = ac.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(f0, t0);
      osc.frequency.exponentialRampToValueAtTime(f1, t0 + 0.4);

      var lfo = ac.createOscillator();
      lfo.type = "sine";
      lfo.frequency.setValueAtTime(28, t0);
      var depth = ac.createGain();
      depth.gain.setValueAtTime(180, t0);
      lfo.connect(depth);
      depth.connect(osc.frequency);

      var g = ac.createGain();
      g.gain.setValueAtTime(level, t0);
      osc.connect(g);
      g.connect(shaper);

      osc.start(t0);
      osc.stop(endT);
      lfo.start(t0);
      lfo.stop(endT);
      shriekNodes.push(osc, lfo, depth, g);
    }

    sawSweep(600, 1500, 0.45);
    sawSweep(650, 1620, 0.4);

    var frames = Math.max(1, Math.floor(ac.sampleRate * SCREAM_SECONDS));
    var buffer = ac.createBuffer(1, frames, ac.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

    var noise = ac.createBufferSource();
    noise.buffer = buffer;

    var band = ac.createBiquadFilter();
    band.type = "bandpass";
    band.Q.setValueAtTime(1.1, t0);
    band.frequency.setValueAtTime(800, t0);
    band.frequency.exponentialRampToValueAtTime(3200, endT - 0.05);

    var noiseGain = ac.createGain();
    noiseGain.gain.setValueAtTime(0.55, t0);

    noise.connect(band);
    band.connect(noiseGain);
    noiseGain.connect(shaper);
    noise.start(t0);
    noise.stop(endT);
    shriekNodes.push(noise, band, noiseGain);
  }

  /* ----- Trigger: the period in "Cloutyskies.org" ---------------------- */

  function dotRect() {
    var dot = document.getElementById("maze-dot");
    if (!dot) return null;
    var r = dot.getBoundingClientRect();
    if (!r || !r.width || !r.height) return null;
    return r;
  }

  /* The welcome headline sits behind the shell (pointer-events:none), so a
     click on the period lands on the desktop. Match the click by position:
     the glyph's own box, padded by the same 8px as the hit area. */
  function isDotClick(e) {
    var r = dotRect();
    if (!r) return false;
    var x = e.clientX;
    var y = e.clientY;
    return (
      x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8
    );
  }

  /* Only empty desktop counts, so no icon, window, dialog or menu can ever
     launch the maze by being near the headline. */
  function isEmptyDesktopTarget(t) {
    if (!t || t.nodeType !== 1) return false;
    if (t === document.body || t === document.documentElement) return true;
    var id = t.id;
    return (
      id === "maze-dot" ||
      id === "wallpaper" ||
      id === "shell-desktop" ||
      id === "shell-wrap" ||
      id === "desktop"
    );
  }

  function onDocumentClick(e) {
    if (isOpen) return;
    if (e.button > 0) return;
    if (!isEmptyDesktopTarget(e.target)) return;
    if (!isDotClick(e)) return;
    e.preventDefault();
    e.stopPropagation();
    openGame();
  }

  function onDotClick(e) {
    if (isOpen) return;
    e.preventDefault();
    e.stopPropagation();
    openGame();
  }

  function bind() {
    if (bound) return;
    bound = true;

    var dot = document.getElementById("maze-dot");
    if (dot) dot.addEventListener("click", onDotClick);

    document.addEventListener("click", onDocumentClick, true);
    document.addEventListener("pointermove", onPointerEvent, { passive: true });
    document.addEventListener("pointerdown", onPointerEvent, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    document.addEventListener("MSFullscreenChange", onFullscreenChange);
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });
    window.addEventListener("blur", onPointerLeave);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
