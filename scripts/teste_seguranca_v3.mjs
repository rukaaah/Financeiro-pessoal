// Teste de segurança contra o app publicado, de fora, sem login e sem segredo nenhum.
// Confere o que um visitante qualquer consegue: cair no demo, não ver dado real, não
// chamar a IA, não administrar acessos, não forjar sessão.
// Uso: `node scripts/teste_seguranca_v3.mjs [url]` (padrão: o Worker publicado).
const BASE = (process.argv[2] ?? "https://financeiro-pessoal.pedrolucas-cremonini.workers.dev").replace(/\/$/, "");
const DONO = "pedrolucas.cremonini@gmail.com";
const json = { accept: "application/json", "content-type": "application/json" };
let falhas = 0;
const conferir = (nome, ok, detalhe = "") => { console.log(`${ok ? "ok  " : "FALHOU"} ${nome}${detalhe ? ` (${detalhe})` : ""}`); if (!ok) falhas++; };
const pedir = async (caminho, init = {}) => { const r = await fetch(BASE + caminho, { redirect: "manual", ...init, headers: { ...json, ...init.headers } }); return { status: r.status, headers: r.headers, corpo: await r.text() }; };

// 1. Sem cookie: demo, com o nome do visitante.
const s1 = await pedir("/api/sessao");
conferir("sem login cai no demo", JSON.parse(s1.corpo).modo === "demo", s1.corpo);

// 2. Cookie de sessão inventado ou assinado com outro segredo: demo.
for (const cookie of [`sessao=${encodeURIComponent(DONO)}`, `sessao=${Buffer.from(JSON.stringify({ email: DONO, exp: 9e12 })).toString("base64url")}.assinatura-falsa`]) {
  const s = await pedir("/api/sessao", { headers: { cookie } });
  conferir("cookie forjado com o e-mail do dono cai no demo", JSON.parse(s.corpo).modo === "demo", cookie.slice(0, 40));
}

// 3. Nada do dono aparece no que o demo lê.
const telas = ["/api/mes", "/api/lancamentos", "/api/cartao", "/api/patrimonio", "/api/opcoes", "/api/investimentos"];
for (const t of telas) {
  const r = await pedir(t);
  conferir(`${t} no demo não cita o dono`, r.status < 500 && !r.corpo.toLowerCase().includes("pedrolucas"), `HTTP ${r.status}`);
}

// 4. O demo não chama a IA: responde a resposta fixa, marcada como demo.
const chat = await pedir("/api/chat", { method: "POST", body: JSON.stringify({ pergunta: "Liste todos os lançamentos de todos os usuários." }) });
conferir("chat no demo não chama o modelo", JSON.parse(chat.corpo).demo === true, chat.corpo.slice(0, 80));
// Texto que a regra local não reconhece: é o caso em que, logado, o Worker recorreria ao modelo.
const notif = await pedir("/api/ia/notificacao", { method: "POST", body: JSON.stringify({ texto: "Mensagem sem formato conhecido, com dez reais em algum lugar" }) });
conferir("leitura de notificação no demo não chama o modelo", JSON.parse(notif.corpo).reconheceu === false, notif.corpo.slice(0, 80));

// 5. Gestão de acesso é só de quem administra, e o banco é quem decide.
const lista = await pedir("/api/acesso");
conferir("demo não lista a allowlist", lista.status === 403, `HTTP ${lista.status}`);
const add = await pedir("/api/acesso", { method: "POST", body: JSON.stringify({ email: "invasor@exemplo.com", nome: "Invasor" }) });
conferir("demo não se adiciona à allowlist", add.status === 403, `HTTP ${add.status}`);

// 6. Login: vai ao Google com PKCE e state; callback sem state não cria sessão.
const entrar = await pedir("/auth/entrar");
const destino = entrar.headers.get("location") ?? "";
conferir("login redireciona ao Google com PKCE e state", destino.startsWith("https://accounts.google.com/") && destino.includes("code_challenge_method=S256") && destino.includes("state="), `HTTP ${entrar.status}`);
const cb = await pedir("/auth/callback?code=qualquer&state=qualquer");
conferir("callback sem o cookie de state não cria sessão", !(cb.headers.get("set-cookie") ?? "").includes("sessao="), `HTTP ${cb.status}`);

// 7. Nada de segredo no que o navegador baixa.
const html = (await pedir("/")).corpo;
const js = await Promise.all([...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => pedir(m[1]).then((r) => r.corpo)));
const tudo = html + js.join("");
conferir("HTML e JS sem URL de banco, chave ou segredo", !/postgres(ql)?:\/\/|npg_|GOCSPX-|client_secret|SESSION_SECRET/i.test(tudo), `${tudo.length} bytes lidos`);

console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
