/// <reference lib="webworker" />
// Guarda a casca do app no celular (ADR-015): abrir desenha do cache na hora, mesmo
// com a rede lenta ou o servidor longe. Dados (/api) nunca são guardados aqui.
const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = "casca-v7";

sw.addEventListener("install", (e: ExtendableEvent) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/manifest.webmanifest", "/icone.svg"])).then(() => sw.skipWaiting()));
});

sw.addEventListener("activate", (e: ExtendableEvent) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => sw.clients.claim()));
});

sw.addEventListener("fetch", (e: FetchEvent) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;
  // Casca e arquivos com hash: do cache primeiro, atualizando por trás.
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const pedido = e.request.mode === "navigate" ? new Request("/") : e.request;
      const guardado = await cache.match(pedido);
      const rede = fetch(pedido).then((r) => { if (r.ok) cache.put(pedido, r.clone()); return r; }).catch(() => guardado ?? Response.error());
      return guardado ?? rede;
    }),
  );
});
