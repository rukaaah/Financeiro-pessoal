// Mede a v3 publicada num Chrome com rede de celular emulada (CDP).
// Uso: Chrome com --headless=new --remote-debugging-port=9333, depois `node scripts/medir_v3.mjs 9333`.
const URL_APP = "https://financeiro-pessoal.pedrolucas-cremonini.workers.dev/";
const porta = process.argv[2];
const alvos = await (await fetch(`http://127.0.0.1:${porta}/json/list`)).json();
const ws = new WebSocket(alvos.find(t => t.type === "page").webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const avaliar = async (expr) => (await cmd("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.result.value;
await cmd("Network.enable");
// Perfil "4G lento" do Lighthouse para celular: 150 ms de RTT, 1,6 Mbps de descida, 750 kbps de subida.
await cmd("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
await cmd("Emulation.setCPUThrottlingRate", { rate: 4 });
await cmd("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
const esperarDados = `new Promise(r => { const t0 = performance.now(); const iv = setInterval(() => { const g = document.querySelector('.grande'); if (g && !g.querySelector('.esqueleto')) { clearInterval(iv); r(Math.round(performance.now())); } }, 10); setTimeout(() => r(-1), 20000); })`;
const casca = `new Promise(r => { const iv = setInterval(() => { if (document.querySelector('nav')) { clearInterval(iv); r(Math.round(performance.now())); } }, 5); })`;
const resultado = {};
for (const rodada of ["primeira visita", "segunda visita (cache)", "terceira visita (cache)"]) {
  await cmd("Page.navigate", { url: URL_APP });
  await new Promise(r => setTimeout(r, 300));
  resultado[rodada] = { casca_ms: await avaliar(casca), dados_ms: await avaliar(esperarDados) };
  await new Promise(r => setTimeout(r, 1500));
}
resultado.api = await avaliar(`(async () => { const t = []; for (let i = 0; i < 10; i++) { const s = performance.now(); await (await fetch('/api/saude', { cache: 'no-store' })).json(); t.push(Math.round(performance.now() - s)); } t.sort((a,b)=>a-b); return { amostras: t, p50: t[5], p95: t[9] }; })()`);
resultado.saude = await avaliar(`fetch('/api/saude').then(r => r.json())`);
console.log(JSON.stringify(resultado, null, 1));
ws.close();
