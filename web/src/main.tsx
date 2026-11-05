import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { api, hoje, apiAtencao, apiPatrimonio, type Patrimonio as PatrimonioDados, apiCartao, apiMes, type ItemAtencao, type Cartao as CartaoDados, type Compra, type Fatura, type CategoriaDoMes, type Lancamento, type ListaDoMes, type Mes as MesDados, type Opcoes } from "./api.ts";
import { Icone } from "./icone.tsx";
import { Lancar } from "./telas/lancar.tsx";
import { Editar, Lancamentos } from "./telas/lancamentos.tsx";
import { DetalheDaCategoria, Mes } from "./telas/mes.tsx";
import { Cartao, PagarFatura } from "./telas/cartao.tsx";
import { Atencao, NovaConta, Receber } from "./telas/atencao.tsx";
import type { Inicial } from "./telas/lancar.tsx";
import { Mover, type Movimento, Patrimonio } from "./telas/patrimonio.tsx";
import { ColarNotificacao, ImportarExtrato } from "./telas/entrada.tsx";
import { Chat } from "./telas/chat.tsx";
import { Ajustes } from "./telas/ajustes.tsx";
import "./estilo.css";

type Tela = "mes" | "lancamentos" | "cartao" | "patrimonio" | "ajustes";
interface Aviso { texto: string; desfazer?: () => void }
const mesAtual = () => hoje().slice(0, 7);

