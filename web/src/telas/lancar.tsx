import { useEffect, useRef, useState } from "preact/hooks";
import { api, hoje, type Opcoes } from "../api.ts";
import { Icone } from "../icone.tsx";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesDaFatura = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;

/** Folha "Lançar" (06b-telas.md): abre em Gastei, com o valor focado. */
export interface Inicial { valor?: string | undefined; contaId?: string | undefined; categoriaId?: string | undefined; descricao?: string | undefined; contaRecorrenteId?: string | undefined }

export function Lancar({ opcoes, inicial, ptax, descontoPb, aoFechar, aoLancar, aoPrever }: { opcoes: Opcoes | null; inicial?: Inicial | undefined; ptax?: string | null; descontoPb?: number; aoFechar(): void; aoLancar(corpo: object): void; aoPrever(corpo: object): void }) {
  const [intencao, setIntencao] = useState<"gastei" | "recebi" | "vou-receber">("gastei");
  const [valor, setValor] = useState(inicial?.valor ?? "");
  const [contaId, setContaId] = useState(inicial?.contaId ?? "");
  const [categoriaId, setCategoriaId] = useState(inicial?.categoriaId ?? "");
  const [moeda, setMoeda] = useState<"USD" | "BRL">("USD");
  const [data, setData] = useState(hoje());
  const [descricao, setDescricao] = useState(inicial?.descricao ?? "");
  const [parcelas, setParcelas] = useState(1);
  const [fatura, setFatura] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const campoValor = useRef<HTMLInputElement>(null);

  const tipo = intencao === "gastei" ? "expense" : "income";
  const estimativa = (() => {
    if (intencao !== "vou-receber" || moeda !== "USD" || !ptax) return null;
    const v = Number(valor.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(v) && v > 0 ? v * Number(ptax) * (1 - (descontoPb ?? 0) / 10000) : null;
  })();
  const categorias = opcoes?.categorias.filter((c) => c.tipo === tipo) ?? [];
  const contas = opcoes?.contas.filter((c) => intencao === "gastei" || c.tipo !== "credit_card") ?? [];
  const conta = contas.find((c) => c.id === contaId);

  useEffect(() => { campoValor.current?.focus(); }, [intencao]);
  useEffect(() => {
    if (!contas.some((c) => c.id === contaId)) setContaId(contas[0]?.id ?? "");
    if (!categorias.some((c) => c.id === categoriaId)) setCategoriaId(categorias[0]?.id ?? "");
  }, [opcoes, intencao]);
  useEffect(() => {
    setFatura(null);
    if (conta?.tipo !== "credit_card") return;
    let vivo = true;
    api.faturaPrevista(conta.id, data).then((r) => vivo && setFatura(r.mes_da_fatura)).catch(() => {});
    return () => { vivo = false; };
  }, [contaId, data]);

  function salvar(e: Event) {
    e.preventDefault();
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(valor.trim())) return setErro("Digite o valor como 42,50.");
    if (!contaId || !categoriaId) return setErro("Escolha conta e categoria.");
    if (intencao === "vou-receber") {
      if (!descricao.trim()) return setErro("Dê um nome, como Freelance.");
      return aoPrever({ descricao: descricao.trim(), moeda, valor: valor.trim(), data, conta_id: contaId, categoria_id: categoriaId });
    }
    aoLancar({ intencao, valor: valor.trim(), conta_id: contaId, categoria_id: categoriaId, data, descricao: descricao.trim(), parcelas: conta?.tipo === "credit_card" ? parcelas : 1, conta_recorrente_id: inicial?.contaRecorrenteId });
  }

  return (
    <div class="veu" onClick={(e) => e.target === e.currentTarget && aoFechar()}>
      <div class="folha" role="dialog" aria-modal="true" aria-labelledby="t-lancar">
        <div class="topo"><h3 id="t-lancar">Lançar</h3><button class="icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button></div>
        <div class="chips" role="group" aria-label="O que aconteceu">
          {(["gastei", "recebi", "vou-receber"] as const).map((i) => (
            <button type="button" class="chip" aria-pressed={i === intencao} onClick={() => setIntencao(i)}>{i === "gastei" ? "Gastei" : i === "recebi" ? "Recebi" : "Vou receber"}</button>
          ))}
        </div>
        {!opcoes ? <p class="sub">Carregando contas e categorias…</p> : (
          <form onSubmit={salvar}>
            {intencao === "vou-receber" && <div class="chips" role="group" aria-label="Moeda">{(["USD", "BRL"] as const).map((m) => <button type="button" class="chip" aria-pressed={m === moeda} onClick={() => setMoeda(m)}>{m === "USD" ? "Dólar" : "Real"}</button>)}</div>}
            <div class="campo"><label for="f-valor">Valor ({intencao === "vou-receber" && moeda === "USD" ? "US$" : "R$"})</label>
              <input id="f-valor" ref={campoValor} class="grande-in" inputMode="decimal" placeholder="0,00" value={valor} onInput={(e) => { setValor(e.currentTarget.value); setErro(""); }} /></div>
            <div class="campo"><label for="f-cat">Categoria</label>
              <select id="f-cat" value={categoriaId} onChange={(e) => setCategoriaId(e.currentTarget.value)}>
                {categorias.map((c) => <option value={c.id}>{c.grupo} · {c.nome}</option>)}
              </select></div>
            <div class="campo"><label for="f-conta">{intencao === "gastei" ? "Pago com" : "Entrou em"}</label>
              <select id="f-conta" value={contaId} onChange={(e) => setContaId(e.currentTarget.value)}>
                {contas.map((c) => <option value={c.id}>{c.nome}</option>)}
              </select></div>
            {conta?.tipo === "credit_card" && (
              <>
                {fatura && <p class="nota">Entra na <b>fatura que vence em {mesDaFatura(fatura)}</b>.</p>}
                <div class="campo"><label for="f-parc">Parcelas</label>
                  <select id="f-parc" value={parcelas} onChange={(e) => setParcelas(Number(e.currentTarget.value))}>
                    {Array.from({ length: 12 }, (_, i) => <option value={i + 1}>{i === 0 ? "À vista" : `${i + 1}x`}</option>)}
                  </select></div>
              </>
            )}
            {estimativa !== null && <p class="nota">≈ <b>R$ {estimativa.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>: PTAX de hoje ({ptax!.replace(".", ",")}) menos o desconto médio do PayPal ({((descontoPb ?? 0) / 100).toFixed(1).replace(".", ",")}%). Entra no saldo projetado na data.</p>}
            {intencao === "vou-receber" && moeda === "USD" && !ptax && <p class="nota">Sem a PTAX agora; a estimativa em reais aparece quando ela voltar.</p>}
            <div class="campo"><label for="f-data">{intencao === "vou-receber" ? "Data prevista" : "Data"}</label><input id="f-data" type="date" value={data} onInput={(e) => setData(e.currentTarget.value)} /></div>
            <div class="campo"><label for="f-desc">{intencao === "vou-receber" ? "Nome" : "Descrição (opcional)"}</label><input id="f-desc" value={descricao} maxLength={200} onInput={(e) => setDescricao(e.currentTarget.value)} /></div>
            {erro && <p class="erro-campo" role="alert">{erro}</p>}
            <div style="margin-top:16px"><button type="submit" class="btn-tinta">{intencao === "vou-receber" ? "Salvar previsão" : "Salvar"}</button></div>
          </form>
        )}
      </div>
    </div>
  );
}
