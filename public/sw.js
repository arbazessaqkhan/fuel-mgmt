// FuelLog Offline Service Worker for Android PWA / WebAPK support
const CACHE_NAME = "fuellog-v1";

const PRECACHE_ASSETS = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.ico"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  // Never intercept API routes or non-HTTP protocols
  if (url.pathname.startsWith("/api/") || !url.protocol.startsWith("http")) return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
