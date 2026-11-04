import { csv } from "@financeiro/dominio";
import { useState } from "preact/hooks";
import { brl, type Lancamento, type ListaDoMes } from "../api.ts";
import { Icone } from "../icone.tsx";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const nomeDoDia = (d: string) => { const x = new Date(`${d}T12:00:00`); return `${DIAS[x.getDay()]}, ${x.getDate()} de ${MESES[x.getMonth()]}`; };
const FILTROS = { Tudo: () => true, Gastos: (l: Lancamento) => l.tipo === "expense", Entradas: (l: Lancamento) => l.tipo === "income", Transferências: (l: Lancamento) => l.tipo === "transfer" } as const;

export function Lancamentos({ lista, ocultos, aoEditar, aoAbrirLancar }: { lista: ListaDoMes | null; ocultos: Set<string>; aoEditar(l: Lancamento): void; aoAbrirLancar(): void }) {
  const [filtro, setFiltro] = useState<keyof typeof FILTROS>("Tudo");
  const visiveis = (lista?.lancamentos ?? []).filter((l) => !ocultos.has(l.id)).filter(FILTROS[filtro]);
  const dias = [...new Set(visiveis.map((l) => l.data))];

  function exportar() {
    const linhas = [["Data", "Descrição", "Categoria", "Conta", "Valor", "Mês da fatura"],
      ...(lista?.lancamentos ?? []).map((l) => [l.data, l.descricao, l.categoria ?? "", l.conta_destino ? `${l.conta} → ${l.conta_destino}` : l.conta, l.valor.replace(".", ","), l.mes_da_fatura ?? ""])];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv(linhas)], { type: "text/csv;charset=utf-8" }));
    a.download = `lancamentos-${lista?.mes ?? ""}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <header><div><h1>Lançamentos</h1><div class="sub">{lista ? `${lista.lancamentos.length} lançamentos no mês` : <span class="esqueleto" />}</div></div></header>
      <div class="lote">
        <button class="btn" disabled title="Fatia 8"><Icone nome="importar" tamanho={20} />Importar extrato</button>
        <button class="btn" disabled title="Fatia 8"><Icone nome="colar" tamanho={20} />Colar notificação</button>
      </div>
      <div class="chips" role="group" aria-label="Filtro">
        {(Object.keys(FILTROS) as (keyof typeof FILTROS)[]).map((f) => <button class="chip" aria-pressed={f === filtro} onClick={() => setFiltro(f)}>{f}</button>)}
      </div>
      {!lista ? <div class="lista">{[1, 2, 3, 4].map(() => <div class="item"><span class="esqueleto" /><span class="esqueleto" style="width:4em" /></div>)}</div>
        : dias.length === 0 ? (
          <div class="vazio"><b>Nenhum lançamento {filtro === "Tudo" ? "neste mês" : "deste tipo"}.</b>
            <p class="sub">Toque em + para lançar o primeiro.</p>
            <div class="rodape"><button class="btn" onClick={aoAbrirLancar}><Icone nome="mais" tamanho={18} />Lançar</button></div></div>
        ) : dias.map((d) => (
          <>
            <div class="dia">{nomeDoDia(d)}</div>
            <div class="lista">{visiveis.filter((l) => l.data === d).map((l) => (
              <button class="item" onClick={() => aoEditar(l)} disabled={l.tipo === "transfer" || l.parcela !== null}>
                <span class="nome">{l.tipo === "transfer" && <Icone nome="transferencia" tamanho={16} />} {l.descricao || l.categoria || "Sem descrição"}</span>
                <span class={`valor ${l.tipo === "income" ? "entrada" : ""}`}>{l.tipo === "transfer" ? brl(l.valor.replace("-", "")) : brl(l.valor, l.tipo === "income")}</span>
                <span class="sub">{[l.categoria, l.conta_destino ? `${l.conta} → ${l.conta_destino}` : l.conta, l.mes_da_fatura && `fatura ${l.mes_da_fatura.slice(5, 7)}/${l.mes_da_fatura.slice(0, 4)}`, l.parcela && `parcela ${l.parcela}/${l.parcelas}`].filter(Boolean).join(" · ")}</span>
                <span />
              </button>
            ))}</div>
          </>
        ))}
      {lista && (
        <>
          <div class="linha-total"><span>Entrou · Saiu</span><span>{brl(lista.entrou)} · {brl(lista.saiu)}</span></div>
          <p class="sub">Pela data do lançamento, sem transferências e sem compras no cartão, que contam no mês da fatura. Por isso não é o mesmo gasto do Mês.</p>
          <div class="rodape"><button class="btn" onClick={exportar}><Icone nome="baixar" tamanho={18} />Exportar CSV</button></div>
        </>
      )}
    </>
  );
}

export function Editar({ l, aoFechar, aoSalvar, aoExcluir }: { l: Lancamento; aoFechar(): void; aoSalvar(corpo: object): void; aoExcluir(): void }) {
  const [descricao, setDescricao] = useState(l.descricao);
  const [valor, setValor] = useState(brl(l.valor.replace("-", "")).replace("R$ ", ""));
  const [data, setData] = useState(l.data);
  return (
    <div class="veu" onClick={(e) => e.target === e.currentTarget && aoFechar()}>
      <div class="folha" role="dialog" aria-modal="true" aria-labelledby="t-editar">
        <div class="topo"><h3 id="t-editar">Editar lançamento</h3><button class="icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button></div>
        <form onSubmit={(e) => { e.preventDefault(); aoSalvar({ descricao, valor, data }); }}>
          <div class="campo"><label for="e-desc">Descrição</label><input id="e-desc" value={descricao} maxLength={200} onInput={(e) => setDescricao(e.currentTarget.value)} /></div>
          <div class="campo"><label for="e-val">Valor (R$)</label><input id="e-val" class="grande-in" inputMode="decimal" value={valor} onInput={(e) => setValor(e.currentTarget.value)} /></div>
          <div class="campo"><label for="e-data">Data</label><input id="e-data" type="date" value={data} onInput={(e) => setData(e.currentTarget.value)} /></div>
          <p class="nota">{[l.categoria, l.conta].filter(Boolean).join(" · ")}</p>
          <div style="margin-top:16px"><button type="submit" class="btn-tinta">Salvar</button></div>
        </form>
        <div class="rodape"><button class="btn" style="color:var(--fora)" onClick={aoExcluir}>Excluir “{l.descricao || l.categoria}”</button></div>
      </div>
    </div>
  );
}
