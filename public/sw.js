// Service worker: lets the app open without a connection — in an underground
// garage, say — by keeping a copy of the pages this device has already seen.
//
// Rules, in order of importance:
//  1. Online, nothing changes: pages always come from the network first.
//  2. A saved page is only used when the network fails or is very slow, and
//     the page is then told how old the copy is (see components/offline-notice.tsx),
//     so old counts are never presented as live.
//  3. API calls and Next.js data requests are never cached.
//
// Bump VERSION to throw away everything saved by an earlier release.
const VERSION = "v1";
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const MAX_PAGES = 40;
// How long a page load may hang before a saved copy is shown instead.
const SLOW_NETWORK_MS = 6000;

// Which page loads were answered from the saved copies: client id → when the
// copy was saved (this device's clock). The page asks for it after loading.
const savedAtByClient = new Map();

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name !== PAGES && name !== ASSETS) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/apple-icon.png" ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(loadPage(event));
  } else if (isStaticAsset(url)) {
    event.respondWith(loadAsset(request));
  }
  // Everything else (Next.js data requests, images) goes straight to the
  // network, untouched.
});

// Files under /_next/static/ have their content hash in the name, so a
// saved copy is always the right one.
async function loadAsset(request) {
  const cache = await caches.open(ASSETS);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function savePage(url, response) {
  const body = await response.blob();
  const headers = new Headers(response.headers);
  headers.set("x-saved-at", String(Date.now()));
  const cache = await caches.open(PAGES);
  await cache.put(url, new Response(body, { status: 200, headers }));
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) {
    await cache.delete(key);
  }
}

// The saved copy of this exact address, or of the same page without its
// search and filters.
async function savedPage(url) {
  const cache = await caches.open(PAGES);
  return (await cache.match(url.href)) || (await cache.match(url.origin + url.pathname));
}

// The installed app opens at "/" (and its shortcut at "/parked"), which only
// redirect to a language and so are never saved themselves. Offline, send
// them to that page in the language this device saved most recently.
// `page` is "" for the start page, or "/parked".
async function lastSavedIn(page) {
  const cache = await caches.open(PAGES);
  let best = null;
  for (const key of await cache.keys()) {
    const url = new URL(key.url);
    if (!/^\/[a-z]{2}$/.test(url.pathname.slice(0, 3)) || url.pathname.slice(3) !== page) continue;
    // A copy saved with a search or filter ("/nl?available=true", from the
    // app's shortcut) counts too, and is opened as it was saved.
    const saved = await cache.match(key);
    const at = Number(saved && saved.headers.get("x-saved-at")) || 0;
    if (!best || at > best.at) best = { path: url.pathname + url.search, at };
  }
  return best ? best.path : null;
}

// Shown when there is no connection and no saved copy of the page asked for.
const OFFLINE_TEXT = {
  nl: ["Je bent offline", "Deze pagina is nog niet op dit toestel opgeslagen.", "Naar het overzicht"],
  en: ["You're offline", "This page hasn't been saved on this device yet.", "To the overview"],
  fr: ["Vous êtes hors ligne", "Cette page n’a pas encore été enregistrée sur cet appareil.", "Vers l’aperçu"],
  de: ["Sie sind offline", "Diese Seite wurde auf diesem Gerät noch nicht gespeichert.", "Zur Übersicht"],
  es: ["Estás sin conexión", "Esta página aún no se ha guardado en este dispositivo.", "Ir al resumen"],
};

function offlinePage(url) {
  const segment = url.pathname.split("/")[1];
  const locale = segment in OFFLINE_TEXT ? segment : "nl";
  const [title, body, link] = OFFLINE_TEXT[locale];
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1c1d1f;color:#f5f5f5;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px}a{color:#7aa7ff}</style>
</head><body><main><h1>${title}</h1><p>${body}</p><p><a href="/${locale}">${link}</a></p></main></body></html>`;
  return new Response(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function loadPage(event) {
  const url = new URL(event.request.url);
  const fromNetwork = fetch(event.request).then((response) => {
    // Only complete, successful pages from this site are worth keeping.
    if (response.ok && response.type === "basic" && !response.redirected) {
      event.waitUntil(savePage(url.href, response.clone()).catch(() => {}));
    }
    return response;
  });

  const saved = await savedPage(url);
  if (!saved) {
    return fromNetwork.catch(async () => {
      const unprefixed = url.pathname === "/" ? "" : url.pathname === "/parked" ? "/parked" : null;
      const start = unprefixed === null ? null : await lastSavedIn(unprefixed);
      return start ? Response.redirect(start, 302) : offlinePage(url);
    });
  }

  const answerFromSaved = () => {
    const savedAt = Number(saved.headers.get("x-saved-at"));
    if (event.resultingClientId && Number.isFinite(savedAt)) {
      savedAtByClient.set(event.resultingClientId, savedAt);
    }
    return saved.clone();
  };
  const slow = new Promise((resolve) => setTimeout(() => resolve("slow"), SLOW_NETWORK_MS));
  try {
    const first = await Promise.race([fromNetwork, slow]);
    if (first !== "slow") return first;
    // Still let the slow load finish in the background so its page is saved.
    event.waitUntil(fromNetwork.catch(() => {}));
    return answerFromSaved();
  } catch {
    return answerFromSaved();
  }
}

// The page asks: "was I loaded from a saved copy, and from when?"
self.addEventListener("message", (event) => {
  if (event.data?.type !== "page-source" || !event.ports[0]) return;
  const id = event.source && "id" in event.source ? event.source.id : null;
  const savedAt = id ? (savedAtByClient.get(id) ?? null) : null;
  if (id) savedAtByClient.delete(id);
  event.ports[0].postMessage({ savedAt });
});
