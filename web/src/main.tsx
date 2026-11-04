import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { api, type Lancamento, type ListaDoMes, type Opcoes } from "./api.ts";
import { Icone } from "./icone.tsx";
import { Lancar } from "./telas/lancar.tsx";
import { Editar, Lancamentos } from "./telas/lancamentos.tsx";
import "./estilo.css";

type Tela = "mes" | "lancamentos" | "cartao" | "patrimonio";
interface Aviso { texto: string; desfazer?: () => void }
const mesAtual = () => new Date().toISOString().slice(0, 7);

function App() {
  const [tela, setTela] = useState<Tela>("mes");
  const [sessao, setSessao] = useState<{ modo: "dono" | "demo"; nome: string } | null>(null);
  const [opcoes, setOpcoes] = useState<Opcoes | null>(null);
  const [lista, setLista] = useState<ListaDoMes | null>(null);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [folha, setFolha] = useState<null | { tipo: "lancar" } | { tipo: "editar"; l: Lancamento }>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const relogio = useRef<number>();

  const avisar = (a: Aviso) => { clearTimeout(relogio.current); setAviso(a); relogio.current = window.setTimeout(() => setAviso(null), 5000); };
  const recarregar = () => api.lancamentos(mesAtual()).then(setLista).catch((e: Error) => avisar({ texto: e.message }));

  useEffect(() => {
    api.sessao().then(setSessao).catch(() => setSessao({ modo: "demo", nome: "Visitante" }));
    api.opcoes().then(setOpcoes).catch(() => {});
    recarregar();
    if (new URLSearchParams(location.search).get("lancar") === "gastei") setFolha({ tipo: "lancar" });
  }, []);

  function lancar(corpo: object) {
    setFolha(null); // feedback no toque: a folha fecha antes da resposta
    avisar({ texto: "Lançando…" });
    api.lancar(corpo).then(async (r) => {
      await recarregar();
      avisar({ texto: "Lançado.", desfazer: () => api.excluir(r.ids[0]!).then(recarregar).then(() => avisar({ texto: "Lançamento desfeito." })) });
    }).catch((e: Error) => avisar({ texto: e.message }));
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
        <main>
          {tela === "lancamentos" ? <Lancamentos lista={lista} ocultos={ocultos} aoEditar={(l) => setFolha({ tipo: "editar", l })} aoAbrirLancar={() => setFolha({ tipo: "lancar" })} />
            : <>
              <header><div><h1>{destinos.find((d) => d[0] === tela)![1]}</h1></div>{!demo && <a class="sub" href="/auth/sair">Sair</a>}</header>
              <div class="vazio"><b>Esta tela chega numa próxima fatia.</b><p class="sub">{tela === "mes" ? "A régua do mês entra na fatia 3." : tela === "cartao" ? "Faturas e pagamento entram na fatia 4." : "Cofrinhos, a receber e investimentos entram nas fatias 6 e 7."} Já dá para lançar pelo + e ver em Lançamentos.</p></div>
            </>}
        </main>
      </div>
      <nav class="barra" aria-label="Destinos"><div class="in">
        {destinos.slice(0, 2).map(([id, nome]) => <button aria-current={tela === id ? "page" : undefined} onClick={() => setTela(id)}><Icone nome={id} />{nome}</button>)}
        <button aria-label="Lançar" onClick={() => setFolha({ tipo: "lancar" })}><span class="lancar"><Icone nome="mais" tamanho={28} /></span></button>
        {destinos.slice(2).map(([id, nome]) => <button aria-current={tela === id ? "page" : undefined} onClick={() => setTela(id)}><Icone nome={id} />{nome}</button>)}
      </div></nav>
      {folha?.tipo === "lancar" && <Lancar opcoes={opcoes} aoFechar={() => setFolha(null)} aoLancar={lancar} />}
      {folha?.tipo === "editar" && <Editar l={folha.l} aoFechar={() => setFolha(null)} aoSalvar={(c) => salvarEdicao(folha.l, c)} aoExcluir={() => excluir(folha.l)} />}
      {aviso && <div class="toast" role="status"><span>{aviso.texto}</span>{aviso.desfazer && <button onClick={() => { const d = aviso.desfazer!; setAviso(null); d(); }}>Desfazer</button>}</div>}
    </>
  );
}

render(<App />, document.getElementById("app")!);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
