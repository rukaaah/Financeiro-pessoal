// Mede trocar de tela, abrir o Lançar e salvar um lançamento na v3 publicada, no 4G lento
// emulado. Grava no usuário demo do branch dev e desfaz no fim.
// Uso: Chrome com --headless=new --remote-debugging-port=9334, depois `node scripts/medir_toque_v3.mjs 9334 <pasta-das-fotos>`.
const URL_APP = "https://financeiro-pessoal.pedrolucas-cremonini.workers.dev/";
const porta = process.argv[2], saida = process.argv[3];
const alvos = await (await fetch(`http://127.0.0.1:${porta}/json/list`)).json();
const ws = new WebSocket(alvos.find(t => t.type === "page").webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const av = async (expr) => (await cmd("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.result?.value;
const foto = async (nome) => { const r = await cmd("Page.captureScreenshot", { format: "png" }); (await import("node:fs")).writeFileSync(`${saida}/${nome}.png`, Buffer.from(r.result.data, "base64")); };
await cmd("Network.enable");
await cmd("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
await cmd("Emulation.setCPUThrottlingRate", { rate: 4 });
await cmd("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await cmd("Page.navigate", { url: URL_APP });
await new Promise(r => setTimeout(r, 4000));
const espera = (cond) => `new Promise(r => { const t0 = performance.now(); const iv = setInterval(() => { if (${cond}) { clearInterval(iv); r(Math.round(performance.now() - t0)); } }, 2); setTimeout(() => r(-1), 15000); })`;
const r = {};
r.trocaDeTela = await av(`(() => { const b = [...document.querySelectorAll('nav.barra button')].find(b => b.textContent.includes('Lançamentos')); const p = ${espera("document.querySelector('h1')?.textContent==='Lançamentos'")}; b.click(); return p; })()`);
await new Promise(r => setTimeout(r, 2500));
await foto("lancamentos");
r.abrirLancar = await av(`(() => { const p = ${espera("document.querySelector('.folha')")}; document.querySelector('nav.barra [aria-label=Lançar]').click(); return p; })()`);
await new Promise(r => setTimeout(r, 1500));
await av(`(() => { const i = document.getElementById('f-valor'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(i,'12,34'); i.dispatchEvent(new Event('input',{bubbles:true})); const d=document.getElementById('f-desc'); set.call(d,'Teste de medição'); d.dispatchEvent(new Event('input',{bubbles:true})); })()`);
await foto("lancar");
r.salvarFeedback = await av(`(() => { const p = ${espera("!document.querySelector('.folha') && document.querySelector('.toast')")}; document.querySelector('.folha button[type=submit]').click(); return p; })()`);
r.salvarConfirmado = await av(espera("document.querySelector('.toast')?.textContent.includes('Lançado')"));
await foto("lancado");
r.aparecenaLista = await av(`!!document.body.textContent.includes('Teste de medição')`);
// limpa: desfaz o lançamento de teste
await av(`document.querySelector('.toast button')?.click()`);
r.desfeito = await av(espera("document.querySelector('.toast')?.textContent.includes('desfeito')"));
console.log(JSON.stringify(r));
ws.close();
