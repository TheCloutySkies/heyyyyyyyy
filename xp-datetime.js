/**
 * Clouty OS — "Date and Time Properties", opened by the taskbar clock.
 * Recreates the Windows XP dialog: month calendar, analog clock, tabs.
 */
(function () {
  "use strict";

  var MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  var CELLS = 42; /* XP keeps six rows so the control never changes height */

  var win = null;
  var grid = null;
  var monthSel = null;
  var yearInput = null;
  var timeField = null;
  var zoneName = null;
  var zoneReadonly = null;
  var built = false;
  var view = new Date();
  var selected = new Date();
  var lastTimeText = "";
  var timer = null;

  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function formatTime(d) {
    var h = d.getHours();
    var suffix = h >= 12 ? "PM" : "AM";
    var hour = h % 12;
    if (hour === 0) hour = 12;
    return hour + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) + " " + suffix;
  }

  function zoneLabel() {
    try {
      var parts = new Intl.DateTimeFormat(undefined, { timeZoneName: "long" })
        .formatToParts(new Date());
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === "timeZoneName") return parts[i].value;
      }
    } catch (e) {}
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown";
    } catch (err) {
      return "Unknown";
    }
  }

  /* ----- calendar ----- */

  function dayCell(dayNum, year, month, today) {
    var cell = document.createElement("button");
    cell.type = "button";
    cell.className = "dt-day";
    cell.textContent = String(dayNum);
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("data-day", String(dayNum));
    cell.setAttribute(
      "aria-label",
      MONTHS[month] + " " + dayNum + ", " + year
    );
    var date = new Date(year, month, dayNum);
    if (sameDay(date, selected)) cell.setAttribute("aria-selected", "true");
    if (sameDay(date, today)) cell.classList.add("is-today");
    return cell;
  }

  function emptyCell() {
    var cell = document.createElement("button");
    cell.type = "button";
    cell.className = "dt-day is-empty";
    cell.disabled = true;
    cell.tabIndex = -1;
    cell.setAttribute("aria-hidden", "true");
    return cell;
  }

  function renderGrid() {
    if (!grid) return;
    var year = view.getFullYear();
    var month = view.getMonth();
    var lead = new Date(year, month, 1).getDay();
    var days = new Date(year, month + 1, 0).getDate();
    var today = new Date();
    var frag = document.createDocumentFragment();
    var i;

    for (i = 0; i < lead; i++) frag.appendChild(emptyCell());
    for (i = 1; i <= days; i++) frag.appendChild(dayCell(i, year, month, today));
    while (frag.childNodes.length < CELLS) frag.appendChild(emptyCell());

    grid.innerHTML = "";
    grid.appendChild(frag);
  }

  function syncControls() {
    if (monthSel) monthSel.value = String(view.getMonth());
    if (yearInput) yearInput.value = String(view.getFullYear());
  }

  function setView(year, month) {
    view = new Date(year, month, 1);
    syncControls();
    renderGrid();
  }

  /* ----- analog clock ----- */

  function buildMarks() {
    var group = document.getElementById("dt-marks");
    if (!group || built) return;
    var ns = "http://www.w3.org/2000/svg";
    for (var i = 0; i < 12; i++) {
      var angle = (i / 12) * Math.PI * 2;
      var rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", (60 + Math.sin(angle) * 56 - 2).toFixed(2));
      rect.setAttribute("y", (60 - Math.cos(angle) * 56 - 2).toFixed(2));
      rect.setAttribute("width", "4");
      rect.setAttribute("height", "4");
      group.appendChild(rect);
    }
    built = true;
  }

  function setHand(el, deg, length, offset) {
    if (!el) return;
    var rad = (deg - 90) * Math.PI / 180;
    var dx = offset || 0;
    el.setAttribute("x1", String(60 + dx));
    el.setAttribute("y1", String(60 + dx));
    el.setAttribute("x2", (60 + Math.cos(rad) * length + dx).toFixed(2));
    el.setAttribute("y2", (60 + Math.sin(rad) * length + dx).toFixed(2));
  }

  function tick() {
    if (!win || win.getAttribute("data-minimized") === "true") return;
    var now = new Date();
    var minutes = now.getMinutes();
    var minuteDeg = minutes * 6 + now.getSeconds() * 0.1;
    var hourDeg = (now.getHours() % 12) * 30 + minutes * 0.5;

    win.querySelectorAll(".dt-hand").forEach(function (hand) {
      var shadow = hand.classList.contains("dt-hand--shadow");
      var hour = hand.classList.contains("dt-hand--hour");
      setHand(hand, hour ? hourDeg : minuteDeg, hour ? 27 : 46, shadow ? 1.5 : 0);
    });

    var text = formatTime(now);
    if (timeField && text !== lastTimeText) {
      timeField.value = text;
      lastTimeText = text;
    }
  }

  /* ----- tabs ----- */

  function selectTab(tab) {
    var tabs = win.querySelectorAll('menu[role="tablist"] button[role="tab"]');
    tabs.forEach(function (button) {
      var on = button === tab;
      button.setAttribute("aria-selected", on ? "true" : "false");
      button.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(button.getAttribute("aria-controls"));
      if (panel) panel.hidden = !on;
    });
  }

  function initTabs() {
    var tabs = win.querySelectorAll('menu[role="tablist"] button[role="tab"]');
    tabs.forEach(function (button) {
      button.addEventListener("click", function () {
        selectTab(button);
      });
      button.addEventListener("keydown", function (e) {
        var dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        var list = Array.prototype.slice.call(tabs);
        var next = list[(list.indexOf(button) + dir + list.length) % list.length];
        selectTab(next);
        next.focus();
      });
    });
  }

  /* ----- open / close ----- */

  function openDialog() {
    if (!win) return;
    var now = new Date();
    selected = now;
    view = new Date(now.getFullYear(), now.getMonth(), 1);
    syncControls();
    renderGrid();
    buildMarks();
    if (zoneName) zoneName.textContent = zoneLabel();
    if (zoneReadonly) zoneReadonly.textContent = zoneLabel();
    lastTimeText = "";
    /* XP always opens on the Date & Time tab. */
    var firstTab = win.querySelector('menu[role="tablist"] button[role="tab"]');
    if (firstTab) selectTab(firstTab);
    if (window.CloutyDesktop && window.CloutyDesktop.openApp) {
      window.CloutyDesktop.openApp("datetime");
    } else {
      win.removeAttribute("data-minimized");
    }
    tick();
  }

  function init() {
    win = document.getElementById("win-datetime");
    if (!win) return;

    grid = document.getElementById("dt-grid");
    monthSel = document.getElementById("dt-month");
    yearInput = document.getElementById("dt-year");
    timeField = document.getElementById("dt-time");
    zoneName = document.getElementById("dt-zone-name");
    zoneReadonly = document.getElementById("dt-zone-readonly");

    if (monthSel) {
      MONTHS.forEach(function (name, index) {
        var option = document.createElement("option");
        option.value = String(index);
        option.textContent = name;
        monthSel.appendChild(option);
      });
      monthSel.addEventListener("change", function () {
        setView(view.getFullYear(), parseInt(monthSel.value, 10));
      });
    }

    if (yearInput) {
      yearInput.addEventListener("change", function () {
        var year = parseInt(yearInput.value, 10);
        if (!isFinite(year) || year < 1601 || year > 9999) {
          syncControls();
          return;
        }
        setView(year, view.getMonth());
      });
      yearInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") yearInput.blur();
      });
    }

    win.querySelectorAll("[data-dt-year]").forEach(function (button) {
      button.addEventListener("click", function () {
        var step = parseInt(button.getAttribute("data-dt-year"), 10) || 0;
        setView(view.getFullYear() + step, view.getMonth());
      });
    });

    if (grid) {
      grid.addEventListener("click", function (e) {
        var cell = e.target.closest(".dt-day");
        if (!cell || cell.classList.contains("is-empty")) return;
        var day = parseInt(cell.getAttribute("data-day"), 10);
        if (!isFinite(day)) return;
        selected = new Date(view.getFullYear(), view.getMonth(), day);
        renderGrid();
      });
    }

    initTabs();

    var clock = document.getElementById("clock-tray");
    if (clock) {
      clock.addEventListener("click", function (e) {
        e.stopPropagation();
        openDialog();
      });
    }

    timer = setInterval(tick, 1000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