function App() {
  const TELAS: Tela[] = ["mes", "lancamentos", "cartao", "patrimonio", "ajustes"];
  const daHash = (): Tela => { const h = location.hash.slice(1) as Tela; return TELAS.includes(h) ? h : "mes"; };
  const [tela, setTelaEstado] = useState<Tela>(daHash());
  const setTela = (t: Tela) => { if (t !== tela) history.pushState(null, "", t === "mes" ? location.pathname + location.search : `#${t}`); setTelaEstado(t); window.scrollTo(0, 0); };
  useEffect(() => { const volta = () => setTelaEstado(daHash()); addEventListener("popstate", volta); return () => removeEventListener("popstate", volta); }, []);
  const [sessao, setSessao] = useState<{ modo: "dono" | "demo"; nome: string } | null>(null);
  const [opcoes, setOpcoes] = useState<Opcoes | null>(null);
  const [lista, setLista] = useState<ListaDoMes | null>(null);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [folha, setFolha] = useState<null | { tipo: "lancar"; inicial?: Inicial; intencao?: "gastei" | "recebi" } | { tipo: "colar" } | { tipo: "importar" } | { tipo: "chat"; contexto: "mes" | "categoria" | "investimentos"; titulo: string; categoriaId?: string } | { tipo: "atencao" } | { tipo: "nova-conta" } | { tipo: "receber"; id: string } | { tipo: "mover"; m: Movimento } | { tipo: "editar"; l: Lancamento } | { tipo: "categoria"; c: CategoriaDoMes } | { tipo: "pagar"; c: CartaoDados; f: Fatura }>(null);
  const [dadosCartao, setDadosCartao] = useState<{ cartoes: CartaoDados[]; compras: Compra[] } | null>(null);
  const [dadosPatrimonio, setDadosPatrimonio] = useState<PatrimonioDados | null>(null);
  const recarregarPatrimonio = () => apiPatrimonio.ver().then(setDadosPatrimonio).catch(() => {});
  const recarregarCartao = () => apiCartao.cartao().then(setDadosCartao).catch(() => {});
  const [mes, setMes] = useState(mesAtual());
  const [dadosMes, setDadosMes] = useState<MesDados | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const relogio = useRef<number>();

  const avisar = (a: Aviso) => { clearTimeout(relogio.current); setAviso(a); relogio.current = window.setTimeout(() => setAviso(null), 5000); };
  const recarregarMes = (m = mes) => apiMes.mes(m).then((d) => d.mes === m && setDadosMes(d)).catch((e: Error) => avisar({ texto: e.message }));
  const recarregar = () => { recarregarMes(); recarregarCartao(); recarregarPatrimonio(); return api.lancamentos(mes).then(setLista).catch((e: Error) => avisar({ texto: e.message })); };
  // Primeiro os dados da tela aberta; o resto vem depois, para não disputar a rede do celular com o número que a pessoa veio ver.
  const primeiraCarga = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    setDadosMes(null); setLista(null);
    const lista = () => api.lancamentos(mes).then(setLista).catch(() => {});
    if (tela === "lancamentos") { lista(); recarregarMes(mes); return; }
    const p = recarregarMes(mes);
    primeiraCarga.current ??= tela === "cartao" ? recarregarCartao() : tela === "patrimonio" ? recarregarPatrimonio() : p;
    p.finally(lista);
  }, [mes]);

  useEffect(() => {
    api.sessao().then(setSessao).catch(() => setSessao({ modo: "demo", nome: "Visitante" }));
    (primeiraCarga.current ?? Promise.resolve()).finally(() => {
      api.opcoes().then(setOpcoes).catch(() => {});
      if (tela !== "cartao") recarregarCartao();
      if (tela !== "patrimonio") recarregarPatrimonio();
    });
    if (new URLSearchParams(location.search).get("lancar") === "gastei") setFolha({ tipo: "lancar" });
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setFolha(null); };
    addEventListener("keydown", esc);
  }, []);

  function lancar(corpo: object) {
    setFolha(null); // feedback no toque: a folha fecha antes da resposta
    avisar({ texto: "Lançando…" });
    api.lancar(corpo).then(async (r) => {
      await recarregar();
      avisar({ texto: "Lançado.", desfazer: () => api.excluir(r.ids[0]!).then(recarregar).then(() => avisar({ texto: "Lançamento desfeito." })) });
    }).catch((e: Error) => avisar({ texto: e.message }));
  }

  /** "Repetir todo mês": primeiro a conta recorrente, depois o gasto já ligado a ela (conta como paga neste mês). */
  function lancarRepetindo(conta: object, corpo: object) {
    setFolha(null);
    avisar({ texto: "Lançando…" });
    apiAtencao.novaConta(conta).then((rec) => api.lancar({ ...corpo, conta_recorrente_id: rec.id }).then(async (r) => {
      await recarregar();
      avisar({ texto: "Lançado. Repete todo mês.", desfazer: () => api.excluir(r.ids[0]!).then(recarregar).then(() => avisar({ texto: "Lançamento desfeito. A conta recorrente continua em Ajustes." })) });
    }, (e: Error) => { recarregarMes(); avisar({ texto: `A conta recorrente foi salva, mas o lançamento não: ${e.message}` }); }))
      .catch((e: Error) => avisar({ texto: e.message }));
  }

  function agir(i: ItemAtencao) {
    const a = i.acao;
    if (a.tipo === "ver-categoria") { const c = dadosMes?.categorias.find((x) => x.id === a.id); if (c) setFolha({ tipo: "categoria", c }); }
    if (a.tipo === "pagar-conta") {
      const k = dadosMes?.contas.find((x) => x.id === a.id);
      apiAtencao.contasRecorrentes().then((r) => {
        const b = r.contas.find((x) => x.id === a.id);
        setFolha({ tipo: "lancar", inicial: { valor: (k?.valor ?? "").replace(".", ","), contaId: b?.conta_id, categoriaId: b?.categoria_id, descricao: k?.nome, contaRecorrenteId: a.id } });
      }).catch((e: Error) => avisar({ texto: e.message }));
    }
    if (a.tipo === "pagar-fatura") {
      const c = dadosCartao?.cartoes.find((x) => x.id === a.cartao), f = c?.faturas.find((x) => `${x.mes}-01` === a.mes || x.mes === a.mes.slice(0, 7));
      if (c && f) setFolha({ tipo: "pagar", c, f });
    }
    if (a.tipo === "receber") setFolha({ tipo: "receber", id: a.id });
  }

  function adiar(i: ItemAtencao, ate: string | null) {
    apiAtencao.adiar(i.chave, ate).then(() => recarregarMes()).then(() => avisar({ texto: ate ? "Lembro amanhã." : "Marcado como resolvido." })).catch((e: Error) => avisar({ texto: e.message }));
  }

  function excluir(l: Lancamento) {
    setFolha(null);
    setOcultos((s) => new Set(s).add(l.id));
    let desfeito = false;
    avisar({ texto: "Lançamento excluído.", desfazer: () => { desfeito = true; setOcultos((s) => { const n = new Set(s); n.delete(l.id); return n; }); setAviso(null); } });
    // A exclusão só vai ao banco quando o prazo do Desfazer acaba.
    window.setTimeout(() => {
      if (desfeito) return;
      api.excluir(l.id).then(recarregar).catch((e: Error) => { setOcultos((s) => { const n = new Set(s); n.delete(l.id); return n; }); avisar({ texto: e.message }); });
    }, 5000);
  }

  function salvarEdicao(l: Lancamento, corpo: object) {
    setFolha(null);
    api.editar(l.id, corpo).then(recarregar).then(() => avisar({ texto: "Salvo." })).catch((e: Error) => avisar({ texto: e.message }));
  }

  const demo = sessao?.modo !== "dono";
  const destinos: [Tela, string][] = [["mes", "Mês"], ["lancamentos", "Lançamentos"], ["cartao", "Cartão"], ["patrimonio", "Patrimônio"]];
  return (
    <>
      <div class="app">
        {demo && <div class="tarja"><span><b>Dados fictícios</b> · modo demonstração</span><a href="/auth/entrar">Entrar</a></div>}
        {tela !== "ajustes" && <button class="icone ajustes-topo" style={demo ? undefined : "top:calc(env(safe-area-inset-top,0px) + 10px)"} aria-label="Ajustes" onClick={() => setTela("ajustes")}><Icone nome="ajustes" /></button>}
        <main>
          {tela === "ajustes" ? <Ajustes demo={demo} nome={sessao?.nome ?? ""} aoAvisar={(texto) => { avisar({ texto }); api.opcoes().then(setOpcoes).catch(() => {}); recarregar(); }} aoVoltar={() => setTela("mes")} />
            : tela === "mes" ? <Mes mes={mes} dados={dadosMes} aoTrocarMes={setMes} aoAbrirCategoria={(c) => setFolha({ tipo: "categoria", c })} aoVerAtencao={() => setFolha({ tipo: "atencao" })} aoAgir={agir} aoPerguntar={() => setFolha({ tipo: "chat", contexto: "mes", titulo: "Orçamento do mês" })} />
            : tela === "patrimonio" ? <Patrimonio dados={dadosPatrimonio} opcoes={opcoes} aoPerguntar={() => setFolha({ tipo: "chat", contexto: "investimentos", titulo: "Investimentos" })} aoMover={(m) => setFolha({ tipo: "mover", m })} aoAvisar={(texto) => avisar({ texto })} />
            : tela === "cartao" ? <Cartao dados={dadosCartao} aoPagar={(c, f) => setFolha({ tipo: "pagar", c, f })} />
            : tela === "lancamentos" ? <Lancamentos lista={lista} ocultos={ocultos} aoEditar={(l) => setFolha({ tipo: "editar", l })} aoAbrirLancar={() => setFolha({ tipo: "lancar" })} aoColar={() => setFolha({ tipo: "colar" })} aoImportar={() => setFolha({ tipo: "importar" })} />
            : <>
              <header><div><h1>{destinos.find((d) => d[0] === tela)![1]}</h1></div>{!demo && <a class="sub" href="/auth/sair">Sair</a>}</header>
              <div class="vazio"><b>Esta tela chega numa próxima fatia.</b><p class="sub">{"Cofrinhos, a receber e investimentos entram nas fatias 6 e 7."} Já dá para lançar pelo + e ver em Lançamentos.</p></div>
            </>}
        </main>
      </div>
      <nav class="barra" aria-label="Destinos"><div class="in">
        {destinos.slice(0, 2).map(([id, nome]) => <button aria-current={tela === id ? "page" : undefined} onClick={() => setTela(id)}><Icone nome={id} />{nome}</button>)}
        <button aria-label="Lançar" onClick={() => setFolha({ tipo: "lancar" })}><span class="lancar"><Icone nome="mais" tamanho={28} /></span></button>
        {destinos.slice(2).map(([id, nome]) => <button aria-current={tela === id ? "page" : undefined} onClick={() => setTela(id)}><Icone nome={id} />{nome}</button>)}
      </div></nav>
      {folha?.tipo === "lancar" && <Lancar opcoes={opcoes} inicial={folha.inicial} intencaoInicial={folha.intencao} ptax={dadosMes?.ptax ?? null} descontoPb={dadosMes?.desconto_pb ?? 0} aoFechar={() => setFolha(null)} aoLancar={lancar} aoRepetir={lancarRepetindo}
        aoPrever={(corpo) => { setFolha(null); apiAtencao.novaEntrada(corpo).then(() => recarregarMes()).then(() => avisar({ texto: "Entrada prevista salva." })).catch((e: Error) => avisar({ texto: e.message })); }} />}
      {folha?.tipo === "atencao" && dadosMes && <Atencao dados={dadosMes} aoFechar={() => setFolha(null)} aoAgir={agir} aoAdiar={adiar} aoNovaConta={() => setFolha({ tipo: "nova-conta" })} />}
      {folha?.tipo === "nova-conta" && <NovaConta opcoes={opcoes} aoFechar={() => setFolha(null)} aoSalvar={(corpo) => { setFolha(null); apiAtencao.novaConta(corpo).then(() => recarregarMes()).then(() => avisar({ texto: "Conta recorrente salva." })).catch((e: Error) => avisar({ texto: e.message })); }} />}
      {folha?.tipo === "receber" && dadosMes && (() => { const e = dadosMes.entradas.find((x) => x.id === folha.id); return e ? <Receber entrada={e} ptax={dadosMes.ptax} descontoPb={dadosMes.desconto_pb} aoFechar={() => setFolha(null)} aoSalvar={(recebido) => {
        setFolha(null);
        apiAtencao.receber(e.id, { recebido, data: new Date().toISOString().slice(0, 10) }).then((r) => { recarregar(); avisar({ texto: r.desconto ? `Recebido. O PayPal ficou com R$ ${r.desconto.replace(".", ",")} contra a PTAX.` : "Recebido." }); }).catch((x: Error) => avisar({ texto: x.message }));
      }} /> : null; })()}
      {folha?.tipo === "editar" && <Editar l={folha.l} aoFechar={() => setFolha(null)} aoSalvar={(c) => salvarEdicao(folha.l, c)} aoExcluir={() => excluir(folha.l)} />}
      {folha?.tipo === "categoria" && <DetalheDaCategoria c={folha.c} mes={mes} aoPerguntar={() => setFolha({ tipo: "chat", contexto: "categoria", titulo: `${folha.c.nome} · ${mes}`, categoriaId: folha.c.id })} aoFechar={() => setFolha(null)} aoSalvar={(valor, padrao) => {
        setFolha(null);
        apiMes.previsto({ categoria_id: folha.c.id, mes, valor, padrao }).then(() => recarregarMes()).then(() => avisar({ texto: "Previsto salvo." })).catch((e: Error) => avisar({ texto: e.message }));
      }} />}
      {folha?.tipo === "pagar" && <PagarFatura cartao={folha.c} fatura={folha.f} opcoes={opcoes} aoFechar={() => setFolha(null)} aoPagar={(corpo) => {
        setFolha(null);
        avisar({ texto: "Pagando…" });
        apiCartao.pagar(corpo).then(recarregar).then(() => avisar({ texto: "Pagamento registrado." })).catch((e: Error) => avisar({ texto: e.message }));
      }} />}
      {folha?.tipo === "mover" && <Mover m={folha.m} contas={(opcoes?.contas ?? []).filter((c) => c.tipo !== "credit_card")} aoFechar={() => setFolha(null)} aoSalvar={(corpo) => {
        const m = folha.m; setFolha(null);
        const feito = m.tipo === "guardar" ? apiPatrimonio.guardar({ ...corpo, cofrinho_id: m.cofrinho.id })
          : m.tipo === "resgatar" ? apiPatrimonio.resgatar({ ...corpo, cofrinho_id: m.cofrinho.id })
          : m.tipo === "receber-de" ? apiPatrimonio.receberDe({ ...corpo, receber_id: m.id })
          : apiPatrimonio.conciliar(corpo).then((r) => { avisar({ texto: r.diferenca === "0.00" ? "Conferido: o saldo bate com o banco." : `Diferença de R$ ${r.diferenca.replace(".", ",")} contra o banco.` }); return r; });
        feito.then(() => recarregar()).then(() => { if (m.tipo !== "conciliar") avisar({ texto: "Salvo." }); }).catch((e: Error) => avisar({ texto: e.message }));
      }} />}
      {folha?.tipo === "chat" && <Chat contexto={folha.contexto} titulo={folha.titulo} mes={mes} {...(folha.categoriaId ? { categoriaId: folha.categoriaId } : {})} aoFechar={() => setFolha(null)} />}
      {folha?.tipo === "colar" && <ColarNotificacao opcoes={opcoes} aoFechar={() => setFolha(null)} aoAbrir={(inicial, intencao) => setFolha({ tipo: "lancar", inicial, intencao })} />}
      {folha?.tipo === "importar" && <ImportarExtrato opcoes={opcoes} aoFechar={() => setFolha(null)} aoImportado={(n) => { setFolha(null); recarregar(); avisar({ texto: `${n} lançamentos importados.` }); }} />}
      {aviso && <div class="toast" role="status"><span>{aviso.texto}</span>{aviso.desfazer && <button onClick={() => { const d = aviso.desfazer!; setAviso(null); d(); }}>Desfazer</button>}</div>}
    </>
  );
}

render(<App />, document.getElementById("app")!);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
