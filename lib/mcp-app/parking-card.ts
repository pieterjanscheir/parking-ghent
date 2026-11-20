// The card an AI assistant shows next to a parking answer (MCP Apps: a small
// HTML page the host renders in a sandboxed frame). It gets the tool's result
// from the host over postMessage and draws it; it fetches nothing itself, so
// it needs no network access. Links open through the host.
//
// Kept as one string with plain JS (no template literals inside the script)
// so it can be served as-is from the MCP route without a build step.

export const PARKING_CARD_URI = "ui://parking/card-v1.html";

// The MIME type MCP Apps hosts look for on a UI resource.
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

export const PARKING_CARD_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Parking</title>
<style>
:root {
  color-scheme: light dark;
  --bg: var(--color-background-primary, #ffffff);
  --bg-2: var(--color-background-secondary, #f4f4f6);
  --text: var(--color-text-primary, #18181b);
  --text-2: var(--color-text-secondary, #5b5b66);
  --border: var(--color-border-tertiary, rgba(0,0,0,.09));
  --accent: #5b5bd6;
  --good: #16a34a;
  --warn: #d97706;
  --bad: #dc2626;
  --radius: var(--border-radius-lg, 14px);
  --font: var(--font-sans, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
}
:root[data-theme="dark"] {
  --bg: var(--color-background-primary, #2a2a30);
  --bg-2: var(--color-background-secondary, #33333a);
  --text: var(--color-text-primary, #f4f4f6);
  --text-2: var(--color-text-secondary, #a6a6b3);
  --border: var(--color-border-tertiary, rgba(255,255,255,.1));
  --accent: #6c6ce6;
  --good: #4ade80;
  --warn: #fbbf24;
  --bad: #f87171;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: transparent; }
body { font-family: var(--font); color: var(--text); font-size: 14px; line-height: 1.4; -webkit-font-smoothing: antialiased; }
#root { padding: 2px; }
.head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 2px 2px 10px; }
.head h1 { font-size: 15px; font-weight: 600; margin: 0; }
.head .sub { color: var(--text-2); font-size: 12px; white-space: nowrap; }
.card { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }
.best { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
.tag { display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--accent); margin-bottom: 4px; }
.row1 { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.name { font-size: 17px; font-weight: 600; margin: 0; }
.addr { color: var(--text-2); font-size: 12.5px; margin-top: 1px; }
.count { text-align: right; flex-shrink: 0; }
.count .n { font-size: 26px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
.count .of { color: var(--text-2); font-size: 12px; }
.bar { height: 6px; border-radius: 99px; background: var(--bg-2); overflow: hidden; margin: 12px 0 10px; }
.bar > i { display: block; height: 100%; border-radius: 99px; }
.meta { display: flex; flex-wrap: wrap; gap: 6px 14px; color: var(--text-2); font-size: 12.5px; }
.meta b { color: var(--text); font-weight: 600; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.chip { font-size: 11.5px; padding: 3px 8px; border-radius: 99px; background: var(--bg-2); color: var(--text-2); }
.chip.ok { color: var(--good); background: color-mix(in srgb, var(--good) 12%, transparent); }
.chip.warn { color: var(--warn); background: color-mix(in srgb, var(--warn) 14%, transparent); }
.chip.bad { color: var(--bad); background: color-mix(in srgb, var(--bad) 12%, transparent); }
.note { font-size: 12.5px; color: var(--text-2); margin-top: 10px; }
.actions { display: flex; gap: 8px; margin-top: 12px; }
button.btn { font: inherit; font-size: 13px; font-weight: 600; border-radius: 10px; padding: 8px 12px; cursor: pointer; border: 1px solid var(--border); background: var(--bg-2); color: var(--text); flex: 1; }
button.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
button.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.section { margin: 14px 2px 6px; font-size: 12px; font-weight: 600; color: var(--text-2); }
.list { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.item { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; padding: 10px 14px; border-top: 1px solid var(--border); cursor: pointer; }
.item:first-child { border-top: 0; }
.item:hover { background: var(--bg-2); }
.item .t { font-weight: 600; font-size: 14px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item .s { color: var(--text-2); font-size: 12px; grid-column: 1; }
.item .r { grid-row: 1 / span 2; grid-column: 2; text-align: right; align-self: center; }
.item .r .n { font-weight: 700; font-size: 16px; font-variant-numeric: tabular-nums; }
.item .r .of { display: block; color: var(--text-2); font-size: 11px; }
.item .mini { grid-column: 1; height: 4px; border-radius: 99px; background: var(--bg-2); overflow: hidden; margin-top: 4px; max-width: 160px; }
.item .mini > i { display: block; height: 100%; }
.muted .n { color: var(--text-2); font-weight: 500; font-size: 13px; }
.foot { color: var(--text-2); font-size: 11.5px; margin: 10px 2px 2px; display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.foot a { color: var(--accent); text-decoration: none; cursor: pointer; }
.skel { height: 120px; border-radius: var(--radius); background: linear-gradient(90deg, var(--bg-2), var(--bg), var(--bg-2)); background-size: 200% 100%; animation: sh 1.2s linear infinite; }
@keyframes sh { to { background-position: -200% 0; } }
.err { color: var(--bad); }
</style>
</head>
<body>
<div id="root"><div class="head"><h1>Finding parking…</h1></div><div class="skel"></div></div>
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
      case "ui/notifications/tool-cancelled": root.innerHTML = '<p class="note">Cancelled.</p>'; break;
      case "ui/resource-teardown": send({ jsonrpc: "2.0", id: msg.id, result: {} }); break;
      case "ping": if (msg.id !== undefined) send({ jsonrpc: "2.0", id: msg.id, result: {} }); break;
    }
  });

  function applyContext(ctx) {
    if (!ctx) return;
    if (ctx.theme) document.documentElement.setAttribute("data-theme", ctx.theme);
    var vars = ctx.styles && ctx.styles.variables;
    if (vars) for (var k in vars) if (vars[k]) document.documentElement.style.setProperty(k, vars[k]);
  }

  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    document.documentElement.setAttribute("data-theme", "dark");
  }

  request("ui/initialize", {
    appInfo: { name: "parking-card", version: "1.0.0" },
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

  // ---- drawing ----
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(n) { return Number(n).toLocaleString("en-US"); }
  function share(g) {
    if (g.free_spaces == null || !g.total_spaces) return null;
    return Math.max(0, Math.min(1, g.free_spaces / g.total_spaces));
  }
  function tone(g) {
    if (!g.open) return "bad";
    var s = share(g);
    if (s == null) return "";
    if (g.forecast && g.forecast.likely_full_in_minutes != null && g.forecast.likely_full_in_minutes <= 30) return "warn";
    return s > 0.25 ? "ok" : s > 0.08 ? "warn" : "bad";
  }
  function color(t) { return t === "ok" ? "var(--good)" : t === "warn" ? "var(--warn)" : t === "bad" ? "var(--bad)" : "var(--text-2)"; }
  function walk(g) {
    if (g.walking_minutes == null) return "";
    var d = g.distance_m >= 1000 ? (g.distance_m / 1000).toFixed(1) + " km" : g.distance_m + " m";
    return g.walking_minutes + " min walk · " + d;
  }
  function ago(iso) {
    if (!iso) return "";
    var m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (!isFinite(m)) return "";
    return m <= 1 ? "updated just now" : m < 60 ? "updated " + m + " min ago" : "updated " + Math.round(m / 60) + " h ago";
  }
  function trend(g) {
    var f = g.forecast;
    if (!f) return null;
    if (f.likely_full_in_minutes != null) return { t: "warn", s: "Likely full in ~" + f.likely_full_in_minutes + " min" };
    var e = f.expected_free_spaces || [];
    if (!e.length || g.free_spaces == null) return null;
    var diff = e[e.length - 1].free_spaces - g.free_spaces;
    var rel = g.total_spaces ? Math.abs(diff) / g.total_spaces : 0;
    if (rel < 0.03) return { t: "", s: "Steady next hour" };
    return diff < 0 ? { t: "warn", s: "Filling up (~" + num(-diff) + " fewer in 1 h)" } : { t: "ok", s: "Emptying (~" + num(diff) + " more in 1 h)" };
  }
  function routeUrl(g) {
    var p = g.position;
    if (!p || p.lat == null) return null;
    return "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + encodeURIComponent(p.lat + "," + p.lng);
  }

  function chips(g) {
    var out = [];
    var tr = trend(g);
    if (!g.open) out.push('<span class="chip bad">Closed</span>');
    if (tr) out.push('<span class="chip ' + tr.t + '">' + esc(tr.s) + "</span>");
    if (g.park_and_ride) out.push('<span class="chip">Park &amp; Ride</span>');
    if (g.free_of_charge) out.push('<span class="chip ok">Free of charge</span>');
    if (g.ev_charge_points) out.push('<span class="chip">' + g.ev_charge_points + " EV chargers</span>");
    if (g.inside_low_emission_zone === true) out.push('<span class="chip warn">Inside LEZ</span>');
    if (g.inside_low_emission_zone === false) out.push('<span class="chip">Outside LEZ</span>');
    return out.length ? '<div class="chips">' + out.join("") + "</div>" : "";
  }

  function bigCard(g, label, why) {
    var s = share(g), t = tone(g);
    var meta = [];
    if (g.walking_minutes != null) meta.push("<span><b>" + g.walking_minutes + " min</b> walk · " + esc(walk(g).split(" · ")[1]) + "</span>");
    if (g.usually_free_at_this_hour) meta.push("<span>usually " + num(g.usually_free_at_this_hour.free_spaces) + " free now</span>");
    if (g.count_updated_at) meta.push("<span>" + esc(ago(g.count_updated_at)) + "</span>");
    var route = routeUrl(g);
    return '<div class="card best">' +
      (label ? '<div class="tag">' + esc(label) + "</div>" : "") +
      '<div class="row1"><div><p class="name">' + esc(g.name) + "</p>" +
      (g.address ? '<div class="addr">' + esc(g.address) + "</div>" : "") + "</div>" +
      '<div class="count">' + (g.free_spaces == null
        ? '<div class="of">no live count</div>'
        : '<div class="n" style="color:' + color(t) + '">' + num(g.free_spaces) + '</div><div class="of">of ' + num(g.total_spaces) + " free</div>") +
      "</div></div>" +
      (s == null ? "" : '<div class="bar"><i style="width:' + Math.round(s * 100) + "%;background:" + color(t) + '"></i></div>') +
      (meta.length ? '<div class="meta">' + meta.join("<span>·</span>") + "</div>" : "") +
      chips(g) +
      (why ? '<div class="note">' + esc(why) + "</div>" : "") +
      ((route || g.url) ? '<div class="actions">' +
        (route ? '<button class="btn primary" data-href="' + esc(route) + '">Route</button>' : "") +
        (g.url ? '<button class="btn" data-href="' + esc(g.url) + '">Details</button>' : "") + "</div>" : "") +
      "</div>";
  }

  function item(g) {
    var s = share(g), t = tone(g);
    var sub = [walk(g), g.park_and_ride ? "P+R" : "", g.free_of_charge ? "free" : ""].filter(Boolean).join(" · ");
    var right = g.free_spaces == null
      ? '<div class="r muted"><span class="n">' + (g.total_spaces ? num(g.total_spaces) + " spaces" : "") + '</span><span class="of">no live count</span></div>'
      : '<div class="r"><span class="n" style="color:' + color(t) + '">' + num(g.free_spaces) + '</span><span class="of">of ' + num(g.total_spaces) + "</span></div>";
    return '<div class="item"' + (g.url ? ' data-href="' + esc(g.url) + '"' : "") + ">" +
      '<div class="t">' + esc(g.name) + "</div>" + right +
      (sub ? '<div class="s">' + esc(sub) + "</div>" : "") +
      (s == null ? "" : '<div class="mini"><i style="width:' + Math.round(s * 100) + "%;background:" + color(t) + '"></i></div>') +
      "</div>";
  }

  function list(title, rows) {
    if (!rows || !rows.length) return "";
    return '<div class="section">' + esc(title) + '</div><div class="list">' + rows.map(item).join("") + "</div>";
  }

  function foot(d, link) {
    return '<div class="foot"><span>' + esc((d.source || "").split(", via")[0]) + "</span>" +
      (link ? '<a data-href="' + esc(link) + '">Open on the website →</a>' : "") + "</div>";
  }

  function head(title, sub) {
    return '<div class="head"><h1>' + esc(title) + "</h1>" + (sub ? '<span class="sub">' + esc(sub) + "</span>" : "") + "</div>";
  }

  function renderFind(d) {
    var html = head("Parking near " + d.destination.name, d.city);
    if (d.best_choice) html += bigCard(d.best_choice, "Best choice", d.why_not_the_nearest);
    else if (d.note) html += '<div class="card"><div class="note" style="margin:0">' + esc(d.note) + "</div></div>";
    else html += '<div class="card"><div class="note" style="margin:0">No garage with room nearby right now.</div></div>';
    html += list("Also with space", d.other_garages_with_space);
    html += list("Nearby, no live count", d.nearest_car_parks_without_live_count);
    if (d.nearest_park_and_ride && !(d.best_choice && d.best_choice.id === d.nearest_park_and_ride.id)) {
      var r = d.nearest_park_and_ride;
      html += '<div class="note" style="margin:10px 2px 0">Nearest Park &amp; Ride: <b>' + esc(r.name) + "</b> (" +
        (r.distance_m >= 1000 ? (r.distance_m / 1000).toFixed(1) + " km" : r.distance_m + " m") + " away)</div>";
    }
    return html + foot(d, d.see_on_the_website);
  }

  function renderList(d) {
    var live = d.garages_with_live_count || [];
    var html = head("Parking in " + d.city, live.length ? live.length + " with live count" : "");
    if (d.note) html += '<div class="card"><div class="note" style="margin:0">' + esc(d.note) + "</div></div>";
    if (live.length) html += '<div class="list">' + live.map(item).join("") + "</div>";
    html += list("No live count", (d.car_parks_without_live_count || []).slice(0, 8));
    return html + foot(d, null);
  }

  function renderOne(d) {
    var html = head(d.name, d.city || "");
    html += bigCard(d, "", d.city_remark);
    if (d.opening_hours) html += '<div class="note" style="margin:10px 2px 0">Open: ' + esc(d.opening_hours) + "</div>";
    return html;
  }

  function onInput(args) {
    if (!args) return;
    var where = args.destination || (args.garage ? args.garage : null);
    if (where && root.querySelector(".skel")) root.querySelector("h1").textContent = "Finding parking near " + where + "…";
  }

  function onResult(res) {
    var d = res && res.structuredContent;
    if (!d && res && res.content && res.content[0] && res.content[0].type === "text") {
      try { d = JSON.parse(res.content[0].text); } catch (e) { d = null; }
    }
    if (!d || (res && res.isError)) {
      var text = res && res.content && res.content[0] ? res.content[0].text : "Something went wrong.";
      root.innerHTML = '<div class="card"><p class="err" style="margin:0">' + esc(text) + "</p></div>";
      return;
    }
    try {
      if ("best_choice" in d) root.innerHTML = renderFind(d);
      else if ("garages_with_live_count" in d) root.innerHTML = renderList(d);
      else if (d.name) root.innerHTML = renderOne(d);
    } catch (e) {
      root.innerHTML = '<div class="card"><p class="err" style="margin:0">Could not draw this answer.</p></div>';
    }
    reportSize();
  }
})();
</script>
</body>
</html>`;
