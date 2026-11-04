import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import "./estilo.css";

interface Saude { modo: "dono" | "demo"; nome: string; contas: number; ms: number }

/** Fatia 0: a casca do app e a prova da stack. As telas entram a partir da fatia 2. */
function App() {
  const [saude, setSaude] = useState<Saude | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [erro, setErro] = useState(false);
  const [acordando, setAcordando] = useState(false);

  useEffect(() => {
    const inicio = performance.now();
    const aviso = setTimeout(() => setAcordando(true), 1000);
    fetch("/api/saude", { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((s: Saude) => { setSaude(s); setTotal(Math.round(performance.now() - inicio)); })
      .catch(() => setErro(true))
      .finally(() => { clearTimeout(aviso); setAcordando(false); });
  }, []);

  const demo = saude?.modo !== "dono";
  return (
    <>
      <div class="app">
        {demo && <div class="tarja"><span><b>Dados fictícios</b> · modo demonstração</span></div>}
        <h1>Mês</h1>
        <div class="heroi" aria-busy={!saude}>
          <div class="rot">Contas visíveis para {saude ? saude.nome : "…"}</div>
          <div class="grande">{saude ? saude.contas : <span class="esqueleto" />}</div>
          <div class="rot">
            {saude ? `banco ${saude.ms} ms · ida e volta ${total} ms` : acordando ? "Acordando o banco…" : "Carregando…"}
          </div>
        </div>
        {erro && <div class="erro">Não deu para carregar agora. Tente de novo em instantes.</div>}
        <p class="sub">Fatia 0 da v3: casca do app e prova da stack. As telas chegam nas próximas fatias.</p>
      </div>
      <nav aria-label="Destinos"><div class="in">
        <span aria-current="page">Mês</span><span>Lançamentos</span>
        <button class="lancar" aria-label="Lançar">+</button>
        <span>Cartão</span><span>Patrimônio</span>
      </div></nav>
    </>
  );
}

render(<App />, document.getElementById("app")!);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
