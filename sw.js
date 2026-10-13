// 서비스 워커: 앱 파일과 구간 데이터는 미리 저장, 지도 타일은 본 것만 저장 (PWA 오프라인 열람)
const VERSION = "v2";
const APP_CACHE = `app-${VERSION}`;
const TILE_CACHE = "tiles-v1";
const TILE_LIMIT = 600;

const APP_FILES = [
  "./", "index.html", "css/style.css", "js/app.js", "js/geo.js", "js/note-logic.js", "js/note.js",
  "data/sections.json", "data/routes.geojson", "manifest.webmanifest",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("app-") && k !== APP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trimTiles() {
  const cache = await caches.open(TILE_CACHE);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - TILE_LIMIT; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // 지도 타일: 저장본 먼저, 없으면 받아서 저장
  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    e.respondWith(caches.open(TILE_CACHE).then(async (cache) => {
      const hit = await cache.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      cache.put(e.request, res.clone()).then(trimTiles);
      return res;
    }));
    return;
  }

  // 앱 파일: 네트워크 먼저(최신 반영), 안 되면 저장본
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(APP_CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
    );
  }
});
