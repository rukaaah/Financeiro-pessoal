import { useState } from "preact/hooks";
import { apiIA } from "../api.ts";
import { Icone } from "../icone.tsx";

const PRONTAS: Record<string, string[]> = {
  mes: ["Avalie meu orçamento", "Onde gastei mais?", "Como melhorar este mês?"],
  categoria: ["Onde gastei mais?", "Isso é normal?", "Como diminuir?"],
  investimentos: ["O que mudou na carteira?", "O que é P/VP?"],
};

/** Chat por contexto (prompts/ia/chat.md). A IA só vê o resultado das consultas, e o app confere cada número. */
export function Chat({ contexto, titulo, mes, categoriaId, aoFechar }: { contexto: "mes" | "categoria" | "investimentos"; titulo: string; mes: string; categoriaId?: string; aoFechar(): void }) {
  const [conversa, setConversa] = useState<{ eu: string; ia: string | null }[]>([]);
  const [texto, setTexto] = useState("");
  const [sugestoes, setSugestoes] = useState(PRONTAS[contexto] ?? []);
  const [aviso, setAviso] = useState("");
  function perguntar(p: string) {
    if (!p.trim()) return;
    setTexto("");
    setConversa((c) => [...c, { eu: p, ia: null }]);
    apiIA.chat({ contexto, pergunta: p, mes, ...(categoriaId ? { categoria_id: categoriaId } : {}) })
      .then((r) => { setConversa((c) => c.map((m, i) => (i === c.length - 1 ? { ...m, ia: r.resposta } : m))); if (r.perguntas_seguintes?.length) setSugestoes(r.perguntas_seguintes); if (r.demo) setAviso("No modo demonstração as respostas são de exemplo."); })
      .catch((e: Error) => setConversa((c) => c.map((m, i) => (i === c.length - 1 ? { ...m, ia: e.message } : m))));
  }
  return (
    <div class="veu" onClick={(e) => e.target === e.currentTarget && aoFechar()}><div class="folha" role="dialog" aria-modal="true" aria-labelledby="t-chat">
      <div class="topo"><h3 id="t-chat">{titulo}</h3><button class="icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button></div>
      <div class="chips">{sugestoes.map((s) => <button class="chip" onClick={() => perguntar(s)}>{s}</button>)}</div>
      <div aria-live="polite">{conversa.map((m) => (<><div class="msg eu">{m.eu}</div><div class="msg ia">{m.ia ?? "pensando…"}</div></>))}</div>
      <form onSubmit={(e) => { e.preventDefault(); perguntar(texto); }} style="display:flex;gap:8px;margin-top:12px">
        <input aria-label="Pergunta" value={texto} onInput={(e) => setTexto(e.currentTarget.value)} placeholder="Pergunte sobre os seus números…" style="flex:1;font:inherit;font-size:16px;padding:10px;border-radius:4px;border:1px solid var(--t2);background:var(--sup);color:var(--tinta)" />
        <button class="btn" type="submit">Perguntar</button>
      </form>
      <p class="aviso">{aviso || "A IA escolhe as consultas e responde só com os seus números; o app confere cada valor. Não faz recomendação de investimento."}</p>
    </div></div>
  );
}
