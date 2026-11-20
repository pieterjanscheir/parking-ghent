// The card an AI assistant shows next to a parking answer (MCP Apps: a small
// HTML page the host renders in a sandboxed frame). It gets the tool's result
// from the host over postMessage and draws it; it fetches nothing itself, so
// it needs no network access beyond the site's two Google Fonts. Links open
// through the host. It copies the website's look (app/globals.css,
// components/parking-card.tsx), so keep the two in step.
//
// Kept as one string with plain JS (no template literals inside the script)
// so it can be served as-is from the MCP route without a build step.

export const PARKING_CARD_URI = "ui://parking/card-v2.html";

// The MIME type MCP Apps hosts look for on a UI resource.
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

export const PARKING_CARD_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Parking</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Raleway:wght@400;500;600&display=swap">
<style>
/* The website's tokens (app/globals.css): light, and dark as the default. */
:root {
  --background: oklch(0.985 0.002 280);
  --foreground: oklch(0.21 0.01 280);
  --card: oklch(1 0 0);
  --primary: oklch(0.5 0.17 273);
  --primary-foreground: oklch(0.99 0.002 280);
  --muted: oklch(0.955 0.004 280);
  --muted-foreground: oklch(0.46 0.012 280);
  --destructive: oklch(0.55 0.22 25);
  --border: oklch(0 0 0 / 13%);
  --gauge-track: oklch(0 0 0 / 0.08);
  --inset: oklch(1 0 0 / 0);
  --sky-fg: oklch(0.5 0.134 242.749);
  --emerald-fg: oklch(0.508 0.118 165.612);
  --amber-fg: oklch(0.555 0.163 48.998);
  --amber-badge-fg: oklch(0.473 0.137 46.201);
  --radius: 0.5rem;
  --font-heading: "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-sans: "Raleway", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  color-scheme: light;
}
:root[data-theme="dark"] {
  --background: oklch(0.23 0.005 280);
  --foreground: oklch(0.965 0.002 280);
  --card: oklch(0.275 0.006 280);
  --primary: oklch(0.6 0.155 273);
  --muted: oklch(0.305 0.006 280);
  --muted-foreground: oklch(0.70 0.008 280);
  --destructive: oklch(0.66 0.21 25);
  --border: oklch(1 0 0 / 12%);
  --gauge-track: oklch(1 0 0 / 0.07);
  --inset: oklch(1 0 0 / 0.04);
  --sky-fg: oklch(0.828 0.111 230.318);
  --emerald-fg: oklch(0.845 0.143 164.978);
  --amber-fg: oklch(0.879 0.169 91.605);
  --amber-badge-fg: oklch(0.924 0.12 95.746);
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: transparent; }
body { font-family: var(--font-sans); color: var(--foreground); font-size: 14px; line-height: 1.45; -webkit-font-smoothing: antialiased; }
svg.i { width: 14px; height: 14px; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
svg.i.s3 { width: 12px; height: 12px; }
.app { background: var(--background); border: 1px solid var(--border); border-radius: calc(var(--radius) * 1.8); padding: 14px; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.brand { display: inline-flex; align-items: center; gap: 10px; }
.logo { display: flex; width: 28px; height: 28px; align-items: center; justify-content: center; border-radius: var(--radius); color: var(--primary);
  background: color-mix(in oklch, var(--primary) 15%, transparent); box-shadow: 0 0 0 1px color-mix(in oklch, var(--primary) 25%, transparent); }
.logo svg.i { width: 16px; height: 16px; }
.brand b { font-family: var(--font-heading); font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
.live { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted-foreground); }
.live .dot { width: 6px; height: 6px; border-radius: 99px; background: oklch(0.72 0.17 142); box-shadow: 0 0 6px oklch(0.72 0.17 142 / 0.6); }
.advice { border-radius: calc(var(--radius) * 1.4); border: 1px solid color-mix(in oklch, var(--primary) 40%, transparent);
  background: color-mix(in oklch, var(--primary) 5%, transparent); padding: 16px; }
.eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; color: var(--primary); }
.title { font-family: var(--font-heading); font-size: 20px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; margin: 8px 0 0; cursor: pointer; }
.title:hover { text-decoration: underline; text-underline-offset: 4px; }
.subline { display: flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 12px; color: var(--muted-foreground); min-width: 0; }
.subline .trunc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.subline .em { color: color-mix(in oklch, var(--foreground) 80%, transparent); white-space: nowrap; }
.stat { display: flex; align-items: center; gap: 16px; margin-top: 14px; }
.gauge { position: relative; flex-shrink: 0; }
.gauge svg { transform: rotate(-90deg); width: 100%; height: 100%; display: block; }
.gauge span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: var(--font-heading); font-weight: 600; font-variant-numeric: tabular-nums; }
.big { display: flex; align-items: center; gap: 6px; }
.big .n { font-family: var(--font-heading); font-size: 30px; font-weight: 700; line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.of { font-size: 12px; color: var(--muted-foreground); }
.hint { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; margin-top: 4px; color: var(--muted-foreground); }
.hint.warn { color: var(--amber-fg); } .hint.good { color: var(--emerald-fg); }
.trend { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 99px; border: 1px solid; }
.trend svg.i { width: 12px; height: 12px; }
.trend.up { color: var(--destructive); border-color: color-mix(in oklch, var(--destructive) 40%, transparent); background: color-mix(in oklch, var(--destructive) 10%, transparent); }
.trend.down { color: var(--emerald-fg); border-color: oklch(0.765 0.177 163.223 / 0.4); background: oklch(0.765 0.177 163.223 / 0.1); }
.trend.flat { color: var(--muted-foreground); border-color: color-mix(in oklch, var(--border) 60%, transparent); background: color-mix(in oklch, var(--muted) 40%, transparent); }
.badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
.badge { display: inline-flex; align-items: center; gap: 4px; border-radius: calc(var(--radius) * 2.6); border: 1px solid; padding: 2px 8px; font-size: 12px; font-weight: 500; }
.badge .d { width: 6px; height: 6px; border-radius: 99px; background: currentColor; }
.b-open { color: var(--primary); border-color: color-mix(in oklch, var(--primary) 30%, transparent); background: color-mix(in oklch, var(--primary) 10%, transparent); }
.b-closed { color: var(--destructive); border-color: color-mix(in oklch, var(--destructive) 30%, transparent); background: color-mix(in oklch, var(--destructive) 10%, transparent); }
.b-meta { color: var(--muted-foreground); font-weight: 400; border-color: color-mix(in oklch, var(--border) 60%, transparent); background: color-mix(in oklch, var(--card) 40%, transparent); }
.b-pr { color: var(--sky-fg); border-color: oklch(0.746 0.16 232.661 / 0.3); background: oklch(0.746 0.16 232.661 / 0.1); }
.b-free { color: var(--emerald-fg); border-color: oklch(0.765 0.177 163.223 / 0.3); background: oklch(0.765 0.177 163.223 / 0.1); }
.b-ev { color: var(--amber-badge-fg); border-color: oklch(0.879 0.169 91.605 / 0.3); background: oklch(0.879 0.169 91.605 / 0.1); }
.why { margin-top: 12px; font-size: 12px; color: var(--muted-foreground); }
.actions { display: flex; gap: 8px; margin-top: 14px; }
.actions .btn { flex: 1 1 0; min-width: 0; padding: 0 8px; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; padding: 0 10px; border-radius: calc(var(--radius) * 0.8);
  font: 500 13px/1 var(--font-sans); cursor: pointer; border: 1px solid var(--border); background: var(--background); color: var(--foreground); transition: background .2s, transform .1s; }
.btn:hover { background: var(--muted); }
.btn:active { transform: translateY(1px); }
.btn.primary { background: var(--primary); border-color: transparent; color: var(--primary-foreground); }
.btn.primary:hover { background: color-mix(in oklch, var(--primary) 80%, transparent); }
.btn:focus-visible, .row:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in oklch, var(--primary) 50%, transparent); }
.pr-line { margin-top: 12px; padding-top: 10px; border-top: 1px solid color-mix(in oklch, var(--primary) 15%, transparent); font-size: 12px; color: var(--muted-foreground); }
.pr-line b { color: var(--foreground); font-weight: 500; }
.label { margin: 18px 2px 8px; font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted-foreground); }
.rows { display: flex; flex-direction: column; gap: 8px; }
.row { position: relative; display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: calc(var(--radius) * 1.4); border: 1px solid color-mix(in oklch, var(--border) 70%, transparent);
  background-color: var(--card); background-image: linear-gradient(180deg, oklch(1 0 0 / 0.015) 0%, transparent 60%); box-shadow: 0 1px 0 var(--inset) inset;
  cursor: pointer; transition: transform .3s, border-color .3s, box-shadow .3s; overflow: hidden; }
