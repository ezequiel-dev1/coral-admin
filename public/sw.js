const CACHE = "coral-shell-v1";
const SHELL = ["/", "/coral-icon.png", "/coral-logo-horizontal.png", "/favicon.svg"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === "navigate") { event.respondWith(fetch(request).then((response) => { caches.open(CACHE).then((cache) => cache.put("/", response.clone())); return response; }).catch(() => caches.match("/"))); return; }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => { if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone())); return response; })));
});
