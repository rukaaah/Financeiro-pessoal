import { useState } from "preact/hooks";
import { apiIA } from "../api.ts";
import { Icone } from "../icone.tsx";

const PRONTAS: Record<string, string[]> = {
  mes: ["Avalie meu orçamento", "Onde gastei mais?", "Como melhorar este mês?"],
  categoria: ["Onde gastei mais?", "Isso é normal?", "Como diminuir?"],
  investimentos: ["O que mudou na carteira?", "O que é P/VP?"],
  fundo: ["O que o resumo muda para mim?", "O que pesa contra aumentar a posição?", "A gestão cumpre o que promete?", "Quais os maiores riscos?"],
};

type Msg = { eu: string; ia: string | null; contra?: string | null; verificado?: string[]; faltou?: string | null };

/** Chat por contexto (prompts/ia/chat.md). A IA só vê o resultado das consultas, e o app confere cada número. */
export function Chat({ contexto, titulo, mes, categoriaId, ticker, aoFechar }: { contexto: "mes" | "categoria" | "investimentos" | "fundo"; titulo: string; mes: string; categoriaId?: string; ticker?: string; aoFechar(): void }) {
  const [conversa, setConversa] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [sugestoes, setSugestoes] = useState(PRONTAS[contexto] ?? []);
  const [aviso, setAviso] = useState("");
  function perguntar(p: string) {
    if (!p.trim()) return;
    setTexto("");
    setConversa((c) => [...c, { eu: p, ia: null }]);
    const historico = conversa.filter((m) => m.ia).map((m) => ({ eu: m.eu, ia: m.ia! })).slice(-4);
    apiIA.chat({ contexto, pergunta: p, mes, ...(categoriaId ? { categoria_id: categoriaId } : {}), ...(ticker ? { ticker, historico } : {}) })
      .then((r) => { setConversa((c) => c.map((m, i) => (i === c.length - 1 ? { ...m, ia: r.resposta, contra: r.contra ?? null, verificado: r.verificado ?? [], faltou: r.faltou ?? null } : m))); if (r.perguntas_seguintes?.length) setSugestoes(r.perguntas_seguintes); if (r.demo) setAviso("No modo demonstração as respostas são de exemplo."); })
      .catch((e: Error) => setConversa((c) => c.map((m, i) => (i === c.length - 1 ? { ...m, ia: e.message } : m))));
  }
  return (
    <div class="veu" onClick={(e) => e.target === e.currentTarget && aoFechar()}><div class="folha" role="dialog" aria-modal="true" aria-labelledby="t-chat">
      <div class="topo"><h3 id="t-chat"><span class="selo-ia"><Icone nome="ia" tamanho={14} />IA</span>{titulo}</h3><button class="icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button></div>
      <div class="chips chat-chips">{sugestoes.map((s) => <button class="chip" onClick={() => perguntar(s)}>{s}</button>)}</div>
      <div aria-live="polite">{conversa.map((m) => (<><div class="msg eu">{m.eu}</div><div class="msg ia"><span class="quem"><Icone nome="ia" tamanho={14} />IA</span>{m.ia ?? (ticker ? "lendo os dados do fundo…" : "pensando…")}
        {m.contra && <span class="base"><strong>Ponto contra:</strong> {m.contra}</span>}{m.faltou && <span class="base">Faltou: {m.faltou}</span>}{m.verificado && m.verificado.length > 0 && <span class="base">Conferi: {m.verificado.join("; ")}</span>}</div></>))}</div>
      <form onSubmit={(e) => { e.preventDefault(); perguntar(texto); }} style="display:flex;gap:8px;margin-top:12px">
        <input aria-label="Pergunta" value={texto} onInput={(e) => setTexto(e.currentTarget.value)} placeholder={ticker ? `Pergunte sobre o ${ticker}…` : "Pergunte sobre os seus números…"} style="flex:1;font:inherit;font-size:16px;padding:10px;border-radius:4px;border:1px solid var(--t2);background:var(--sup);color:var(--tinta)" />
        <button class="btn-ia" type="submit" aria-label="Perguntar"><Icone nome="ia" tamanho={18} /></button>
      </form>
      <p class="aviso">{aviso || (ticker ? "A IA lê só os dados e documentos do fundo guardados no app. O app confere cada número e cada fonte, exige um ponto contra e não deixa a resposta ser mais otimista que o medidor. Não é recomendação de investimento." : "A IA escolhe as consultas e responde só com os seus números; o app confere cada valor. Não faz recomendação de investimento.")}</p>
    </div></div>
  );
}
