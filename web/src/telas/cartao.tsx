import { useState } from "preact/hooks";
import { brl, type Cartao as CartaoDados, type Compra, type Fatura, hoje, num, type Opcoes } from "../api.ts";
import { Icone } from "../icone.tsx";

const CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotulo = (m: string) => `${CURTOS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`.replace(/^./, (c) => c.toUpperCase());
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const diasAte = (d: string) => Math.round((Date.parse(`${d}T12:00:00`) - Date.parse(`${hoje()}T12:00:00`)) / 86400000);

export function Cartao({ dados, aoPagar }: { dados: { cartoes: CartaoDados[]; compras: Compra[] } | null; aoPagar(c: CartaoDados, f: Fatura): void }) {
  const [cartaoId, setCartaoId] = useState<string | null>(null);
  const [mesEscolhido, setMesEscolhido] = useState<string | null>(null);
  const cartao = dados?.cartoes.find((c) => c.id === cartaoId) ?? dados?.cartoes[0];
  const fatura = cartao?.faturas.find((f) => f.mes === mesEscolhido) ?? cartao?.faturas.find((f) => f.situacao === "aberta") ?? cartao?.faturas[cartao.faturas.length - 1];
  const compras = (dados?.compras ?? []).filter((c) => c.cartao === cartao?.id && c.mes === fatura?.mes);
  const mx = Math.max(1, ...(cartao?.faturas ?? []).map((f) => num(f.total)));

  if (dados && !cartao) return (<><header><div><h1>Cartão</h1></div></header><div class="vazio"><b>Nenhum cartão cadastrado.</b><p class="sub">Cartões entram em Ajustes, na fatia 10.</p></div></>);
  return (
    <>
      <header><div><h1>Cartão</h1><div class="sub">{cartao ? `${cartao.nome} · fecha dia ${cartao.fechamento ?? "—"}, vence dia ${cartao.vencimento ?? "—"}` : <span class="esqueleto" />}</div></div></header>
      {dados && dados.cartoes.length > 1 && <div class="chips">{dados.cartoes.map((c) => <button class="chip" aria-pressed={c.id === cartao?.id} onClick={() => { setCartaoId(c.id); setMesEscolhido(null); }}>{c.nome}</button>)}</div>}
      <div class="chips" role="group" aria-label="Fatura">
        {(cartao?.faturas ?? []).map((f) => <button class="chip" aria-pressed={f.mes === fatura?.mes} onClick={() => setMesEscolhido(f.mes)}>{rotulo(f.mes)} · {f.situacao}</button>)}
      </div>
      <div class="heroi" aria-busy={!dados}>
        <div class="rot">{fatura ? `Fatura de ${rotulo(fatura.mes).toLowerCase()} · ${fatura.situacao}` : "Fatura"}</div>
        <div class="grande">{fatura ? brl(fatura.situacao === "paga" ? fatura.total : fatura.falta) : <span class="esqueleto" />}</div>
        <p class="conta">{!fatura ? " " : fatura.situacao === "paga" ? `paga · total ${brl(fatura.total)}`
          : fatura.situacao === "futura" ? `parcelas que já caem nesta fatura · vence ${dataCurta(fatura.vencimento)}`
          : `${fatura.situacao === "parcial" ? `faltam, de ${brl(fatura.total)} · ` : ""}vence ${dataCurta(fatura.vencimento)}${diasAte(fatura.vencimento) >= 0 ? `, em ${diasAte(fatura.vencimento)} dias` : `, há ${-diasAte(fatura.vencimento)} dias`}`}</p>
        {fatura && fatura.situacao !== "paga" && fatura.situacao !== "futura" && cartao && (
          <div class="acao-heroi"><button class="btn-cheio" onClick={() => aoPagar(cartao, fatura)}>Pagar fatura</button></div>
        )}
      </div>
      {cartao && (
        <section aria-labelledby="h-comp"><h2 id="h-comp">Já comprometido <span class="lado">{brl(cartao.comprometido)} em {cartao.faturas.filter((f) => f.situacao === "futura").length} faturas</span></h2>
          <div class="proj"><div class="colfat">{cartao.faturas.slice(-6).map((f) => (
            <div class={f.mes === fatura?.mes ? "atual" : ""}><span>{brl(f.total).replace("R$ ", "").replace(",00", "")}</span><i style={`height:${(num(f.total) / mx) * 60}px`} /><span>{rotulo(f.mes).slice(0, 3)}</span></div>
          ))}</div></div>
        </section>
      )}
      <section aria-labelledby="h-compras"><h2 id="h-compras">Compras da fatura <span class="lado">{compras.length}</span></h2>
        {compras.length === 0 ? <div class="vazio">Nenhuma compra nesta fatura.</div> : (
          <div class="lista">{compras.map((c) => (
            <div class="item"><span class="nome">{c.descricao || c.categoria}</span><span class="valor">{brl(c.valor)}</span>
              <span class="sub">{[dataCurta(c.data), c.categoria, c.parcela && `parcela ${c.parcela}/${c.parcelas}`].filter(Boolean).join(" · ")}</span><span /></div>
          ))}</div>
        )}
      </section>
      <p class="sub" style="margin-top:16px">Compra no dia do fechamento ainda entra nesta fatura. O pagamento é transferência, não gasto: não aparece aqui nem no orçamento.</p>
    </>
  );
}

export function PagarFatura({ cartao, fatura, opcoes, aoFechar, aoPagar }: { cartao: CartaoDados; fatura: Fatura; opcoes: Opcoes | null; aoFechar(): void; aoPagar(corpo: { cartao_id: string; conta_id: string; mes: string; valor: string; data: string }): void }) {
  const origens = opcoes?.contas.filter((c) => c.tipo !== "credit_card") ?? [];
  const [conta, setConta] = useState(origens[0]?.id ?? "");
  const [valor, setValor] = useState(brl(fatura.falta).replace("R$ ", ""));
  const [data, setData] = useState(hoje());
  return (
    <div class="veu" onClick={(e) => e.target === e.currentTarget && aoFechar()}>
      <div class="folha" role="dialog" aria-modal="true" aria-labelledby="t-pagar">
        <div class="topo"><h3 id="t-pagar">Pagar fatura</h3><button class="icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button></div>
        <form onSubmit={(e) => { e.preventDefault(); aoPagar({ cartao_id: cartao.id, conta_id: conta || origens[0]?.id || "", mes: fatura.mes, valor, data }); }}>
          <div class="campo"><label for="pg-fat">Fatura que este pagamento quita</label><input id="pg-fat" value={`${cartao.nome} · ${rotulo(fatura.mes)} · ${brl(fatura.falta)}`} readOnly /></div>
          <div class="campo"><label for="pg-val">Valor (R$)</label><input id="pg-val" class="grande-in" inputMode="decimal" value={valor} onInput={(e) => setValor(e.currentTarget.value)} /></div>
          <div class="campo"><label for="pg-conta">Sai de</label><select id="pg-conta" value={conta} onChange={(e) => setConta(e.currentTarget.value)}>{origens.map((c) => <option value={c.id}>{c.nome}</option>)}</select></div>
          <div class="campo"><label for="pg-data">Data</label><input id="pg-data" type="date" value={data} onInput={(e) => setData(e.currentTarget.value)} /></div>
          <p class="nota">Valor igual ao que falta: a fatura fica paga. Menor: fica parcial. Não entra como gasto.</p>
          <div style="margin-top:16px"><button type="submit" class="btn-tinta">Pagar</button></div>
        </form>
      </div>
    </div>
  );
}
