/**
 * Hidden easter egg — click the period in "Cloutyskies.org".
 *
 * A cute three-level stickman platformer that ends in a jump scare: a pastel
 * sky, party-hat spikes, a music-box loop, and a gift box waiting at the end
 * of level three. The trigger stays the period in the welcome headline.
 */
(function () {
  "use strict";

  /* The one optional global: a debug switch, off in production. */
  window.__mazeDebug = false;

  /* ----- Design space -------------------------------------------------- */

  var VW = 960;
  var VH = 540;
  var T = 40;
  var ROWS = 13;
  var LEVEL_H = ROWS * T;
  var OFFSET_Y = (VH - LEVEL_H) / 2;

  /* ----- Physics: the maps were simulated with exactly these values ---- */

  var GRAVITY = 2400;
  var JUMP_V = -820;
  var RUN_SPEED = 330;
  var ACCEL_GROUND = 2600;
  var ACCEL_AIR = 1800;
  var FALL_CAP = 1300;
  var COYOTE = 0.09;
  var JUMP_BUFFER = 0.12;
  var JUMP_CUT = 0.4;

  var PW = 22;
  var PH = 34;

  var FIXED_DT = 1 / 60;
  var MAX_STEPS = 5;

  var SCARE_MS = 2600;
  var SHOW_LEVEL_TOASTS = true;

  /* ----- Levels -------------------------------------------------------- */

  var LEVELS = [
    {
      width: 64,
      rows: [
        "................................................................",
        "................................................................",
        "................................................................",
        "................................................................",
        "................................................................",
        "................................................................",
        "................................................................",
        "................................................................",
        "................................................................",
        "................................................................",
        "................................................................",
        "..P.........^....................^.....................^.....F..",
        "######################..####################...#################"
      ]
    },
    {
      width: 80,
      rows: [
        "................................................................................",
        "................................................................................",
        "................................................................................",
        "................................................................................",
        "................................................................................",
        "................................................................................",
        "................................................................................",
        "................................................................................",
        "................................................................................",
        "................................................................................",
        ".............................................................................F..",
        "..P.......^^......^...........^^^....####......C.......^^.............^^^.######",
        "######################...#######################....##########....##############"
      ]
    },
    {
      width: 96,
      rows: [
        "................................................................................................",
        "................................................................................................",
        "................................................................................................",
        "................................................................................................",
        "................................................................................................",
        "................................................................................................",
        "................................................................................................",
        "................................................................................................",
        "................................................................................................",
        ".............................................^..................................................",
        "............................................#####..........##...............................F...",
        "..P.....^^^......^^^.......##.........^^^...#####......C...##.........^^^....^^^....############",
        "########################...#############################...#####################################"
      ]
    }
  ];

  /* ----- State --------------------------------------------------------- */

  var overlay = null;
  var canvas = null;
  var ctx = null;
  var scareImg = null;
  var toastEl = null;
  var touchEl = null;
  var btnLeft = null;
  var btnRight = null;
  var btnJump = null;

  var bound = false;
  var isOpen = false;
  var paused = false;
  var isTouch = false;

  var rafId = 0;
  var lastTime = 0;
  var acc = 0;
  var time = 0;

  var level = 0;
  var tiles = [];
  var cols = 0;
  var worldW = 0;
  var spawnX = 0;
  var spawnY = 0;
  var checkpoint = null;

  var cameraX = 0;
  var state = "play";
  var deadT = 0;
  var clearT = 0;
  var fadeT = 0;
  var fade = 0;

  var particles = [];
  var keys = { left: false, right: false, jumpHeld: false };
  var jumpBuf = 0;
  var coyote = 0;
  var jumpCut = false;

  var toastTimer = 0;
  var scareTimer = 0;

  var player = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    onGround: false,
    face: 1,
    animT: 0,
    blink: 2.4,
    squash: 0
  };

  var clouds = [];
  var cloudsBuilt = false;

  /* ----- Audio state --------------------------------------------------- */

  var audioCtx = null;
  var screamEl = null;
  var screamNodes = [];
  var musicMaster = null;
  var musicFilter = null;
  var musicOn = false;
  var musicStep = 0;
  var musicNext = 0;
  var musicTimer = 0;
  var noiseCache = null;

  var C5 = 523.25;
  var D5 = 587.33;
  var E5 = 659.25;
  var G5 = 783.99;
  var A5 = 880;
  var C6 = 1046.5;
  var C3 = 130.81;
  var G2 = 98.0;
  var A2 = 110.0;
  var F2 = 87.31;

  var MELODY = [E5, G5, A5, G5, E5, D5, C5, D5, E5, G5, A5, C6, A5, G5, E5, 0];
  var BASS_NOTES = [C3, G2, A2, F2];
  var STEP_DUR = 0.3125;

  /* ----- Styles -------------------------------------------------------- */

  var CSS = [
    "#maze-dot { pointer-events: auto; position: relative; cursor: inherit; }",
    '#maze-dot::after { content: ""; position: absolute; inset: -8px; }',
    "html.maze-active #clouty-cursor-trail { display: none !important; }",
    "#maze-overlay { position: fixed; inset: 0; z-index: 2147483647; background: #aee7ff;",
    "  margin: 0; padding: 0; overflow: hidden; touch-action: none;",
    "  overscroll-behavior: none; user-select: none; -webkit-user-select: none;",
    "  -webkit-tap-highlight-color: transparent; cursor: none !important; }",
    "#maze-overlay.maze-scare-on { background: #000; }",
    "#maze-overlay * { cursor: none !important; }",
    "#maze-canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }",
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
    "}",
    "@keyframes maze-shake-soft {",
    "  0% { transform: translate(-2px, 2px) scale(1); }",
    "  25% { transform: translate(2px, -2px) scale(1.01); }",
    "  50% { transform: translate(-2px, -2px) scale(1.02); }",
    "  75% { transform: translate(2px, 2px) scale(1.03); }",
    "  100% { transform: translate(-2px, 2px) scale(1.03); }",
    "}",
    "@media (prefers-reduced-motion: reduce) {",
    "  #maze-scare.maze-shake { animation: maze-shake-soft 700ms steps(1, end) infinite; }",
    "}",
    "#maze-toast { position: absolute; left: 0; right: 0;",
    "  top: calc(18px + env(safe-area-inset-top)); text-align: center;",
    "  font-family: \"Comic Sans MS\", \"Chalkboard SE\", \"Baloo 2\", cursive;",
    "  font-size: 22px; line-height: 1.2; color: #4a4a68;",
    "  text-shadow: 0 2px 0 rgba(255, 255, 255, 0.9);",
    "  opacity: 0; transition: opacity 260ms ease; pointer-events: none; }",
    "#maze-toast.maze-toast-on { opacity: 1; }",
    "#maze-touch { position: absolute; inset: 0; pointer-events: none; display: none; }",
    "#maze-touch.maze-touch-on { display: block; }",
    ".maze-btn { position: absolute; display: flex; align-items: center;",
    "  justify-content: center; box-sizing: border-box; width: 72px; height: 72px;",
    "  border-radius: 50%; background: rgba(255, 255, 255, 0.55);",
    "  border: 2px solid #cfe9ff; box-shadow: 0 4px 10px rgba(74, 74, 104, 0.18);",
    "  color: #4a4a68; font: 700 24px/1 \"Comic Sans MS\", \"Chalkboard SE\", cursive;",
    "  pointer-events: auto; touch-action: none; user-select: none;",
    "  -webkit-user-select: none; transition: transform 90ms ease; }",
    ".maze-btn.maze-down { transform: scale(0.92); }",
    "#maze-left { left: calc(16px + env(safe-area-inset-left));",
    "  bottom: calc(16px + env(safe-area-inset-bottom)); }",
    "#maze-right { left: calc(100px + env(safe-area-inset-left));",
    "  bottom: calc(16px + env(safe-area-inset-bottom)); }",
    "#maze-jump { right: calc(16px + env(safe-area-inset-right));",
    "  bottom: calc(16px + env(safe-area-inset-bottom)); width: 88px; height: 88px; }"
  ].join("\n");

  function injectCss() {
    if (document.getElementById("maze-style")) return;
    var style = document.createElement("style");
    style.id = "maze-style";
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  /* ----- Small helpers ------------------------------------------------- */

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2(a, b) {
    var h = ((a + 1) * 73856093) ^ ((b + 1) * 19349663);
    h = (h ^ (h >>> 13)) >>> 0;
    return h;
  }

  function clampNum(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  function line(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /* ----- Overlay ------------------------------------------------------- */

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

    toastEl = document.createElement("div");
    toastEl.id = "maze-toast";

    touchEl = document.createElement("div");
    touchEl.id = "maze-touch";
    btnLeft = makeButton("maze-left", "\u25C0");
    btnRight = makeButton("maze-right", "\u25B6");
    btnJump = makeButton("maze-jump", "\u25B2");
    touchEl.appendChild(btnLeft);
    touchEl.appendChild(btnRight);
    touchEl.appendChild(btnJump);

    overlay.appendChild(canvas);
    overlay.appendChild(scareImg);
    overlay.appendChild(toastEl);
    overlay.appendChild(touchEl);
    overlay.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });

    document.body.appendChild(overlay);

    bindButton(btnLeft, function () {
      keys.left = true;
    }, function () {
      keys.left = false;
    });
    bindButton(btnRight, function () {
      keys.right = true;
    }, function () {
      keys.right = false;
    });
    bindButton(btnJump, function () {
      keys.jumpHeld = true;
      jumpBuf = JUMP_BUFFER;
    }, function () {
      keys.jumpHeld = false;
    });

    canvas.addEventListener("pointerdown", function (e) {
      if (!isOpen || state !== "play") return;
      if (e.pointerType === "mouse" && e.button > 0) return;
      e.preventDefault();
      keys.jumpHeld = true;
      jumpBuf = JUMP_BUFFER;
    });
    canvas.addEventListener("pointerup", function () {
      keys.jumpHeld = false;
    });
    canvas.addEventListener("pointercancel", function () {
      keys.jumpHeld = false;
    });
  }

  function makeButton(id, glyph) {
    var b = document.createElement("div");
    b.id = id;
    b.className = "maze-btn";
    b.setAttribute("role", "button");
    b.textContent = glyph;
    return b;
  }

  function bindButton(el, down, up) {
    if (!el) return;
    var pid = null;

    el.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      e.stopPropagation();
      pid = e.pointerId;
      el.classList.add("maze-down");
      try {
        el.setPointerCapture(e.pointerId);
      } catch (err) {}
      down();
    });

    function release(e) {
      if (pid !== null && e.pointerId !== undefined && e.pointerId !== pid) return;
      pid = null;
      el.classList.remove("maze-down");
      try {
        if (e.pointerId !== undefined) el.releasePointerCapture(e.pointerId);
      } catch (err) {}
      up();
    }

    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("pointerleave", release);
  }

  function resetButtons() {
    var list = [btnLeft, btnRight, btnJump];
    for (var i = 0; i < list.length; i++) {
      if (!list[i]) continue;
      list[i].classList.remove("maze-down");
    }
  }

  /* ----- Level loading ------------------------------------------------- */

  function loadLevel(index) {
    var def = LEVELS[index];
    if (!def) return;

    if (def.rows.length !== ROWS) {
      throw new Error("Maze egg: level " + (index + 1) + " needs " + ROWS + " rows");
    }
    for (var check = 0; check < ROWS; check++) {
      if (def.rows[check].length !== def.width) {
        throw new Error(
          "Maze egg: level " +
            (index + 1) +
            " row " +
            check +
            " is " +
            def.rows[check].length +
            " wide, expected " +
            def.width
        );
      }
    }

    level = index;
    cols = def.width;
    worldW = cols * T;
    tiles = [];

    spawnX = T + T / 2;
    spawnY = 12 * T;

    for (var r = 0; r < ROWS; r++) {
      var row = def.rows[r].split("");
      for (var c = 0; c < cols; c++) {
        if (row[c] === "P") {
          spawnX = c * T + T / 2;
          spawnY = (r + 1) * T;
        }
      }
      tiles.push(row);
    }

    checkpoint = null;
    particles.length = 0;
    deadT = 0;
    clearT = 0;
    fadeT = 0;
    fade = 0;
    jumpBuf = 0;
    coyote = 0;
    jumpCut = false;
    keys.left = false;
    keys.right = false;
    keys.jumpHeld = false;
    resetButtons();

    resetPlayer(false);
    cameraX = clampCamera(player.x - VW * 0.42);
    state = "play";

    if (SHOW_LEVEL_TOASTS) showToast("Level " + (index + 1));
  }

  function resetPlayer(atCheckpoint) {
    var x = spawnX;
    var y = spawnY;
    if (atCheckpoint && checkpoint) {
      x = checkpoint.x;
      y = checkpoint.y;
    }
    player.x = x;
    player.y = y;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.face = 1;
    player.squash = 0;
    jumpBuf = 0;
    coyote = 0;
    jumpCut = false;
    cameraX = clampCamera(x - VW * 0.42);
  }

  function clampCamera(x) {
    var maxX = Math.max(0, worldW - VW);
    return clampNum(x, 0, maxX);
  }

  function showToast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add("maze-toast-on");
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastTimer = 0;
      if (toastEl) toastEl.classList.remove("maze-toast-on");
    }, 1200);
  }

  /* ----- Collision ----------------------------------------------------- */

  function solidAt(c, r) {
    if (r < 0 || r >= ROWS) return false;
    if (c < 0 || c >= cols) return true;
    return tiles[r][c] === "#";
  }

  function grounded() {
    var left = player.x - PW / 2 + 1;
    var right = player.x + PW / 2 - 1;
    var r = Math.floor((player.y + 1) / T);
    var c0 = Math.floor(left / T);
    var c1 = Math.floor(right / T);
    for (var c = c0; c <= c1; c++) {
      if (solidAt(c, r)) return true;
    }
    return false;
  }

  function moveX(dx) {
    if (dx === 0) return;
    player.x += dx;
    var left = player.x - PW / 2;
    var right = player.x + PW / 2;
    var top = player.y - PH + 1;
    var bottom = player.y - 1;
    var r0 = Math.floor(top / T);
    var r1 = Math.floor(bottom / T);
    var c0 = Math.floor(left / T);
    var c1 = Math.floor((right - 0.0001) / T);
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        if (!solidAt(c, r)) continue;
        if (dx > 0) player.x = c * T - PW / 2 - 0.01;
        else player.x = (c + 1) * T + PW / 2 + 0.01;
        player.vx = 0;
        return;
      }
    }
  }

  function moveY(dy) {
    if (dy === 0) return;
    player.y += dy;
    var left = player.x - PW / 2 + 1;
    var right = player.x + PW / 2 - 1;
    var c0 = Math.floor(left / T);
    var c1 = Math.floor(right / T);

    if (dy > 0) {
      var r = Math.floor(player.y / T);
      for (var c = c0; c <= c1; c++) {
        if (!solidAt(c, r)) continue;
        player.y = r * T;
        player.vy = 0;
        break;
      }
    } else if (dy < 0) {
      var top = player.y - PH;
      var rt = Math.floor(top / T);
      for (var c2 = c0; c2 <= c1; c2++) {
        if (!solidAt(c2, rt)) continue;
        player.y = (rt + 1) * T + PH;
        player.vy = 0;
        break;
      }
    }

    player.onGround = grounded();
  }

  /* ----- Update -------------------------------------------------------- */

  function updatePlayer(dt) {
    var dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    var accel = player.onGround ? ACCEL_GROUND : ACCEL_AIR;

    if (dir !== 0) {
      player.vx += dir * accel * dt;
      player.vx = clampNum(player.vx, -RUN_SPEED, RUN_SPEED);
      player.face = dir;
    } else if (player.vx > 0) {
      player.vx -= accel * dt;
      if (player.vx < 0) player.vx = 0;
    } else if (player.vx < 0) {
      player.vx += accel * dt;
      if (player.vx > 0) player.vx = 0;
    }

    if (player.onGround) coyote = COYOTE;
    else if (coyote > 0) coyote -= dt;
    if (jumpBuf > 0) jumpBuf -= dt;

    if (jumpBuf > 0 && (player.onGround || coyote > 0)) {
      player.vy = JUMP_V;
      player.onGround = false;
      coyote = 0;
      jumpBuf = 0;
      jumpCut = false;
      player.squash = -0.45;
      sfxJump();
      dust(player.x, player.y, 0);
    }

    if (!keys.jumpHeld && player.vy < 0 && !jumpCut) {
      player.vy *= JUMP_CUT;
      jumpCut = true;
    }

    var wasGround = player.onGround;
    var fallSpeed = player.vy;

    player.vy += GRAVITY * dt;
    if (player.vy > FALL_CAP) player.vy = FALL_CAP;

    moveX(player.vx * dt);
    moveY(player.vy * dt);

    if (!wasGround && player.onGround && fallSpeed > 260) {
      player.squash = 0.6;
      sfxLand();
      dust(player.x, player.y, 0);
    }

    if (player.squash > 0) player.squash = Math.max(0, player.squash - dt * 4.5);
    else if (player.squash < 0) player.squash = Math.min(0, player.squash + dt * 5);
  }

  function updateCamera() {
    var target = clampCamera(player.x - VW * 0.42);
    cameraX += (target - cameraX) * 0.12;
    cameraX = clampCamera(cameraX);
  }

  function checkMarkers() {
    var left = player.x - PW / 2;
    var right = player.x + PW / 2;
    var top = player.y - PH;
    var bottom = player.y;

    var c0 = Math.max(0, Math.floor(left / T));
    var c1 = Math.min(cols - 1, Math.floor((right - 0.001) / T));
    var r0 = Math.max(0, Math.floor(top / T));
    var r1 = Math.min(ROWS - 1, Math.floor((bottom - 0.001) / T));

    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        var tile = tiles[r][c];
        if (tile === "^") {
          var sx = c * T + 9;
          var sy = r * T + 24;
          if (left < sx + 22 && right > sx && top < sy + 16 && bottom > sy) {
            die();
            return;
          }
        } else if (tile === "C") {
          if (!checkpoint || checkpoint.c !== c || checkpoint.r !== r) {
            checkpoint = {
              c: c,
              r: r,
              x: c * T + T / 2,
              y: (r + 1) * T,
              popUntil: time + 0.45
            };
            sfxCheckpoint();
          }
        } else if (tile === "F") {
          reachGoal();
          return;
        }
      }
    }
  }

  function die() {
    if (state !== "play") return;
    state = "dead";
    deadT = 0;
    poof(player.x, player.y - PH / 2);
    sfxDeath();
  }

  function reachGoal() {
    if (state !== "play") return;
    if (level < LEVELS.length - 1) {
      state = "clear";
      clearT = 0;
      sfxClear();
      return;
    }
    startScare();
  }

  /* ----- Particles ----------------------------------------------------- */

  function addParticle(x, y, vx, vy, life, size, color) {
    particles.push({
      x: x,
      y: y,
      vx: vx,
      vy: vy,
      life: life,
      max: life,
      size: size,
      color: color
    });
  }

  function poof(x, y) {
    var colors = ["#ffffff", "#ffe9a8", "#ffd0e0"];
    for (var i = 0; i < 14; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 60 + Math.random() * 150;
      addParticle(
        x,
        y,
        Math.cos(a) * sp,
        Math.sin(a) * sp - 40,
        0.5 + Math.random() * 0.35,
        2 + Math.random() * 3,
        colors[i % colors.length]
      );
    }
  }

  function dust(x, y, dir) {
    for (var i = 0; i < 4; i++) {
      addParticle(
        x + (Math.random() - 0.5) * 12,
        y - 2,
        (Math.random() - 0.5) * 50 - dir * 30,
        -20 - Math.random() * 30,
        0.28 + Math.random() * 0.22,
        1.6 + Math.random() * 2,
        "#ffffff"
      );
    }
  }

  function updateParticles(dt) {
    var out = [];
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += 420 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      out.push(p);
    }
    particles = out;
  }

  /* ----- Fixed step ---------------------------------------------------- */

  function step(dt) {
    time += dt;
    updateParticles(dt);

    if (state === "dead") {
      deadT += dt;
      if (deadT >= 0.5) {
        state = "play";
        deadT = 0;
        fade = 0;
        resetPlayer(true);
      }
      return;
    }

    if (state === "clear") {
      clearT += dt;
      fade = Math.min(1, clearT / 0.4);
      if (clearT >= 0.4) {
        loadLevel(level + 1);
        state = "fadein";
        fadeT = 0;
        fade = 1;
      }
      return;
    }

    if (state === "fadein") {
      fadeT += dt;
      fade = Math.max(0, 1 - fadeT / 0.35);
      if (fadeT >= 0.35) {
        fade = 0;
        state = "play";
      }
      return;
    }

    if (state !== "play") return;

    updatePlayer(dt);
    checkMarkers();

    if (state !== "play") return;

    updateCamera();
    player.animT += dt;
    player.blink -= dt;
    if (player.blink < -0.12) player.blink = 2.4 + Math.random() * 1.2;

    if (player.y > LEVEL_H + 60) die();
  }

  /* ----- Rendering ----------------------------------------------------- */

  function buildClouds() {
    if (cloudsBuilt) return;
    cloudsBuilt = true;
    var rnd = mulberry32(4159);
    for (var layer = 0; layer < 2; layer++) {
      var n = layer === 0 ? 7 : 5;
      for (var i = 0; i < n; i++) {
        clouds.push({
          layer: layer,
          x: rnd() * 2200,
          y: 30 + rnd() * (layer === 0 ? 130 : 200),
          s: (layer === 0 ? 0.65 : 1.05) * (0.75 + rnd() * 0.5),
          speed: layer === 0 ? 5 : 11
        });
      }
    }
  }

  function render() {
    if (!ctx || !canvas) return;

    var dpr = window.devicePixelRatio || 1;
    if (!isFinite(dpr) || dpr <= 0) dpr = 1;
    var vw = window.innerWidth || VW;
    var vh = window.innerHeight || VH;
    var cw = Math.max(1, Math.round(vw * dpr));
    var ch = Math.max(1, Math.round(vh * dpr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    var s = Math.min(vw / VW, vh / VH);
    if (!isFinite(s) || s <= 0) s = 1;
    var ox = (vw - VW * s) / 2;
    var oy = (vh - VH * s) / 2;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var sky = ctx.createLinearGradient(0, 0, 0, vh);
    sky.addColorStop(0, "#aee7ff");
    sky.addColorStop(1, "#e8fbff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, vw, vh);

    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    drawSun();
    drawClouds();

    ctx.save();
    ctx.translate(-Math.round(cameraX), OFFSET_Y);
    drawTiles();
    drawParticles();
    drawPlayer();
    ctx.restore();

    if (fade > 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = Math.min(1, fade);
      ctx.fillStyle = "#fff6fa";
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = 1;
    }
  }

  function drawSun() {
    var cx = VW - 92;
    var cy = 78;
    ctx.fillStyle = "#ffe9a8";
    ctx.beginPath();
    ctx.arc(cx, cy, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#e8c069";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx - 12, cy - 3, 6, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 12, cy - 3, 6, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + 3, 9, Math.PI * 0.18, Math.PI * 0.82);
    ctx.stroke();
  }

  function drawClouds() {
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      var par = c.layer === 0 ? 0.15 : 0.3;
      var span = VW + 400;
      var x = ((c.x - cameraX * par + time * c.speed) % span + span) % span - 200;
      drawCloud(x, c.y, c.s);
    }
  }

  function drawCloud(x, y, s) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(x, y, 22 * s, 0, Math.PI * 2);
    ctx.arc(x + 26 * s, y + 6 * s, 17 * s, 0, Math.PI * 2);
    ctx.arc(x - 26 * s, y + 7 * s, 15 * s, 0, Math.PI * 2);
    ctx.arc(x + 6 * s, y - 12 * s, 15 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTiles() {
    if (!tiles.length) return;
    var c0 = Math.max(0, Math.floor(cameraX / T) - 1);
    var c1 = Math.min(cols - 1, Math.ceil((cameraX + VW) / T) + 1);
    for (var r = 0; r < ROWS; r++) {
      var row = tiles[r];
      for (var c = c0; c <= c1; c++) {
        var tile = row[c];
        if (tile === "#") drawGrass(c, r);
        else if (tile === "^") drawSpike(c, r);
        else if (tile === "C") drawCheckpoint(c, r);
        else if (tile === "F") {
          if (level === LEVELS.length - 1) drawGift(c, r);
          else drawFlag(c, r);
        }
      }
    }
  }

  function roundedTop(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }

  function drawGrass(c, r) {
    var x = c * T;
    var y = r * T;
    var exposed = !solidAt(c, r - 1);
    var h = hash2(c, r);

    ctx.fillStyle = "#d9b38c";
    ctx.fillRect(x, y, T, T);

    ctx.fillStyle = "#cba079";
    ctx.fillRect(x + 5 + (h % 9), y + 22 + (h % 8), 4, 4);
    ctx.fillRect(x + 20 + ((h >>> 6) % 10), y + 30 + ((h >>> 3) % 6), 3, 3);

    if (exposed) {
      ctx.fillStyle = "#8fd97a";
      roundedTop(x, y, T, 14, 6);
      ctx.fill();
      ctx.fillStyle = "#b4f09a";
      roundedTop(x, y, T, 7, 5);
      ctx.fill();
      if (h % 6 === 0) drawFlower(x + 9 + (h % 20), y);
    } else {
      ctx.fillStyle = "#8fd97a";
      ctx.fillRect(x, y, T, 10);
      ctx.fillStyle = "#b4f09a";
      ctx.fillRect(x, y, T, 5);
    }
  }

  function drawFlower(x, y) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y - 6, 2.6, 0, Math.PI * 2);
    ctx.arc(x - 4, y - 3, 2.3, 0, Math.PI * 2);
    ctx.arc(x + 4, y - 3, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd66e";
    ctx.beginPath();
    ctx.arc(x, y - 4, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSpike(c, r) {
    var x = c * T;
    var y = r * T;
    var cx = x + T / 2;
    var base = y + T;
    var half = 15;
    var height = 26;

    ctx.fillStyle = "#ff9db0";
    ctx.beginPath();
    ctx.moveTo(cx - half, base);
    ctx.quadraticCurveTo(cx - half + 2, base - height * 0.6, cx - 3, base - height + 3);
    ctx.quadraticCurveTo(cx, base - height - 2, cx + 3, base - height + 3);
    ctx.quadraticCurveTo(cx + half - 2, base - height * 0.6, cx + half, base);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#5b4252";
    ctx.beginPath();
    ctx.arc(cx - 4.5, base - 11, 1.6, 0, Math.PI * 2);
    ctx.arc(cx + 4.5, base - 11, 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#5b4252";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, base - 9, 3, Math.PI * 0.18, Math.PI * 0.82);
    ctx.stroke();
  }

  function drawCheckpoint(c, r) {
    var cx = c * T + T / 2;
    var base = (r + 1) * T;
    var active = checkpoint && checkpoint.c === c && checkpoint.r === r;
    var pop = 0;
    if (active && checkpoint.popUntil && time < checkpoint.popUntil) {
      pop = Math.sin(((checkpoint.popUntil - time) / 0.45) * Math.PI) * 0.3;
    }

    ctx.save();
    ctx.translate(cx, base);
    ctx.scale(1 + pop, 1 + pop);

    ctx.fillStyle = "#d7deea";
    ctx.fillRect(-1.5, -30, 3, 30);

    var wave = Math.sin(time * 4) * 2;
    ctx.fillStyle = active ? "#7ee0a3" : "#ffd66e";
    ctx.beginPath();
    ctx.moveTo(1.5, -30);
    ctx.quadraticCurveTo(9 + wave, -26, 16, -23);
    ctx.quadraticCurveTo(9 + wave, -19, 1.5, -14);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawHeart(x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x - s * 0.5, y - s * 0.2, s * 0.55, Math.PI * 0.85, Math.PI * 2.15);
    ctx.arc(x + s * 0.5, y - s * 0.2, s * 0.55, Math.PI * 0.85, Math.PI * 2.15);
    ctx.lineTo(x, y + s);
    ctx.closePath();
    ctx.fill();
  }

  function drawFlag(c, r) {
    var cx = c * T + T / 2;
    var base = (r + 1) * T;

    ctx.fillStyle = "#d7deea";
    ctx.fillRect(cx - 1.5, base - 46, 3, 46);

    var wave = Math.sin(time * 3) * 2;
    ctx.fillStyle = "#ff8fab";
    ctx.beginPath();
    ctx.moveTo(cx + 1.5, base - 46);
    ctx.quadraticCurveTo(cx + 20, base - 45 + wave, cx + 34, base - 40);
    ctx.quadraticCurveTo(cx + 20, base - 30 + wave, cx + 1.5, base - 24);
    ctx.closePath();
    ctx.fill();

    drawHeart(cx + 17, base - 37, 6, "#ffffff");
  }

  function drawGift(c, r) {
    var cx = c * T + T / 2;
    var base = (r + 1) * T;
    var bob = Math.sin(time * 2) * 2;
    var top = base - 26 + bob;
    var left = cx - 15;

    ctx.fillStyle = "#ffb3c7";
    ctx.fillRect(left, top, 30, 26);

    ctx.fillStyle = "#ff6f91";
    ctx.fillRect(cx - 3, top, 6, 26);
    ctx.fillRect(left, top + 9, 30, 4);

    ctx.beginPath();
    ctx.arc(cx - 5, top - 3, 4, 0, Math.PI * 2);
    ctx.arc(cx + 5, top - 3, 4, 0, Math.PI * 2);
    ctx.fill();

    var twinkle = Math.sin(time * 3.2);
    if (twinkle > 0.55) {
      var a = (twinkle - 0.55) / 0.45;
      ctx.globalAlpha = a;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(left + 26, top - 10);
      ctx.lineTo(left + 29, top - 6);
      ctx.lineTo(left + 26, top - 2);
      ctx.lineTo(left + 23, top - 6);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawPlayer() {
    var run = player.onGround && Math.abs(player.vx) > 25;
    var air = !player.onGround;
    var sy = 1 + player.squash * 0.18;
    var sx = 1 - player.squash * 0.12;
    var bob = !run && !air ? Math.sin(time * 2) * 1.2 : 0;

    ctx.save();
    ctx.translate(player.x, player.y + bob);
    ctx.scale(player.face * sx, sy);

    ctx.strokeStyle = "#4a4a68";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    var hipY = -8;

    if (air) {
      line(0, hipY, -5, -4);
      line(-5, -4, -6, 0);
      line(0, hipY, 5, -4);
      line(5, -4, 6, 0);
    } else {
      var ph = player.animT * 16;
      var swing = run ? Math.sin(ph) * 5 : 0;
      var swing2 = run ? Math.sin(ph + Math.PI) * 5 : 0;
      line(0, hipY, swing, -4);
      line(swing, -4, swing + 1, 0);
      line(0, hipY, swing2, -4);
      line(swing2, -4, swing2 - 1, 0);
    }

    line(0, hipY, 0, -16);

    if (air) {
      line(0, -13, -7, -20);
      line(0, -13, 7, -22);
    } else {
      var arm = run ? Math.sin(player.animT * 16 + Math.PI) * 4 : 0;
      line(0, -13, -7, -8 + arm);
      line(0, -13, 7, -8 - arm);
    }

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#4a4a68";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -25, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    var blinking = player.blink < 0;
    ctx.strokeStyle = "#4a4a68";
    if (blinking) {
      ctx.lineWidth = 1.6;
      line(-6, -26, -2.5, -26);
      line(2.5, -26, 6, -26);
    } else {
      ctx.fillStyle = "#4a4a68";
      ctx.beginPath();
      ctx.arc(-4, -26, 1.4, 0, Math.PI * 2);
      ctx.arc(4, -26, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "#4a4a68";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, -23.5, 3, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 201, 212, 0.9)";
    ctx.beginPath();
    ctx.arc(-6, -22, 2.2, 0, Math.PI * 2);
    ctx.arc(6, -22, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ----- Loop ---------------------------------------------------------- */

  function frame(ts) {
    if (!isOpen) return;
    rafId = window.requestAnimationFrame(frame);
    if (!lastTime) lastTime = ts;
    var dt = (ts - lastTime) / 1000;
    lastTime = ts;
    if (paused) {
      acc = 0;
      return;
    }
    if (dt < 0) dt = 0;
    if (dt > 0.1) dt = 0.1;
    acc += dt;

    var steps = 0;
    while (acc >= FIXED_DT && steps < MAX_STEPS) {
      step(FIXED_DT);
      acc -= FIXED_DT;
      steps++;
    }
    if (steps >= MAX_STEPS) acc = 0;

    if (state !== "scare") render();
  }

  /* ----- Open / close -------------------------------------------------- */

  function openGame() {
    if (isOpen) return;
    injectCss();
    buildOverlay();
    buildClouds();

    isOpen = true;
    paused = false;
    lastTime = 0;
    acc = 0;
    time = 0;

    overlay.style.display = "block";
    overlay.classList.remove("maze-scare-on");
    if (canvas) canvas.style.display = "block";
    if (scareImg) {
      scareImg.classList.remove("maze-visible");
      scareImg.classList.remove("maze-shake");
    }
    if (touchEl) {
      if (isTouch) touchEl.classList.add("maze-touch-on");
      else touchEl.classList.remove("maze-touch-on");
    }
    document.documentElement.classList.add("maze-active");

    requestFullscreen(overlay);
    preloadScare();
    armAudio();

    loadLevel(0);
    startMusic();

    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = window.requestAnimationFrame(frame);
  }

  function closeGame() {
    isOpen = false;
    paused = false;
    state = "play";

    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (toastTimer) {
      window.clearTimeout(toastTimer);
      toastTimer = 0;
    }
    if (toastEl) toastEl.classList.remove("maze-toast-on");

    stopMusic();
    stopScream();

    document.documentElement.classList.remove("maze-active");

    if (canvas) canvas.style.display = "block";
    if (touchEl) touchEl.classList.remove("maze-touch-on");
    if (scareImg) {
      scareImg.classList.remove("maze-visible");
      scareImg.classList.remove("maze-shake");
    }
    if (overlay) {
      overlay.classList.remove("maze-scare-on");
      overlay.style.display = "none";
    }

    level = 0;
    checkpoint = null;
    particles = [];
    fade = 0;
    keys.left = false;
    keys.right = false;
    keys.jumpHeld = false;
    resetButtons();
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
    if (state === "scare") return;
    closeGame();
  }

  function onResize() {
    if (!isOpen) return;
    if (state !== "scare") render();
  }

  function onBlur() {
    if (!isOpen) return;
    if (state === "scare") return;
    paused = true;
    lastTime = 0;
    stopMusic();
    if (audioCtx && audioCtx.state === "running") {
      try {
        var p = audioCtx.suspend();
        if (p && typeof p.catch === "function") p.catch(function () {});
      } catch (e) {}
    }
  }

  function onFocus() {
    if (!isOpen) return;
    if (state === "scare") return;
    paused = false;
    lastTime = 0;
    acc = 0;
    if (audioCtx && audioCtx.state === "suspended") {
      try {
        var p = audioCtx.resume();
        if (p && typeof p.catch === "function") p.catch(function () {});
      } catch (e) {}
    }
    startMusic();
  }

  /* ----- Keyboard and touch -------------------------------------------- */

  function isLeftKey(code, key) {
    return (
      code === "ArrowLeft" ||
      code === "KeyA" ||
      key === "ArrowLeft" ||
      key === "a" ||
      key === "A"
    );
  }

  function isRightKey(code, key) {
    return (
      code === "ArrowRight" ||
      code === "KeyD" ||
      key === "ArrowRight" ||
      key === "d" ||
      key === "D"
    );
  }

  function isJumpKey(code, key) {
    return (
      code === "Space" ||
      code === "ArrowUp" ||
      code === "KeyW" ||
      key === " " ||
      key === "Spacebar" ||
      key === "ArrowUp" ||
      key === "w" ||
      key === "W"
    );
  }

  function onKeyDown(e) {
    if (!isOpen) return;
    var code = e.code || "";
    var key = e.key || "";

    if (code === "Escape" || key === "Escape" || key === "Esc") {
      e.preventDefault();
      e.stopPropagation();
      if (state !== "scare") {
        closeGame();
        exitFullscreen();
      }
      return;
    }

    if (code === "KeyR" || key === "r" || key === "R") {
      e.preventDefault();
      e.stopPropagation();
      if (state === "play" || state === "dead") loadLevel(level);
      return;
    }

    if (isLeftKey(code, key)) {
      e.preventDefault();
      e.stopPropagation();
      keys.left = true;
      return;
    }

    if (isRightKey(code, key)) {
      e.preventDefault();
      e.stopPropagation();
      keys.right = true;
      return;
    }

    if (isJumpKey(code, key)) {
      e.preventDefault();
      e.stopPropagation();
      keys.jumpHeld = true;
      if (!e.repeat) jumpBuf = JUMP_BUFFER;
    }
  }

  function onKeyUp(e) {
    if (!isOpen) return;
    var code = e.code || "";
    var key = e.key || "";

    if (isLeftKey(code, key)) {
      keys.left = false;
    } else if (isRightKey(code, key)) {
      keys.right = false;
    } else if (isJumpKey(code, key)) {
      keys.jumpHeld = false;
    }
  }

  function onPointerUpAnywhere() {
    if (!isOpen) return;
    keys.jumpHeld = false;
  }

  function onFirstTouch() {
    if (isTouch) return;
    isTouch = true;
    if (isOpen && touchEl) touchEl.classList.add("maze-touch-on");
  }

  function onTouchMove(e) {
    if (!isOpen) return;
    e.preventDefault();
  }

  /* ----- Audio --------------------------------------------------------- */

  function ensureAudio() {
    if (audioCtx) return audioCtx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      audioCtx = new AC();
    } catch (e) {
      audioCtx = null;
    }
    return audioCtx;
  }

  function noiseBuffer(ac) {
    if (noiseCache && noiseCache.sampleRate === ac.sampleRate) return noiseCache;
    var len = Math.floor(ac.sampleRate);
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    noiseCache = buf;
    return buf;
  }

  function startMusic() {
    var ac = ensureAudio();
    if (!ac || !isOpen) return;

    try {
      if (ac.state === "suspended") {
        var r = ac.resume();
        if (r && typeof r.catch === "function") r.catch(function () {});
      }
    } catch (e) {}

    if (!musicMaster) {
      try {
        musicMaster = ac.createGain();
        musicMaster.gain.value = 0.5;
        musicFilter = ac.createBiquadFilter();
        musicFilter.type = "lowpass";
        musicFilter.frequency.value = 3000;
        musicMaster.connect(musicFilter);
        musicFilter.connect(ac.destination);
      } catch (e) {
        musicMaster = null;
        return;
      }
    } else {
      try {
        musicMaster.gain.cancelScheduledValues(ac.currentTime);
        musicMaster.gain.setValueAtTime(0.5, ac.currentTime);
      } catch (e) {}
    }

    musicOn = true;
    musicStep = 0;
    musicNext = ac.currentTime + 0.12;

    if (!musicTimer) {
      musicTimer = window.setInterval(scheduleMusic, 100);
    }
    scheduleMusic();
  }

  function stopMusic() {
    musicOn = false;
    if (musicTimer) {
      window.clearInterval(musicTimer);
      musicTimer = 0;
    }
  }

  function scheduleMusic() {
    var ac = audioCtx;
    if (!ac || !musicOn || !musicMaster) return;
    var horizon = ac.currentTime + 0.2;
    var guard = 0;
    while (musicNext < horizon && guard < 8) {
      var stepIndex = musicStep % 16;
      var freq = MELODY[stepIndex];
      if (freq) playMusicNote(ac, freq, musicNext);
      if (stepIndex % 4 === 0) playMusicBass(ac, BASS_NOTES[(stepIndex / 4) % 4], musicNext);
      musicNext += STEP_DUR;
      musicStep++;
      guard++;
    }
  }

  function playMusicNote(ac, freq, at) {
    var o1 = ac.createOscillator();
    o1.type = "triangle";
    o1.frequency.setValueAtTime(freq, at);

    var o2 = ac.createOscillator();
    o2.type = "sine";
    o2.frequency.setValueAtTime(freq * 2, at);

    var sub = ac.createGain();
    sub.gain.setValueAtTime(0.35, at);

    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.16, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);

    o1.connect(g);
    o2.connect(sub);
    sub.connect(g);
    g.connect(musicMaster);

    o1.start(at);
    o1.stop(at + 0.3);
    o2.start(at);
    o2.stop(at + 0.3);
  }

  function playMusicBass(ac, freq, at) {
    var o = ac.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, at);

    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.09, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);

    o.connect(g);
    g.connect(musicMaster);
    o.start(at);
    o.stop(at + 0.55);
  }

  function sfxTone(type, f0, f1, dur, level, delay) {
    var ac = audioCtx;
    if (!ac) return;
    var at = ac.currentTime + (delay || 0);
    var o = ac.createOscillator();
    o.type = type;
    if (f0 !== f1) {
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    } else {
      o.frequency.setValueAtTime(f0, at);
    }
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(level, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    g.connect(ac.destination);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  function sfxNoise(filterType, f0, f1, q, dur, level) {
    var ac = audioCtx;
    if (!ac) return;
    var at = ac.currentTime;
    var src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac);

    var f = ac.createBiquadFilter();
    f.type = filterType;
    if (q) f.Q.value = q;
    f.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, at + dur);

    var g = ac.createGain();
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    src.connect(f);
    f.connect(g);
    g.connect(ac.destination);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  function sfxJump() {
    sfxTone("sine", 380, 640, 0.09, 0.15, 0);
  }

  function sfxLand() {
    sfxNoise("lowpass", 300, 300, 0, 0.06, 0.08);
  }

  function sfxDeath() {
    sfxNoise("bandpass", 900, 300, 1.2, 0.25, 0.12);
  }

  function sfxCheckpoint() {
    sfxTone("triangle", A5, A5, 0.2, 0.15, 0);
    sfxTone("triangle", 1318.5, 1318.5, 0.24, 0.15, 0.12);
  }

  function sfxClear() {
    sfxTone("triangle", C5, C5, 0.3, 0.15, 0);
    sfxTone("triangle", E5, E5, 0.3, 0.15, 0.117);
    sfxTone("triangle", G5, G5, 0.3, 0.15, 0.233);
    sfxTone("triangle", C6, C6, 0.32, 0.15, 0.35);
  }

  /* ----- The scare ----------------------------------------------------- */

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
    ensureAudio();
    var ac = audioCtx;
    if (ac) {
      try {
        if (ac.state === "suspended") {
          var r = ac.resume();
          if (r && typeof r.catch === "function") r.catch(function () {});
        }
      } catch (e) {}
    }

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
          p.then(finishUnlock).catch(function () {
            if (screamEl) screamEl.muted = false;
          });
        } else {
          finishUnlock();
        }
      } catch (e) {
        if (screamEl) screamEl.muted = false;
      }
    }
  }

  function finishUnlock() {
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
    for (var i = 0; i < screamNodes.length; i++) {
      var n = screamNodes[i];
      try {
        if (n && typeof n.stop === "function") n.stop(0);
      } catch (e) {}
      try {
        if (n && typeof n.disconnect === "function") n.disconnect();
      } catch (e) {}
    }
    screamNodes = [];
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
    var ac = ensureAudio();
    if (!ac) return;

    try {
      if (ac.state === "suspended") {
        var r = ac.resume();
        if (r && typeof r.catch === "function") r.catch(function () {});
      }
    } catch (e) {}

    var t0 = ac.currentTime + 0.01;
    var endT = t0 + 2.2;

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
    screamNodes.push(master, shaper);

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
      screamNodes.push(osc, lfo, depth, g);
    }

    sawSweep(600, 1500, 0.45);
    sawSweep(650, 1620, 0.4);

    var frames = Math.max(1, Math.floor(ac.sampleRate * 2.2));
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
    screamNodes.push(noise, band, noiseGain);
  }

  function startScare() {
    if (state === "scare") return;
    state = "scare";

    stopMusic();
    if (musicMaster && audioCtx) {
      try {
        musicMaster.gain.cancelScheduledValues(audioCtx.currentTime);
        musicMaster.gain.setValueAtTime(0, audioCtx.currentTime);
      } catch (e) {}
    }

    resetButtons();
    keys.left = false;
    keys.right = false;
    keys.jumpHeld = false;

    if (canvas) canvas.style.display = "none";
    if (touchEl) touchEl.classList.remove("maze-touch-on");
    if (toastEl) toastEl.classList.remove("maze-toast-on");
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

  /* ----- Trigger: the period in "Cloutyskies.org" ---------------------- */

  function dotRect() {
    var dot = document.getElementById("maze-dot");
    if (!dot) return null;
    var r = dot.getBoundingClientRect();
    if (!r || !r.width || !r.height) return null;
    return r;
  }

  /* The welcome headline sits behind the shell (pointer-events:none), so a
     click on the period lands on the desktop. Match that click by position,
     padded by the same 8px as the invisible hit area. */
  function isDotClick(e) {
    var r = dotRect();
    if (!r) return false;
    var x = e.clientX;
    var y = e.clientY;
    return (
      x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8
    );
  }

  function isEmptyDesktopTarget(target) {
    if (!target || target.nodeType !== 1) return false;
    if (target === document.body || target === document.documentElement) return true;
    var id = target.id;
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

  /* ----- Init ---------------------------------------------------------- */

  function detectTouch() {
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
        return true;
      }
    } catch (e) {}
    return navigator.maxTouchPoints > 0;
  }

  function bind() {
    if (bound) return;
    bound = true;
    isTouch = detectTouch();

    var dot = document.getElementById("maze-dot");
    if (dot) dot.addEventListener("click", onDotClick);

    document.addEventListener("click", onDocumentClick, true);
    document.addEventListener("contextmenu", function (e) {
      if (!isOpen) return;
      e.preventDefault();
    });
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    document.addEventListener("MSFullscreenChange", onFullscreenChange);

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });
    window.addEventListener("touchstart", onFirstTouch, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("pointerup", onPointerUpAnywhere, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
