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
  var built = false;

  /* Zones on the map: IANA id, a name, and the longitude its marker sits on */
  var ZONES = [
    { id: "Pacific/Honolulu", label: "Honolulu", lon: -157 },
    { id: "America/Los_Angeles", label: "Los Angeles", lon: -118 },
    { id: "America/Denver", label: "Denver", lon: -105 },
    { id: "America/Chicago", label: "Chicago", lon: -87 },
    { id: "America/New_York", label: "New York", lon: -74 },
    { id: "America/Sao_Paulo", label: "Sao Paulo", lon: -46 },
    { id: "Europe/London", label: "London", lon: 0 },
    { id: "Europe/Moscow", label: "Moscow", lon: 37 },
    { id: "Asia/Kolkata", label: "Kolkata", lon: 77 },
    { id: "Asia/Shanghai", label: "Shanghai", lon: 116 },
    { id: "Asia/Tokyo", label: "Tokyo", lon: 139 },
    { id: "Australia/Sydney", label: "Sydney", lon: 151 },
    { id: "Pacific/Auckland", label: "Auckland", lon: 174 }
  ];

  /* Seven segments, a to g, in a 12 x 22 digit box */
  var SEGMENTS = {
    a: { x: 2, y: 0, w: 8, h: 2 },
    b: { x: 10, y: 2, w: 2, h: 8 },
    c: { x: 10, y: 12, w: 2, h: 8 },
    d: { x: 2, y: 20, w: 8, h: 2 },
    e: { x: 0, y: 12, w: 2, h: 8 },
    f: { x: 0, y: 2, w: 2, h: 8 },
    g: { x: 2, y: 10, w: 8, h: 2 }
  };

  var SEG_ON = {
    "0": "abcdef",
    "1": "bc",
    "2": "abdeg",
    "3": "abcdg",
    "4": "bcfg",
    "5": "acdfg",
    "6": "acdefg",
    "7": "abc",
    "8": "abcdefg",
    "9": "abcdfg"
  };

  var zoneSelect = null;
  var zoneDots = null;
  var zoneWatch = null;
  var watchName = null;
  var watchOffset = null;
  var pickedZone = null;
  var digits = [];
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

  /* ----- time zones: map markers, a picker, and the digital watch ----- */

  function zoneOffsetLabel(id) {
    try {
      var parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: id,
        timeZoneName: "short"
      }).formatToParts(new Date());
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === "timeZoneName") return parts[i].value;
      }
    } catch (e) {}
    return "";
  }

  function zoneClock(id) {
    try {
      var parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: id,
        hourCycle: "h23",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }).formatToParts(new Date());
      var out = "";
      for (var i = 0; i < parts.length; i++) {
        var kind = parts[i].type;
        if (kind === "hour" || kind === "minute" || kind === "second") {
          out += parts[i].value;
        }
      }
      return out;
    } catch (e) {
      return "";
    }
  }

  function localZoneId() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (e) {
      return "";
    }
  }

  function defaultZone() {
    var local = localZoneId();
    var i;
    for (i = 0; i < ZONES.length; i++) {
      if (ZONES[i].id === local) return ZONES[i].id;
    }
    /* Same clock as here, when the exact zone is not on the map */
    var here = local ? zoneOffsetLabel(local) : "";
    if (here) {
      for (i = 0; i < ZONES.length; i++) {
        if (zoneOffsetLabel(ZONES[i].id) === here) return ZONES[i].id;
      }
    }
    return "Europe/London";
  }

  function buildWatch() {
    if (!zoneWatch || digits.length) return;
    var ns = "http://www.w3.org/2000/svg";
    for (var i = 0; i < 6; i++) {
      if (i === 2 || i === 4) {
        var colon = document.createElement("span");
        colon.className = "dt-lcd-colon";
        colon.appendChild(document.createTextNode(":"));
        zoneWatch.appendChild(colon);
      }
      var svg = document.createElementNS(ns, "svg");
      svg.setAttribute("class", "dt-lcd-digit");
      svg.setAttribute("viewBox", "0 0 12 22");
      svg.setAttribute("aria-hidden", "true");
      for (var seg in SEGMENTS) {
        if (!Object.prototype.hasOwnProperty.call(SEGMENTS, seg)) continue;
        var box = SEGMENTS[seg];
        var rect = document.createElementNS(ns, "rect");
        rect.setAttribute("data-seg", seg);
        rect.setAttribute("x", String(box.x));
        rect.setAttribute("y", String(box.y));
        rect.setAttribute("width", String(box.w));
        rect.setAttribute("height", String(box.h));
        rect.setAttribute("rx", "0.6");
        svg.appendChild(rect);
      }
      svg.setAttribute("data-on", SEG_ON["0"].split("").join(" "));
      zoneWatch.appendChild(svg);
      digits.push(svg);
    }
  }

  function renderWatch() {
    if (!zoneWatch) return;
    buildWatch();
    if (!pickedZone) pickedZone = defaultZone();
    var clock = zoneClock(pickedZone) || "000000";
    var i;
    for (i = 0; i < digits.length; i++) {
      var digit = clock.charAt(i);
      /* Space-separated segments: the CSS matches them with [data-on~="a"] */
      digits[i].setAttribute(
        "data-on",
        (SEG_ON[digit] || "").split("").join(" ")
      );
    }
    var entry = null;
    for (i = 0; i < ZONES.length; i++) {
      if (ZONES[i].id === pickedZone) entry = ZONES[i];
    }
    if (watchName) watchName.textContent = entry ? entry.label : pickedZone;
    if (watchOffset) watchOffset.textContent = zoneOffsetLabel(pickedZone);
  }

  function syncZonePicker() {
    if (zoneSelect) zoneSelect.value = pickedZone;
    if (!zoneDots) return;
    zoneDots.querySelectorAll(".dt-zone-dot").forEach(function (dot) {
      dot.setAttribute(
        "aria-pressed",
        dot.getAttribute("data-zone") === pickedZone ? "true" : "false"
      );
    });
  }

  function pickZone(id) {
    pickedZone = id;
    syncZonePicker();
    renderWatch();
  }

  function buildZonePicker() {
    if (zoneSelect && !zoneSelect.options.length) {
      ZONES.forEach(function (zone) {
        var option = document.createElement("option");
        option.value = zone.id;
        var offset = zoneOffsetLabel(zone.id);
        option.textContent = zone.label + (offset ? " (" + offset + ")" : "");
        zoneSelect.appendChild(option);
      });
      zoneSelect.addEventListener("change", function () {
        pickZone(zoneSelect.value);
      });
    }

    if (zoneDots && !zoneDots.childNodes.length) {
      ZONES.forEach(function (zone) {
        var dot = document.createElement("button");
        dot.type = "button";
        dot.className = "dt-zone-dot";
        dot.setAttribute("data-zone", zone.id);
        dot.setAttribute("aria-pressed", "false");
        dot.setAttribute("aria-label", zone.label);
        dot.title = zone.label;
        dot.style.left = (((zone.lon + 180) / 360) * 100).toFixed(2) + "%";
        dot.style.top = "52%";
        dot.addEventListener("click", function () {
          pickZone(zone.id);
        });
        zoneDots.appendChild(dot);
      });
    }

    if (!pickedZone) pickedZone = defaultZone();
    syncZonePicker();
    renderWatch();
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

    renderWatch();
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
    if (!pickedZone) pickedZone = defaultZone();
    syncZonePicker();
    renderWatch();
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
    zoneSelect = document.getElementById("dt-zone-select");
    zoneDots = document.getElementById("dt-zone-dots");
    zoneWatch = document.getElementById("dt-zone-watch");
    watchName = document.getElementById("dt-watch-name");
    watchOffset = document.getElementById("dt-watch-offset");

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
    buildZonePicker();

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
