// Guarda la app en caché para que abra rápido y sin conexión.
// Los datos de Supabase siempre se piden a la red.
const CACHE = "bodega-v12";
const FILES = ["./", "index.html", "styles.css", "app.js", "store.js", "normalizar.js", "normalizar-worker.js", "config.js",
  "vinos-iniciales.json", "manifest.webmanifest", "vendor/supabase.js", "icon.svg", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (e) => {
  // "reload" salta la caché HTTP del navegador para no guardar versiones viejas.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Red primero, caché si no hay conexión.
  // "no-cache" revalida con el servidor para no servir una versión vieja
  // desde la caché HTTP del navegador.
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
