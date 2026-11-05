/// <reference lib="webworker" />
// Guarda a casca do app no celular (ADR-015): abrir desenha do cache na hora, mesmo
// com a rede lenta ou o servidor longe. Dados (/api) nunca são guardados aqui.
const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = "casca-v15";

sw.addEventListener("install", (e: ExtendableEvent) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/manifest.webmanifest", "/icone.svg"])).then(() => sw.skipWaiting()));
});

sw.addEventListener("activate", (e: ExtendableEvent) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => sw.clients.claim()));
});

sw.addEventListener("fetch", (e: FetchEvent) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;
  // Página (navegação): rede primeiro, com o cache só se a rede falhar ou demorar.
  // Antes a casca vinha do cache: depois de um deploy ela apontava para arquivos com
  // hash que já não existiam, e a tela ficava branca até recarregar.
  if (e.request.mode === "navigate") {
    const casca = new Request("/");
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const rede = fetch(casca).then((r) => { if (r.ok) cache.put(casca, r.clone()); return r; });
        const limite = new Promise<Response | undefined>((ok) => setTimeout(() => cache.match(casca).then(ok), 3000));
        try {
          return (await Promise.race([rede, limite])) ?? (await rede);
        } catch {
          return (await cache.match(casca)) ?? Response.error();
        }
      }),
    );
    return;
  }
  // Arquivos com hash e ícones: do cache primeiro (não mudam), guardando o que vier da rede.
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const guardado = await cache.match(e.request);
      if (guardado) return guardado;
      const r = await fetch(e.request);
      if (r.ok && url.pathname.startsWith("/assets/")) cache.put(e.request, r.clone());
      return r;
    }),
  );
});
