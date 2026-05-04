/**
 * Clouty OS preferences — theme, pointer scheme (system default or keywords),
 * and optional pointer trail (canvas). Persists to localStorage.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "cloutyPrefs.v1";

  var DEFAULT_PREFS = {
    theme: "light",
    scheme: "standard",
    trailEnabled: false,
    trailLength: 48,
    trailSize: 5,
    trailGlow: 0.45,
    trailBlur: 0.25
  };

  function prefersReducedMotion() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  /**
   * Maps setting IDs to CSS cursor. standard / inverted use the normal OS arrow:
   * custom image cursors often glitch (e.g. stray square) in browsers, so we clear
   * inline cursor and let the UA draw the default pointer.
   */
  var SCHEME_CSS = {
    standard: "auto",
    inverted: "auto",
    precision: "crosshair",
    link: "pointer"
  };

  function safeParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function loadPrefs() {
    var stored = safeParse(localStorage.getItem(STORAGE_KEY));
    var merged = Object.assign({}, DEFAULT_PREFS, stored || {});
    if (prefersReducedMotion()) {
      merged.trailEnabled = false;
    }
    return merged;
  }

  function savePrefs(p) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch (e) {
      /* ignore quota */
    }
  }

  function updateThemeColor(dark) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    meta.setAttribute("content", dark ? "#1a2740" : "#3d7d55");
  }

  function applyTheme(prefs) {
    var dark = prefs.theme === "dark";
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    if (dark) {
      document.documentElement.classList.add("clouty-scanlines");
    } else {
      document.documentElement.classList.remove("clouty-scanlines");
    }
    updateThemeColor(dark);
  }

  function applyCursorScheme(prefs) {
    var css = SCHEME_CSS[prefs.scheme];
    if (!css) css = SCHEME_CSS.standard;
    if (css === "auto") {
      document.documentElement.style.removeProperty("cursor");
      if (document.body) {
        document.body.style.removeProperty("cursor");
      }
      return;
    }
    document.documentElement.style.cursor = css;
    if (document.body) {
      document.body.style.cursor = css;
    }
  }

  /* ---------- Pointer trail ---------- */

  var trailCanvas = null;
  var trailCtx = null;
  var trailPoints = [];
  var trailRaf = 0;
  var trailPrefs = null;

  function ensureTrailCanvas() {
    if (trailCanvas) return;
    trailCanvas = document.createElement("canvas");
    trailCanvas.id = "clouty-cursor-trail";
    trailCanvas.setAttribute("aria-hidden", "true");
    document.body.insertBefore(trailCanvas, document.body.firstChild);
    trailCtx = trailCanvas.getContext("2d");
    window.addEventListener("resize", syncTrailSize, { passive: true });
  }

  function syncTrailSize() {
    if (!trailCanvas) return;
    var w = window.innerWidth;
    var h = window.innerHeight;
    trailCanvas.width = w;
    trailCanvas.height = h;
  }

  function onPointerMove(ev) {
    if (!trailPrefs || !trailPrefs.trailEnabled) return;
    trailPoints.push({ x: ev.clientX, y: ev.clientY, a: 1 });
    var max = Math.max(8, Math.min(120, trailPrefs.trailLength | 0));
    while (trailPoints.length > max) trailPoints.shift();
  }

  function trailLoop() {
    trailRaf = 0;
    if (!trailCtx || !trailCanvas || !trailPrefs) return;

    var w = trailCanvas.width;
    var h = trailCanvas.height;
    var p = trailPrefs;
    if (!p.trailEnabled || prefersReducedMotion()) {
      trailCtx.clearRect(0, 0, w, h);
      return;
    }

    trailCtx.clearRect(0, 0, w, h);

    var decay = 0.88;
    for (var i = 0; i < trailPoints.length; i++) {
      trailPoints[i].a *= decay;
    }
    trailPoints = trailPoints.filter(function (pt) {
      return pt.a > 0.04;
    });

    var size = Math.max(1, Math.min(24, p.trailSize));
    var glow = Math.max(0, Math.min(1, p.trailGlow));
    var blur = Math.max(0, Math.min(1, p.trailBlur));

    trailCtx.save();
    trailCtx.lineCap = "round";
    trailCtx.lineJoin = "round";
    trailCtx.globalCompositeOperation = "lighter";

    for (var j = 1; j < trailPoints.length; j++) {
      var a = trailPoints[j].a;
      var px = trailPoints[j].x;
      var py = trailPoints[j].y;
      trailCtx.beginPath();
      trailCtx.moveTo(trailPoints[j - 1].x, trailPoints[j - 1].y);
      trailCtx.lineTo(px, py);
      trailCtx.strokeStyle = "rgba(160, 210, 255, " + (a * 0.55) + ")";
      trailCtx.lineWidth = size;
      trailCtx.shadowBlur = glow * 28 + blur * 14;
      trailCtx.shadowColor = "rgba(120, 190, 255, " + (0.4 + glow * 0.5) + ")";
      trailCtx.stroke();
    }

    for (var k = 0; k < trailPoints.length; k++) {
      var t = trailPoints[k];
      trailCtx.beginPath();
      trailCtx.arc(t.x, t.y, size * 0.42, 0, Math.PI * 2);
      trailCtx.fillStyle = "rgba(200, 230, 255, " + (t.a * 0.35) + ")";
      trailCtx.shadowBlur = glow * 18;
      trailCtx.shadowColor = "rgba(150, 200, 255, " + (0.35 + t.a * 0.4) + ")";
      trailCtx.fill();
    }

    trailCtx.restore();

    if (p.trailEnabled && trailPoints.length > 0) {
      trailRaf = window.requestAnimationFrame(trailLoop);
    }
  }

  function armTrailLoop() {
    if (trailRaf) return;
    trailRaf = window.requestAnimationFrame(trailLoop);
  }

  function bindTrailEvents(on) {
    document.removeEventListener("pointermove", onPointerMove);
    if (on) {
      document.addEventListener("pointermove", onPointerMove, { passive: true });
    }
  }

  function applyTrail(prefs) {
    trailPrefs = prefs;
    if (prefersReducedMotion() || !prefs.trailEnabled) {
      bindTrailEvents(false);
      if (trailCtx && trailCanvas) {
        trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
      }
      trailPoints = [];
      return;
    }
    ensureTrailCanvas();
    syncTrailSize();
    bindTrailEvents(true);
    armTrailLoop();
  }

  function applyAll(prefs) {
    applyTheme(prefs);
    applyCursorScheme(prefs);
    applyTrail(prefs);
  }

  /* ---------- Settings UI sync ---------- */

  function setSettingsStatus(text) {
    var el = document.getElementById("settings-status");
    if (el) el.textContent = text;
  }

  function syncFormFromPrefs(prefs) {
    var el;

    el = document.getElementById("pref-use-dark");
    if (el) el.checked = prefs.theme === "dark";

    el = document.getElementById("pref-scheme");
    if (el) el.value = prefs.scheme in SCHEME_CSS ? prefs.scheme : "standard";

    el = document.getElementById("pref-trail-on");
    if (el) {
      el.checked = !!prefs.trailEnabled && !prefersReducedMotion();
      el.disabled = prefersReducedMotion();
    }

    el = document.getElementById("pref-trail-length");
    if (el) el.value = String(prefs.trailLength);

    el = document.getElementById("pref-trail-size");
    if (el) el.value = String(prefs.trailSize);

    el = document.getElementById("pref-trail-glow");
    if (el) el.value = String(Math.round(prefs.trailGlow * 100));

    el = document.getElementById("pref-trail-blur");
    if (el) el.value = String(Math.round(prefs.trailBlur * 100));

    el = document.getElementById("pref-trail-length-val");
    if (el) el.textContent = String(prefs.trailLength);

    el = document.getElementById("pref-trail-size-val");
    if (el) el.textContent = String(prefs.trailSize);

    el = document.getElementById("pref-trail-glow-val");
    if (el) el.textContent = String(Math.round(prefs.trailGlow * 100));

    el = document.getElementById("pref-trail-blur-val");
    if (el) el.textContent = String(Math.round(prefs.trailBlur * 100));

    el = document.getElementById("pref-motion-note");
    if (el) {
      el.style.display = prefersReducedMotion() ? "block" : "none";
    }

    var summary =
      prefs.trailEnabled && !prefersReducedMotion()
        ? "Pointer trails: On"
        : "Pointer trails: Off";
    setSettingsStatus(summary);
  }

  function readFormIntoPrefs(prev) {
    var p = Object.assign({}, prev);
    var el;

    el = document.getElementById("pref-use-dark");
    if (el) p.theme = el.checked ? "dark" : "light";

    el = document.getElementById("pref-scheme");
    if (el && SCHEME_CSS[el.value]) p.scheme = el.value;

    el = document.getElementById("pref-trail-on");
    if (el && !el.disabled) p.trailEnabled = el.checked;

    el = document.getElementById("pref-trail-length");
    if (el) p.trailLength = clampNum(parseInt(el.value, 10), 12, 120, 48);

    el = document.getElementById("pref-trail-size");
    if (el) p.trailSize = clampNum(parseInt(el.value, 10), 1, 24, 5);

    el = document.getElementById("pref-trail-glow");
    if (el) p.trailGlow = clampNum(parseInt(el.value, 10) / 100, 0, 1, 0.45);

    el = document.getElementById("pref-trail-blur");
    if (el) p.trailBlur = clampNum(parseInt(el.value, 10) / 100, 0, 1, 0.25);

    return p;
  }

  function clampNum(n, min, max, fallback) {
    if (typeof n !== "number" || isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  var prefs = loadPrefs();

  function openSettings() {
    var panel = document.getElementById("settings-panel");
    var back = document.getElementById("settings-backdrop");
    if (!panel) return;
    syncFormFromPrefs(prefs);
    panel.classList.add("is-open");
    panel.setAttribute("aria-modal", "true");
    if (back) {
      back.classList.add("is-open");
      back.setAttribute("aria-hidden", "false");
    }
  }

  function closeSettings() {
    var panel = document.getElementById("settings-panel");
    var back = document.getElementById("settings-backdrop");
    if (panel) {
      panel.classList.remove("is-open");
      panel.setAttribute("aria-modal", "false");
    }
    if (back) {
      back.classList.remove("is-open");
      back.setAttribute("aria-hidden", "true");
    }
  }

  function bindSettingsUI() {
    var panel = document.getElementById("settings-panel");
    if (!panel) return;

    var back = document.getElementById("settings-backdrop");
    if (back) {
      back.addEventListener("click", closeSettings);
    }

    var ids = [
      "pref-use-dark",
      "pref-scheme",
      "pref-trail-on",
      "pref-trail-length",
      "pref-trail-size",
      "pref-trail-glow",
      "pref-trail-blur"
    ];
    ids.forEach(function (id) {
      var node = document.getElementById(id);
      if (!node) return;
      node.addEventListener("change", function () {
        prefs = readFormIntoPrefs(prefs);
        savePrefs(prefs);
        applyAll(prefs);
        syncFormFromPrefs(prefs);
      });
      node.addEventListener("input", function () {
        prefs = readFormIntoPrefs(prefs);
        savePrefs(prefs);
        applyAll(prefs);
      });
    });

    document.querySelectorAll("[data-settings-close]").forEach(function (btn) {
      btn.addEventListener("click", closeSettings);
    });
  }

  function bindSettingsLaunchers() {
    document.querySelectorAll("[data-open-settings]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        if (window.CloutyDesktop && window.CloutyDesktop.closeStartMenu) {
          window.CloutyDesktop.closeStartMenu();
        }
        openSettings();
      });
    });
  }

  function bootPrefs() {
    prefs = loadPrefs();
    applyAll(prefs);
    syncFormFromPrefs(prefs);
    bindSettingsUI();
    bindSettingsLaunchers();

    document.addEventListener(
      "pointermove",
      function () {
        if (prefs && prefs.trailEnabled && !prefersReducedMotion()) {
          armTrailLoop();
        }
      },
      { passive: true }
    );

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeSettings();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootPrefs);
  } else {
    bootPrefs();
  }

  window.CloutyPrefs = {
    get: function () {
      return Object.assign({}, prefs);
    },
    set: function (next) {
      prefs = Object.assign({}, prefs, next);
      savePrefs(prefs);
      applyAll(prefs);
    },
    openSettings: openSettings,
    closeSettings: closeSettings,
    reload: function () {
      prefs = loadPrefs();
      applyAll(prefs);
      syncFormFromPrefs(prefs);
    }
  };
})();
