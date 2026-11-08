import { csv } from "@financeiro/dominio";
import { useEffect, useState } from "preact/hooks";
import { api, brl, type Lancamento, type ListaDoMes, type Opcoes } from "../api.ts";
import { Icone } from "../icone.tsx";
import { mesDaFatura } from "./lancar.tsx";

const FMT_DIA = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const nomeDoDia = (d: string) => FMT_DIA.format(new Date(`${d}T12:00:00Z`)).replace(/\./g, "");
const FILTROS = { Tudo: () => true, Gastos: (l: Lancamento) => l.tipo === "expense", Entradas: (l: Lancamento) => l.tipo === "income", Transferências: (l: Lancamento) => l.tipo === "transfer" } as const;

export function Lancamentos({ lista, ocultos, aoEditar, aoAbrirLancar, aoColar, aoImportar }: { lista: ListaDoMes | null; ocultos: Set<string>; aoEditar(l: Lancamento): void; aoAbrirLancar(): void; aoColar(): void; aoImportar(): void }) {
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
        <button class="btn" onClick={aoImportar}><Icone nome="importar" tamanho={20} />Importar extrato</button>
        <button class="btn" onClick={aoColar}><Icone nome="colar" tamanho={20} />Colar notificação</button>
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
              <button class="item" onClick={() => aoEditar(l)}>
                <span class="nome">{l.tipo === "transfer" && <Icone nome="transferencia" tamanho={16} />} {l.descricao || l.categoria || "Sem descrição"}</span>
                <span class={`valor ${l.tipo === "income" ? "entrada" : ""}`}>{l.tipo === "transfer" ? brl(l.valor.replace("-", "")) : brl(l.valor, l.tipo === "income")}</span>
                <span class="sub">{[l.tipo === "transfer" ? "Transferência" : l.categoria, l.conta_destino ? `${l.conta} → ${l.conta_destino}` : l.conta, l.mes_da_fatura && `fatura ${l.mes_da_fatura.slice(5, 7)}/${l.mes_da_fatura.slice(0, 4)}`, l.parcela && `parcela ${l.parcela}/${l.parcelas}`].filter(Boolean).join(" · ")}</span>
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

const TIPO_DE_CONTA: Record<string, string> = { checking: "conta", cash: "dinheiro", credit_card: "cartão", goal: "cofrinho", investment: "investimento", receivable: "a receber" };
const semSinal = (v: string) => brl(v.replace("-", "")).replace("R$ ", "");

/** Edita todos os campos. Compra parcelada se edita inteira; transferência, nas duas pernas. */
export function Editar({ l, opcoes, aoFechar, aoSalvar, aoExcluir }: { l: Lancamento; opcoes: Opcoes | null; aoFechar(): void; aoSalvar(corpo: object): void; aoExcluir(): void }) {
  const transferencia = l.tipo === "transfer";
  const [tipo, setTipo] = useState<"expense" | "income">(l.tipo === "income" ? "income" : "expense");
  const [descricao, setDescricao] = useState(l.descricao);
  const [valor, setValor] = useState(semSinal(l.valor_total ?? l.valor));
  const [data, setData] = useState(l.data);
  const [contaId, setContaId] = useState(l.conta_id);
  const [destinoId, setDestinoId] = useState(l.conta_destino_id ?? "");
  const [categoriaId, setCategoriaId] = useState(l.categoria_id ?? "");
  const [parcelas, setParcelas] = useState(l.parcelas ?? 1);
  const [fatura, setFatura] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  const categorias = opcoes?.categorias.filter((c) => c.tipo === tipo) ?? [];
  const contas = opcoes?.contas.filter((c) => tipo === "expense" || c.tipo !== "credit_card") ?? [];
  const conta = contas.find((c) => c.id === contaId);
  // Na transferência, cada lado troca só por conta do mesmo tipo: aporte continua aporte.
  const todas = opcoes?.todas_as_contas ?? [];
  const origens = todas.filter((c) => c.tipo === l.tipo_conta), destinos = todas.filter((c) => c.tipo === l.tipo_conta_destino);
  const maxParcelas = Math.max(12, l.parcelas ?? 1);

  useEffect(() => {
    if (transferencia || !opcoes) return;
    if (!contas.some((c) => c.id === contaId)) setContaId(contas[0]?.id ?? "");
    if (!categorias.some((c) => c.id === categoriaId)) setCategoriaId(categorias[0]?.id ?? "");
  }, [opcoes, tipo]);
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
    if (!data) return setErro("Escolha a data.");
    if (transferencia) {
      if (contaId === destinoId) return setErro("Origem e destino precisam ser contas diferentes.");
      return aoSalvar({ descricao: descricao.trim(), valor: valor.trim(), data, conta_id: contaId, conta_destino_id: destinoId });
    }
    if (!contaId || !categoriaId) return setErro("Escolha conta e categoria.");
    aoSalvar({ tipo, descricao: descricao.trim(), valor: valor.trim(), data, conta_id: contaId, categoria_id: categoriaId, parcelas: conta?.tipo === "credit_card" ? parcelas : 1 });
  }

  const opcao = (c: { id: string; nome: string }) => <option value={c.id}>{c.nome}</option>;
  return (
    <div class="veu" onClick={(e) => e.target === e.currentTarget && aoFechar()}>
      <div class="folha" role="dialog" aria-modal="true" aria-labelledby="t-editar">
        <div class="topo"><h3 id="t-editar">{transferencia ? "Editar transferência" : "Editar lançamento"}</h3><button class="icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button></div>
        {!transferencia && (
          <div class="chips" role="group" aria-label="Tipo">
            {(["expense", "income"] as const).map((x) => <button type="button" class="chip" aria-pressed={x === tipo} onClick={() => { setTipo(x); setErro(""); }}>{x === "expense" ? "Gastei" : "Recebi"}</button>)}
          </div>
        )}
        {!opcoes ? <p class="sub">Carregando contas e categorias…</p> : (
          <form onSubmit={salvar}>
            <div class="campo"><label for="e-val">{parcelas > 1 ? "Valor total (R$)" : "Valor (R$)"}</label><input id="e-val" class="grande-in" inputMode="decimal" autoComplete="off" value={valor} onInput={(e) => { setValor(e.currentTarget.value); setErro(""); }} /></div>
            {transferencia ? (
              <>
                <div class="campo"><label for="e-de">De ({TIPO_DE_CONTA[l.tipo_conta] ?? "conta"})</label>
                  <select id="e-de" value={contaId} onChange={(e) => setContaId(e.currentTarget.value)}>{origens.map(opcao)}</select></div>
                <div class="campo"><label for="e-para">Para ({TIPO_DE_CONTA[l.tipo_conta_destino ?? ""] ?? "conta"})</label>
                  <select id="e-para" value={destinoId} onChange={(e) => setDestinoId(e.currentTarget.value)}>{destinos.map(opcao)}</select></div>
              </>
            ) : (
              <>
                <div class="campo"><label for="e-cat">Categoria</label>
                  <select id="e-cat" value={categoriaId} onChange={(e) => setCategoriaId(e.currentTarget.value)}>
                    {categorias.map((c) => <option value={c.id}>{c.grupo} · {c.nome}</option>)}
                  </select></div>
                <div class="campo"><label for="e-conta">{tipo === "expense" ? "Pago com" : "Entrou em"}</label>
                  <select id="e-conta" value={contaId} onChange={(e) => setContaId(e.currentTarget.value)}>{contas.map(opcao)}</select></div>
                {conta?.tipo === "credit_card" && (
                  <>
                    {fatura && <p class="nota">{parcelas > 1 ? "A 1ª parcela entra" : "Entra"} na <b>fatura que vence em {mesDaFatura(fatura)}</b>.</p>}
                    <div class="campo"><label for="e-parc">Parcelas</label>
                      <select id="e-parc" value={parcelas} onChange={(e) => setParcelas(Number(e.currentTarget.value))}>
                        {Array.from({ length: maxParcelas }, (_, i) => <option value={i + 1}>{i === 0 ? "À vista" : `${i + 1}x`}</option>)}
                      </select></div>
                  </>
                )}
              </>
            )}
            <div class="campo"><label for="e-data">{parcelas > 1 ? "Data da compra" : "Data"}</label><input id="e-data" type="date" value={data} onInput={(e) => setData(e.currentTarget.value)} /></div>
            <div class="campo"><label for="e-desc">Descrição</label><input id="e-desc" value={descricao} maxLength={200} onInput={(e) => setDescricao(e.currentTarget.value)} /></div>
            {(l.parcelas ?? 0) > 1 && <p class="nota">Vale para a compra inteira: as {l.parcelas} parcelas são refeitas a partir do valor total.</p>}
            {transferencia && <p class="nota">Muda os dois lados da transferência.</p>}
            {erro && <p class="erro-campo" role="alert">{erro}</p>}
            <div style="margin-top:16px"><button type="submit" class="btn-tinta"><Icone nome="ok" tamanho={18} />Salvar</button></div>
          </form>
        )}
        <div class="rodape"><button class="btn" style="color:var(--fora)" onClick={aoExcluir}><Icone nome="excluir" tamanho={18} />Excluir “{l.descricao || l.categoria || "lançamento"}”</button></div>
      </div>
    </div>
  );
}
