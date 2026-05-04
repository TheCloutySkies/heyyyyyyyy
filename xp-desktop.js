/**
 * Clouty OS — taskbar, Start menu, workspace, draggable icons, window chrome.
 */
(function () {
  "use strict";

  var ICON_POS_PREFIX = "cloutyIconPos.";
  var GRID = 76;

  var APP_LABELS = {
    notes: "Sticky Notes",
    cloutai: "CloutAI"
  };

  function getLayout() {
    return "desktop";
  }

  function setLayout(mode) {
    try {
      localStorage.removeItem("cloutyLayoutMode");
    } catch (e) {}
    document.documentElement.classList.remove("layout-portal");
    document.documentElement.classList.add("layout-desktop");
  }

  function applyLayoutFromStorage() {
    setLayout("desktop");
  }

  /* ----- Clock ----- */

  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function tickClock() {
    var el = document.getElementById("clock-tray");
    if (!el) return;
    var d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? "PM" : "AM";
    var hr = h % 12;
    if (hr === 0) hr = 12;
    var timeStr = hr + ":" + pad(m) + " " + ampm;
    var dateStr = d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric"
    });
    el.innerHTML =
      '<span class="clock-time">' +
      timeStr +
      '</span><span class="clock-date">' +
      dateStr +
      "</span>";
  }

  /* ----- Start menu ----- */

  function hideAllDetachedFlyouts(menu) {
    menu = menu || document.getElementById("start-menu");
    if (!menu) return;
    menu.querySelectorAll(".start-flyout--detached").forEach(function (f) {
      f.hidden = true;
      f.classList.remove("is-visible");
      f.setAttribute("aria-hidden", "true");
    });
  }

  function positionDetachedFlyout(item, flyout) {
    var b = item.querySelector(".start-btn");
    if (!b || !flyout) return;
    flyout.hidden = false;
    flyout.classList.add("is-visible");
    flyout.setAttribute("aria-hidden", "false");

    function place() {
      var br = b.getBoundingClientRect();
      var gap = 4;
      var left = br.right + gap;
      var top = br.top;
      flyout.style.left = left + "px";
      flyout.style.top = top + "px";
      var fr = flyout.getBoundingClientRect();
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      if (fr.right > vw - 8) {
        left = Math.max(8, br.left - fr.width - gap);
        flyout.style.left = left + "px";
        fr = flyout.getBoundingClientRect();
      }
      if (fr.bottom > vh - 8) {
        top = Math.max(8, vh - fr.height - 8);
        flyout.style.top = top + "px";
        fr = flyout.getBoundingClientRect();
      }
      if (fr.top < 8) {
        flyout.style.top = "8px";
      }
    }

    requestAnimationFrame(place);
  }

  function repositionVisibleFlyouts(menu) {
    menu = menu || document.getElementById("start-menu");
    if (!menu) return;
    menu.querySelectorAll(".start-item.has-children[data-flyout]").forEach(function (item) {
      var fid = item.getAttribute("data-flyout");
      if (!fid) return;
      var flyout = document.getElementById("start-flyout-" + fid);
      if (!flyout || flyout.hidden) return;
      positionDetachedFlyout(item, flyout);
    });
  }

  function closeStartMenu() {
    var menu = document.getElementById("start-menu");
    var btn = document.getElementById("btn-start");
    if (!menu) return;
    hideAllDetachedFlyouts(menu);
    menu.classList.remove("is-open");
    menu.hidden = true;
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
    }
    document.querySelectorAll(".start-item.is-open").forEach(function (li) {
      li.classList.remove("is-open");
    });
  }

  function openStartMenu() {
    var menu = document.getElementById("start-menu");
    var btn = document.getElementById("btn-start");
    if (!menu) return;
    menu.hidden = false;
    menu.classList.add("is-open");
    if (btn) btn.setAttribute("aria-expanded", "true");
  }

  function toggleStartMenu() {
    var menu = document.getElementById("start-menu");
    if (!menu) return;
    if (menu.classList.contains("is-open")) closeStartMenu();
    else openStartMenu();
  }

  function refreshTaskbarA11y() {
    var tray = document.getElementById("taskbar-tasks");
    if (!tray) return;
    var hasBtn = tray.querySelector(".task-btn[data-task]");
    tray.setAttribute("aria-hidden", hasBtn ? "false" : "true");
    if (hasBtn) {
      tray.setAttribute("role", "toolbar");
      tray.setAttribute("aria-label", "Open applications");
    } else {
      tray.removeAttribute("role");
      tray.removeAttribute("aria-label");
    }
  }

  function ensureTaskButton(taskId, label) {
    var tray = document.getElementById("taskbar-tasks");
    if (!tray || !taskId) return null;
    var existing = null;
    tray.querySelectorAll(".task-btn[data-task]").forEach(function (b) {
      if (b.getAttribute("data-task") === taskId) existing = b;
    });
    if (existing) {
      if (label) existing.textContent = label;
      refreshTaskbarA11y();
      return existing;
    }
    var tb = document.createElement("button");
    tb.type = "button";
    tb.className = "task-btn";
    tb.setAttribute("data-task", taskId);
    tb.setAttribute("aria-pressed", "false");
    tb.textContent = label || taskId;
    tray.appendChild(tb);
    refreshTaskbarA11y();
    return tb;
  }

  function removeTaskButton(taskId) {
    var tray = document.getElementById("taskbar-tasks");
    if (!tray) return;
    tray.querySelectorAll(".task-btn[data-task]").forEach(function (b) {
      if (b.getAttribute("data-task") === taskId) b.remove();
    });
    refreshTaskbarA11y();
  }

  function taskbarActivate(id) {
    var win = document.getElementById("win-" + id);
    if (!win) return;
    if (win.getAttribute("data-minimized") === "true") {
      win.removeAttribute("data-minimized");
      bringToFront(win);
    } else {
      minimizeWindow(id);
    }
    syncTaskButtons();
  }

  function initTaskbarDelegation() {
    var tray = document.getElementById("taskbar-tasks");
    if (!tray || tray._delegatedTasks) return;
    tray._delegatedTasks = true;
    tray.addEventListener("click", function (e) {
      var btn = e.target.closest(".task-btn[data-task]");
      if (!btn) return;
      var id = btn.getAttribute("data-task");
      taskbarActivate(id);
    });
  }

  function isSameSiteGameHref(href) {
    if (!href || href.charAt(0) === "#") return false;
    try {
      var u = new URL(href, window.location.href);
      return u.origin === window.location.origin;
    } catch (e) {
      return false;
    }
  }

  function pipIdFromHref(href) {
    try {
      var u = new URL(href, window.location.href);
      var leaf = u.pathname.split("/").pop() || "game";
      var stem = leaf.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase();
      return "pip-" + (stem || "game");
    } catch (e) {
      return "pip-game";
    }
  }

  function pipTitleFromAnchor(a) {
    var t = "";
    try {
      t = (a.innerText || a.textContent || "").replace(/\s+/g, " ").trim();
    } catch (err) {}
    if (!t) return "Game";
    return t.length > 42 ? t.slice(0, 40) + "…" : t;
  }

  function pipOffsetIndex() {
    var layer = document.getElementById("window-layer");
    return layer ? layer.querySelectorAll(".pip-shell").length : 0;
  }

  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function interceptGameFlyoutLaunch(a) {
    var href = a.getAttribute("href");
    if (!isSameSiteGameHref(href)) return false;
    closeStartMenu();
    var gid = pipIdFromHref(href);
    var title = pipTitleFromAnchor(a);
    var existing = document.getElementById("win-" + gid);
    if (existing) {
      openAppWindow(gid, title);
      return true;
    }
    createPipGameShell(gid, title, href);
    return true;
  }

  function createPipGameShell(id, title, href) {
    var layer = document.getElementById("window-layer");
    if (!layer) return null;
    var off = (pipOffsetIndex() % 6) * 24;
    var win = document.createElement("section");
    win.className = "window shell-window hero-wall pip-shell";
    win.id = "win-" + id;
    win.style.left = "calc(9vw + " + off + "px)";
    win.style.top = "calc(10vh + " + off + "px)";
    win.style.right = "auto";
    win.style.width = "min(560px, 94vw)";
    win.style.height = "min(440px, 58vh)";

    win.innerHTML =
      '<div class="title-bar">' +
      '<div class="title-bar-text"></div>' +
      '<div class="title-bar-controls">' +
      '<button type="button" aria-label="Minimize" data-minimize></button>' +
      '<button type="button" aria-label="Close" data-shell-close></button>' +
      "</div></div>" +
      '<div class="window-body pip-frame-body">' +
      '<iframe title="' +
      escapeAttr(title) +
      '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock"></iframe>' +
      "</div>";
    win.querySelector(".title-bar-text").textContent = title;
    win.querySelector("iframe").src = href;
    layer.appendChild(win);
    attachShellWindowChrome(win);
    openAppWindow(id, title);
    return win;
  }

  function initStartMenu() {
    var btn = document.getElementById("btn-start");
    var menu = document.getElementById("start-menu");
    if (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        toggleStartMenu();
      });
    }
    document.addEventListener("click", function (e) {
      if (!menu || !menu.classList.contains("is-open")) return;
      if (menu.contains(e.target) || (btn && btn.contains(e.target))) return;
      closeStartMenu();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeStartMenu();
    });

    var flyoutHoverTimer = null;
    function clearFlyoutHoverTimer() {
      if (flyoutHoverTimer) {
        clearTimeout(flyoutHoverTimer);
        flyoutHoverTimer = null;
      }
    }
    function scheduleFlyoutHide() {
      clearFlyoutHoverTimer();
      flyoutHoverTimer = setTimeout(function () {
        hideAllDetachedFlyouts(menu);
      }, 240);
    }

    var items = document.querySelectorAll(".start-item.has-children[data-flyout]");
    items.forEach(function (item) {
      var btnInner = item.querySelector(".start-btn");
      if (!btnInner) return;
      var fid = item.getAttribute("data-flyout");
      var flyout = fid ? document.getElementById("start-flyout-" + fid) : null;

      if (flyout) {
        item.addEventListener("mouseenter", function () {
          if (!window.matchMedia("(hover: hover)").matches) return;
          clearFlyoutHoverTimer();
          hideAllDetachedFlyouts(menu);
          flyout.hidden = false;
          flyout.classList.add("is-visible");
          flyout.setAttribute("aria-hidden", "false");
          positionDetachedFlyout(item, flyout);
        });
        item.addEventListener("mouseleave", function () {
          if (!window.matchMedia("(hover: hover)").matches) return;
          scheduleFlyoutHide();
        });
        flyout.addEventListener("mouseenter", function () {
          if (!window.matchMedia("(hover: hover)").matches) return;
          clearFlyoutHoverTimer();
        });
        flyout.addEventListener("mouseleave", function () {
          if (!window.matchMedia("(hover: hover)").matches) return;
          scheduleFlyoutHide();
        });
      }

      btnInner.addEventListener("click", function (e) {
        if (window.matchMedia("(hover: hover)").matches && getLayout() === "desktop") {
          return;
        }
        e.preventDefault();
        var open = item.classList.contains("is-open");
        items.forEach(function (o) {
          o.classList.remove("is-open");
        });
        hideAllDetachedFlyouts(menu);
        if (!open && flyout) {
          item.classList.add("is-open");
          positionDetachedFlyout(item, flyout);
        }
      });
    });

    var bodyEl = menu ? menu.querySelector(".start-menu-body") : null;
    if (bodyEl) {
      bodyEl.addEventListener(
        "scroll",
        function () {
          repositionVisibleFlyouts(menu);
        },
        { passive: true }
      );
    }
    window.addEventListener(
      "resize",
      function () {
        repositionVisibleFlyouts(menu);
      },
      { passive: true }
    );

    document.querySelectorAll("[data-open-app]").forEach(function (el) {
      el.addEventListener("click", function () {
        var id = el.getAttribute("data-open-app");
        closeStartMenu();
        openAppWindow(id);
      });
    });

    document.querySelectorAll('[data-action="help-cloutai"]').forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        closeStartMenu();
        openAppWindow("cloutai");
      });
    });

    document.querySelectorAll("#start-flyout-games a[href]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        if (interceptGameFlyoutLaunch(a)) {
          e.preventDefault();
          e.stopPropagation();
        }
      });
    });

    document.querySelectorAll("#start-menu .start-flyout a[href]").forEach(function (a) {
      a.addEventListener("click", function () {
        if (a.closest("#start-flyout-games")) return;
        closeStartMenu();
      });
    });

    document.querySelectorAll('#start-menu a.start-btn[href^="http"]').forEach(function (a) {
      a.addEventListener("click", function () {
        closeStartMenu();
      });
    });
  }

  /* ----- App windows ----- */

  var zBase = 100;
  function bringToFront(win) {
    zBase += 1;
    win.style.zIndex = String(zBase);
  }

  function defaultLabelForTask(id) {
    if (APP_LABELS[id]) return APP_LABELS[id];
    if (id.slice(0, 4) === "pip-") {
      var rest = id.slice(4).replace(/-/g, " ").trim();
      if (!rest) return id;
      return rest.charAt(0).toUpperCase() + rest.slice(1);
    }
    return id;
  }

  function openAppWindow(id, optLabel) {
    var win = document.getElementById("win-" + id);
    if (!win) return;
    ensureTaskButton(id, optLabel || defaultLabelForTask(id));
    win.removeAttribute("data-minimized");
    win.style.visibility = "";
    bringToFront(win);
    syncTaskButtons();
  }

  function minimizeWindow(id) {
    var win = document.getElementById("win-" + id);
    if (!win) return;
    win.setAttribute("data-minimized", "true");
    syncTaskButtons();
  }

  function syncTaskButtons() {
    var tray = document.getElementById("taskbar-tasks");
    if (!tray) return;
    tray.querySelectorAll(".task-btn[data-task]").forEach(function (tb) {
      var id = tb.getAttribute("data-task");
      var win = document.getElementById("win-" + id);
      if (!win) {
        tb.remove();
        return;
      }
      var minimized = win.getAttribute("data-minimized") === "true";
      tb.setAttribute("aria-pressed", minimized ? "false" : "true");
    });
    refreshTaskbarA11y();
  }

  function destroyShellWindow(id) {
    var win = document.getElementById("win-" + id);
    if (!win || !win.classList.contains("pip-shell")) return;
    if (win.parentNode) win.parentNode.removeChild(win);
    removeTaskButton(id);
    syncTaskButtons();
  }

  function attachShellWindowChrome(win) {
    if (!win || win.dataset.shellChromeBound === "1") return;
    win.dataset.shellChromeBound = "1";
    var rawId = win.id.replace(/^win-/, "");
    if (!rawId) return;

    var titleBar = win.querySelector(".title-bar");
    if (titleBar && titleBar.dataset.dragShellAttached !== "1") {
      titleBar.dataset.dragShellAttached = "1";
      titleBar.addEventListener("pointerdown", function (e) {
        if (e.button > 0) return;
        if (e.target.closest(".title-bar-controls")) return;
        startDragWindow(e, win);
      });
    }

    win.querySelectorAll("[data-minimize]").forEach(function (b) {
      if (b.dataset.shellMinBound === "1") return;
      b.dataset.shellMinBound = "1";
      b.addEventListener("click", function () {
        minimizeWindow(rawId);
      });
    });

    win.querySelectorAll("[data-shell-close]").forEach(function (b) {
      if (b.dataset.shellCloseBound === "1") return;
      b.dataset.shellCloseBound = "1";
      b.addEventListener("click", function () {
        destroyShellWindow(rawId);
      });
    });

    if (win.dataset.shellRaiseBound !== "1") {
      win.dataset.shellRaiseBound = "1";
      win.addEventListener("mousedown", function () {
        bringToFront(win);
      });
    }
  }

  function initWindowChrome() {
    document.querySelectorAll("#window-layer .shell-window").forEach(attachShellWindowChrome);
    initTaskbarDelegation();
  }

  var dragState = null;

  function startDragWindow(e, win) {
    e.preventDefault();
    bringToFront(win);
    var parent = win.offsetParent;
    if (!parent) parent = document.body;
    var pr = parent.getBoundingClientRect();
    var wr = win.getBoundingClientRect();
    win.style.right = "auto";
    win.style.left = wr.left - pr.left + parent.scrollLeft + "px";
    win.style.top = wr.top - pr.top + parent.scrollTop + "px";

    var startX = e.clientX;
    var startY = e.clientY;
    var origLeft = win.offsetLeft;
    var origTop = win.offsetTop;
    dragState = { win: win, startX: startX, startY: startY, origLeft: origLeft, origTop: origTop };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {}

    function move(ev) {
      if (!dragState) return;
      var dx = ev.clientX - dragState.startX;
      var dy = ev.clientY - dragState.startY;
      win.style.left = dragState.origLeft + dx + "px";
      win.style.top = dragState.origTop + dy + "px";
    }
    function up() {
      dragState = null;
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
    }
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  }

  /* ----- Desktop icons ----- */

  function snap(v) {
    return Math.round(v / GRID) * GRID;
  }

  function loadIconPos(id) {
    try {
      var raw = localStorage.getItem(ICON_POS_PREFIX + getLayout() + "." + id);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function saveIconPos(id, x, y) {
    try {
      localStorage.setItem(
        ICON_POS_PREFIX + getLayout() + "." + id,
        JSON.stringify({ x: x, y: y })
      );
    } catch (err) {}
  }

  function placeIcon(el, x, y) {
    var layer = document.getElementById("desktop-icon-layer");
    if (!layer) return;
    var maxX = layer.clientWidth - el.offsetWidth;
    var maxY = layer.clientHeight - el.offsetHeight;
    x = Math.max(0, Math.min(maxX, x));
    y = Math.max(0, Math.min(maxY, y));
    el.style.left = snap(x) + "px";
    el.style.top = snap(y) + "px";
  }

  var iconDragState = null;

  function initDesktopIcons() {
    var icons = document.querySelectorAll(".desktop-icon[data-icon-id]");
    var layer = document.getElementById("desktop-icon-layer");
    if (!layer || !icons.length) return;

    icons.forEach(function (icon, idx) {
      var id = icon.getAttribute("data-icon-id");
      var saved = loadIconPos(id);
      if (saved) {
        placeIcon(icon, saved.x, saved.y);
      } else {
        /* Top-left column (classic shell shortcuts) */
        placeIcon(icon, 16, 16 + idx * GRID);
      }
    });

    icons.forEach(function (icon) {
      icon.addEventListener("pointerdown", function (e) {
        if (e.button > 0) return;
        iconDragState = {
          icon: icon,
          pid: e.pointerId,
          x0: e.clientX,
          y0: e.clientY,
          l0: icon.offsetLeft,
          t0: icon.offsetTop,
          moved: false
        };
        icon.classList.add("is-dragging");
        try {
          icon.setPointerCapture(e.pointerId);
        } catch (err) {}
        e.preventDefault();
      });

      icon.addEventListener("click", function (e) {
        if (icon.getAttribute("data-dragged") === "1") {
          e.preventDefault();
          e.stopPropagation();
          icon.removeAttribute("data-dragged");
        }
      });
    });

    document.addEventListener(
      "pointermove",
      function (e) {
        if (!iconDragState || e.pointerId !== iconDragState.pid) return;
        var st = iconDragState;
        var dx = e.clientX - st.x0;
        var dy = e.clientY - st.y0;
        if (Math.abs(dx) + Math.abs(dy) > 4) st.moved = true;
        st.icon.style.left = snap(st.l0 + dx) + "px";
        st.icon.style.top = snap(st.t0 + dy) + "px";
      },
      { passive: true }
    );

    document.addEventListener("pointerup", function (e) {
      if (!iconDragState || e.pointerId !== iconDragState.pid) return;
      var ic = iconDragState.icon;
      try {
        ic.releasePointerCapture(e.pointerId);
      } catch (err) {}
      ic.classList.remove("is-dragging");
      if (iconDragState.moved) {
        ic.setAttribute("data-dragged", "1");
      }
      saveIconPos(ic.getAttribute("data-icon-id"), ic.offsetLeft, ic.offsetTop);
      iconDragState = null;
    });

    document.addEventListener("pointercancel", function (e) {
      if (iconDragState && e.pointerId === iconDragState.pid) {
        iconDragState.icon.classList.remove("is-dragging");
        iconDragState = null;
      }
    });

    window.addEventListener("resize", function () {
      icons.forEach(function (icon) {
        placeIcon(icon, icon.offsetLeft, icon.offsetTop);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    applyLayoutFromStorage();
    tickClock();
    setInterval(tickClock, 1000);
    initStartMenu();
    initWindowChrome();
    initDesktopIcons();

    /* Sticky Notes + CloutAI start minimized in markup; open via taskbar / Start. */
    syncTaskButtons();
  });

  window.CloutyDesktop = {
    setLayoutMode: setLayout,
    getLayoutMode: getLayout,
    openApp: openAppWindow,
    minimizeApp: minimizeWindow,
    syncTasks: syncTaskButtons,
    closeStartMenu: closeStartMenu
  };
})();