.row:hover { transform: translateY(-2px); border-color: color-mix(in oklch, var(--primary) 40%, transparent);
  box-shadow: 0 0 0 1px oklch(0.66 0.19 258 / 0.25), 0 18px 40px -20px oklch(0.66 0.19 258 / 0.45); }
.row .mid { flex: 1; min-width: 0; }
.row .name { font-family: var(--font-heading); font-size: 15px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .subline { margin-top: 2px; }
.row .right { text-align: right; flex-shrink: 0; }
.row .right .big { justify-content: flex-end; }
.row .right .n { font-size: 20px; }
.row.nocount .right .n { font-size: 15px; color: var(--muted-foreground); font-weight: 600; }
.nogauge { width: 44px; height: 44px; border-radius: 99px; border: 3px solid var(--gauge-track); display: flex; align-items: center; justify-content: center; color: var(--muted-foreground); font: 600 11px var(--font-heading); flex-shrink: 0; }
.foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 14px; font-size: 12px; color: var(--muted-foreground); }
.foot a { display: inline-flex; align-items: center; gap: 4px; color: var(--primary); font-weight: 500; cursor: pointer; text-decoration: none; }
.foot a:hover { text-decoration: underline; text-underline-offset: 4px; }
.skel { height: 180px; border-radius: calc(var(--radius) * 1.4); background: linear-gradient(90deg, var(--muted), var(--card), var(--muted)); background-size: 200% 100%; animation: sh 1.2s linear infinite; }
@keyframes sh { to { background-position: -200% 0; } }
.err { color: var(--destructive); font-size: 13px; margin: 0; }
.note { font-size: 13px; color: var(--muted-foreground); margin: 8px 0 0; }
</style>
</head>
<body>
<div id="root"><div class="app"><div class="top"><span class="brand"><span class="logo"></span><b>Parking</b></span></div><div class="skel"></div></div></div>
<script>
(function () {
  "use strict";
  var root = document.getElementById("root");
  var nextId = 1;
  var pending = {};

  // ---- talking to the host (JSON-RPC over postMessage) ----
  function send(msg) { window.parent.postMessage(msg, "*"); }
  function request(method, params) {
    var id = nextId++;
    send({ jsonrpc: "2.0", id: id, method: method, params: params || {} });
    return new Promise(function (resolve, reject) { pending[id] = { resolve: resolve, reject: reject }; });
  }
  function notify(method, params) { send({ jsonrpc: "2.0", method: method, params: params || {} }); }

  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var msg = event.data;
    if (!msg || msg.jsonrpc !== "2.0") return;
    if (msg.id !== undefined && pending[msg.id] && !msg.method) {
      var p = pending[msg.id]; delete pending[msg.id];
      if (msg.error) p.reject(msg.error); else p.resolve(msg.result);
      return;
    }
    switch (msg.method) {
      case "ui/notifications/tool-input": onInput(msg.params && msg.params.arguments); break;
      case "ui/notifications/tool-result": onResult(msg.params); break;
      case "ui/notifications/host-context-changed": applyContext(msg.params); break;
      case "ui/notifications/tool-cancelled": root.innerHTML = '<div class="app"><p class="note" style="margin:0">Cancelled.</p></div>'; break;
      case "ui/resource-teardown": send({ jsonrpc: "2.0", id: msg.id, result: {} }); break;
      case "ping": if (msg.id !== undefined) send({ jsonrpc: "2.0", id: msg.id, result: {} }); break;
    }
  });

  function applyContext(ctx) {
    if (!ctx) return;
    if (ctx.theme) document.documentElement.setAttribute("data-theme", ctx.theme);
  }

  // Dark, like the website, until the host says otherwise.
  document.documentElement.setAttribute("data-theme", "dark");

  request("ui/initialize", {
    appInfo: { name: "parking-card", version: "2.0.0" },
    appCapabilities: {},
    protocolVersion: "2026-01-26"
  }).then(function (res) {
    applyContext(res && res.hostContext);
    notify("ui/notifications/initialized");
  }, function () {});

  // Tell the host how tall the card is, whenever that changes.
  var lastH = 0;
  function reportSize() {
    var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (h !== lastH) { lastH = h; notify("ui/notifications/size-changed", { height: h }); }
  }
  if (window.ResizeObserver) new ResizeObserver(reportSize).observe(document.documentElement);

  function openLink(url) {
    if (!url) return;
    request("ui/open-link", { url: url }).then(function (r) {
      if (r && r.isError) window.open(url, "_blank", "noopener");
    }, function () { window.open(url, "_blank", "noopener"); });
  }
  root.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-href]") : null;
    if (el) { e.preventDefault(); openLink(el.getAttribute("data-href")); }
  });

  // ---- drawing (mirrors components/parking-card.tsx and destination-advice.tsx) ----
  var ICONS = {
    parking: '<circle cx="12" cy="12" r="10"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
    sparkles: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
    pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    walk: '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/>',
    nav: '<polygon points="12 2 19 21 12 17 5 21 12 2"/>',
    ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    up: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
    down: '<path d="M16 17h6v-6"/><path d="m22 17-8.5-8.5-5 5L2 7"/>',
    flat: '<path d="M5 12h14"/>'
  };
  function icon(name, cls) { return '<svg class="i' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + "</svg>"; }
  var logo = root.querySelector(".logo"); if (logo) logo.innerHTML = icon("parking");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(n) { return Number(n).toLocaleString("en-US"); }
  function km(m) { return m >= 1000 ? (m / 1000).toFixed(1) + " km" : m + " m"; }
  function percent(g) {
    if (g.free_spaces == null || !g.total_spaces) return null;
    return Math.max(0, Math.min(100, (g.free_spaces / g.total_spaces) * 100));
  }
  // Same buckets and colours as the website (lib/parkings.schema.ts, availability-gauge.tsx).
  var BUCKET_COLOR = { available: "oklch(0.72 0.17 142)", "almost-full": "oklch(0.75 0.16 70)", full: "oklch(0.66 0.21 25)", closed: "oklch(0.5 0.005 280)" };
  function bucket(g) {
    var p = percent(g);
    if (!g.open || p == null) return "closed";
    return p < 5 ? "full" : p < 20 ? "almost-full" : "available";
  }
  function gauge(g, size) {
    var p = percent(g) || 0, color = BUCKET_COLOR[bucket(g)], C = 97.39, dash = (p / 100) * C;
    return '<div class="gauge" style="width:' + size + "px;height:" + size + 'px"><svg viewBox="0 0 36 36">' +
      '<circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--gauge-track)" stroke-width="3"/>' +
      '<circle cx="18" cy="18" r="15.5" fill="none" stroke="' + color + '" stroke-width="3" stroke-linecap="round" stroke-dasharray="' +
      dash.toFixed(2) + " " + (C - dash).toFixed(2) + '"/></svg>' +
      '<span style="font-size:' + (size >= 60 ? 12 : 10) + 'px">' + Math.round(p) + "%</span></div>";
  }
  // Direction of the forecast, as on the website: "up" = filling up.
  function forecastOf(g) {
    var f = g.forecast;
    if (!f || !g.open || g.free_spaces == null) return null;
    var e = f.expected_free_spaces || [];
    // Like the website: what to expect about half an hour from now.
    var last = null, minutes = 30, bestGap = Infinity;
    for (var i = 0; i < e.length; i++) {
      var mins = (Date.parse(e[i].at) - Date.now()) / 60000, gap = Math.abs(mins - 30);
      if (gap < bestGap) { bestGap = gap; last = e[i]; minutes = Math.max(5, Math.round(mins / 5) * 5); }
    }
    var delta = last ? last.free_spaces - g.free_spaces : 0;
    var steady = !last || Math.abs(delta) < Math.max(3, g.total_spaces * 0.02);
    var dir = steady ? "flat" : delta < 0 ? "up" : "down";
    var hint;
    if (f.likely_full_in_minutes != null) hint = { tone: "warn", text: "Likely full in ~" + f.likely_full_in_minutes + " min" };
    else if (steady) hint = { tone: "", text: "Stable for the next " + minutes + " min" };
    else hint = { tone: dir === "up" ? "warn" : "good", text: "~" + num(last.free_spaces) + " free in " + minutes + " min" };
    return { dir: f.likely_full_in_minutes != null ? "up" : dir, hint: hint };
  }
  function trendChip(fc) {
    if (!fc) return "";
    var label = fc.dir === "up" ? "Filling up" : fc.dir === "down" ? "Emptying out" : "Holding steady";
    return '<span class="trend ' + fc.dir + '" role="img" aria-label="' + label + '" title="' + label + '">' + icon(fc.dir) + "</span>";
  }
  function distance(g) {
    if (g.distance_m == null) return "";
    return km(g.distance_m) + " · ~" + g.walking_minutes + " min walk";
  }
  function badges(g) {
    var out = [];
    out.push(g.open ? '<span class="badge b-open"><span class="d"></span>Open</span>' : '<span class="badge b-closed"><span class="d"></span>Closed</span>');
    if (g.inside_low_emission_zone === true) out.push('<span class="badge b-meta">Inside LEZ</span>');
    if (g.inside_low_emission_zone === false) out.push('<span class="badge b-meta">Outside LEZ</span>');
    if (g.park_and_ride) out.push('<span class="badge b-pr" title="Park &amp; Ride">P+R</span>');
    if (g.free_of_charge) out.push('<span class="badge b-free">Free</span>');
    if (g.ev_charge_points) out.push('<span class="badge b-ev" title="' + g.ev_charge_points + ' charge points">' + icon("zap", "s3") + g.ev_charge_points + "</span>");
    return '<div class="badges">' + out.join("") + "</div>";
  }
  function subline(g) {
    var d = distance(g);
    if (!g.address && !d) return "";
    return '<p class="subline">' + icon("pin", "s3") +
      (g.address ? '<span class="trunc">' + esc(g.address) + "</span>" : "") +
      (d ? '<span class="em">' + (g.address ? "· " : "") + esc(d) + "</span>" : "") + "</p>";
  }
  function ago(iso) {
    if (!iso) return "";
    var m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (!isFinite(m)) return "";
    return m <= 1 ? "updated just now" : m < 60 ? "updated " + m + " min ago" : "updated " + Math.round(m / 60) + " h ago";
  }
  function driveUrl(g) {
    var p = g.position;
    return p ? "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=" + encodeURIComponent(p.lat + "," + p.lng) : null;
  }
  function walkUrl(g, dest) {
    var p = g.position;
    if (!p || !dest) return null;
    return "https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=" + encodeURIComponent(p.lat.toFixed(5) + "," + p.lng.toFixed(5)) +
      "&destination=" + encodeURIComponent(dest.lat.toFixed(5) + "," + dest.lng.toFixed(5));
  }

  // The highlighted answer: the advice panel with the garage's live state.
  function advice(g, title, why, dest, extra) {
    var fc = forecastOf(g);
    var drive = driveUrl(g), walkTo = walkUrl(g, dest);
    var count = g.free_spaces == null
      ? '<div class="big"><span class="n" style="color:var(--muted-foreground)">—</span></div><span class="of">no live count</span>'
      : '<div class="big"><span class="n">' + num(g.free_spaces) + "</span>" + trendChip(fc) + '</div><span class="of">of ' + num(g.total_spaces) + " free</span>" +
        (fc ? '<span class="hint ' + fc.hint.tone + '">' + icon("clock", "s3") + esc(fc.hint.text) + "</span>" : "");
    return '<section class="advice">' +
      (title ? '<p class="eyebrow">' + icon("sparkles") + esc(title) + "</p>" : "") +
      '<p class="title"' + (g.url ? ' data-href="' + esc(g.url) + '"' : "") + ">" + esc(g.name) + "</p>" +
      subline(g) +
      '<div class="stat">' + gauge(g, 64) + '<div style="display:flex;flex-direction:column">' + count + "</div></div>" +
      badges(g) +
      (why ? '<p class="why">' + esc(why) + "</p>" : "") +
      '<div class="actions">' +
        (drive ? '<button class="btn primary" data-href="' + esc(drive) + '">' + icon("nav") + "Navigate</button>" : "") +
        (walkTo ? '<button class="btn" data-href="' + esc(walkTo) + '">' + icon("walk") + "Walk</button>" : "") +
        (g.url ? '<button class="btn" data-href="' + esc(g.url) + '">' + icon("ext") + "Details</button>" : "") +
      "</div>" + (extra || "") + "</section>";
  }

  function row(g) {
    var fc = forecastOf(g);
    var counted = g.free_spaces != null;
    var right = counted
      ? '<div class="right"><div class="big"><span class="n">' + num(g.free_spaces) + "</span>" + trendChip(fc) + '</div><span class="of">of ' + num(g.total_spaces) + " free</span></div>"
      : '<div class="right"><div class="big"><span class="n">' + (g.total_spaces ? num(g.total_spaces) : "—") + '</span></div><span class="of">spaces · no live count</span></div>';
    var tags = [];
    if (g.park_and_ride) tags.push('<span class="badge b-pr">P+R</span>');
    if (g.free_of_charge) tags.push('<span class="badge b-free">Free</span>');
    if (g.ev_charge_points) tags.push('<span class="badge b-ev">' + icon("zap", "s3") + g.ev_charge_points + "</span>");
    return '<div class="row' + (counted ? "" : " nocount") + '" tabindex="0"' + (g.url ? ' data-href="' + esc(g.url) + '"' : "") + ">" +
      (counted ? gauge(g, 44) : '<div class="nogauge">—</div>') +
      '<div class="mid"><div class="name">' + esc(g.name) + "</div>" +
      (g.distance_m != null ? '<p class="subline">' + icon("pin", "s3") + '<span class="em">' + esc(distance(g)) + "</span></p>" : subline(g)) +
      (tags.length ? '<div class="badges" style="margin-top:6px">' + tags.join("") + "</div>" : "") +
      "</div>" + right + "</div>";
  }

  function rows(title, list) {
    if (!list || !list.length) return "";
    return '<p class="label">' + esc(title) + '</p><div class="rows">' + list.map(row).join("") + "</div>";
  }

  function frame(city, updated, body, d, link) {
    return '<div class="app"><div class="top"><span class="brand"><span class="logo">' + icon("parking") + "</span><b>" + esc(city) + " Parking</b></span>" +
      (updated ? '<span class="live"><span class="dot"></span>' + esc(updated) + "</span>" : "") + "</div>" + body +
      '<div class="foot"><span>' + esc((d.source || "").split(", via")[0]) + "</span>" +
      (link ? '<a data-href="' + esc(link) + '">Open on the website' + icon("ext", "s3") + "</a>" : "") + "</div></div>";
  }

  function renderFind(d) {
    var best = d.best_choice, body = "";
    var why = d.why_not_the_nearest || (best ? "It is also the nearest garage." : null);
    var pr = d.nearest_park_and_ride;
    var prLine = best && pr && pr.id !== best.id
      ? '<p class="pr-line">Nearest Park &amp; Ride: <b>' + esc(pr.name) + "</b> (" + km(pr.distance_m) + ")</p>" : "";
    if (best) body += advice(best, "Best choice for " + d.destination.name, why, d.destination, prLine);
    else body += '<section class="advice"><p class="eyebrow">' + icon("sparkles") + "Parking near " + esc(d.destination.name) + '</p><p class="note">' +
      esc(d.note || "No garage with room nearby right now.") + "</p></section>";
    body += rows("Also with space", d.other_garages_with_space);
    body += rows("Nearby, no live count", d.nearest_car_parks_without_live_count);
    return frame(d.city, best ? ago(best.count_updated_at) : "", body, d, d.see_on_the_website);
  }

  function renderList(d) {
    var live = d.garages_with_live_count || [];
    var body = d.note ? '<section class="advice"><p class="note" style="margin:0">' + esc(d.note) + "</p></section>" : "";
    body += rows(live.length + " garages with a live count", live);
    body += rows("No live count", (d.car_parks_without_live_count || []).slice(0, 8));
    return frame(d.city, live[0] ? ago(live[0].count_updated_at) : "", body.replace(/^<p class="label">/, '<p class="label" style="margin-top:4px">'), d, null);
  }

  function renderOne(d) {
    var body = advice(d, "", d.city_remark, null);
    if (d.opening_hours) body += '<p class="note">Open: ' + esc(d.opening_hours) + "</p>";
    return frame(d.city || "", ago(d.count_updated_at), body, d, null);
  }

  function onInput(args) {
    if (!args) return;
    var where = args.destination || args.garage;
    var b = root.querySelector(".brand b");
    if (where && b && root.querySelector(".skel")) b.textContent = "Finding parking near " + where + "…";
  }

  function onResult(res) {
    var d = res && res.structuredContent;
    if (!d && res && res.content && res.content[0] && res.content[0].type === "text") {
      try { d = JSON.parse(res.content[0].text); } catch (e) { d = null; }
    }
    if (!d || (res && res.isError)) {
      var text = res && res.content && res.content[0] ? res.content[0].text : "Something went wrong.";
      root.innerHTML = '<div class="app"><p class="err">' + esc(text) + "</p></div>";
      return;
    }
    try {
      if ("best_choice" in d) root.innerHTML = renderFind(d);
      else if ("garages_with_live_count" in d) root.innerHTML = renderList(d);
      else if (d.name) root.innerHTML = renderOne(d);
    } catch (e) {
      root.innerHTML = '<div class="app"><p class="err">Could not draw this answer.</p></div>';
    }
    reportSize();
  }
})();
</script>
</body>
</html>`;
