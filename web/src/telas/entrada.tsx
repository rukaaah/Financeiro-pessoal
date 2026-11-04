import { conferirSaldos, lerExtrato, lerNotificacao, paraNumeric } from "@financeiro/dominio";
import { useState } from "preact/hooks";
import { apiEntrada, apiIA, brl, hoje, type LinhaImportada, type Opcoes } from "../api.ts";
import { Icone } from "../icone.tsx";
import type { Inicial } from "./lancar.tsx";

/** Colar a notificação do banco: a regra lê e abre o Lançar preenchido. Nada é gravado sem conferir. */
export function ColarNotificacao({ opcoes, aoFechar, aoAbrir }: { opcoes: Opcoes | null; aoFechar(): void; aoAbrir(i: Inicial, intencao: "gastei" | "recebi"): void }) {
  const [texto, setTexto] = useState("");
  const lido = texto.trim() ? lerNotificacao(texto, hoje()) : null;
  async function abrir() {
    if (!lido) return;
    const tipo = lido.sentido === "entrada" ? "income" : "expense";
    const sug = lido.estabelecimento ? await apiEntrada.sugerir(lido.estabelecimento, tipo).catch(() => ({ categoria_id: null })) : { categoria_id: null };
    const conta = opcoes?.contas.find((c) => (lido.noCartao ? c.tipo === "credit_card" : c.tipo !== "credit_card"));
    aoAbrir({ valor: paraNumeric(lido.valor).replace(".", ","), descricao: lido.estabelecimento ?? "", contaId: conta?.id, categoriaId: sug.categoria_id ?? undefined }, lido.sentido === "entrada" ? "recebi" : "gastei");
  }
  return (
    <div class="veu" onClick={(e) => e.target === e.currentTarget && aoFechar()}><div class="folha" role="dialog" aria-modal="true" aria-labelledby="t-colar">
      <div class="topo"><h3 id="t-colar">Colar notificação</h3><button class="icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button></div>
      <div class="campo"><label for="c-txt">Texto da notificação ou do SMS</label><textarea id="c-txt" rows={4} style="font:inherit;font-size:16px;padding:10px;border-radius:4px;border:1px solid var(--t2);background:var(--sup);color:var(--tinta)" value={texto} onInput={(e) => setTexto(e.currentTarget.value)} onPaste={(e) => setTexto(e.clipboardData?.getData("text") ?? "")} /></div>
      {texto.trim() && (lido
        ? <p class="nota">Li: <b>{brl(paraNumeric(lido.valor))} · {lido.estabelecimento ?? "sem estabelecimento"} · {lido.data ? `${lido.data.slice(8)}/${lido.data.slice(5, 7)}` : "hoje"} · {lido.sentido === "entrada" ? "entrada" : lido.noCartao ? "cartão" : "saída"}{lido.parcelas ? ` · ${lido.parcelas}x` : ""}</b></p>
        : <p class="erro-campo">Não reconheci este formato. <button class="link-sub" onClick={() => apiIA.notificacao(texto).then((r) => { if (r.reconheceu && r.valor) aoAbrir({ valor: (Number(r.valor) / 100).toFixed(2).replace(".", ","), descricao: r.estabelecimento ?? "" }, r.sentido === "entrada" ? "recebi" : "gastei"); }).catch(() => {})}>Tentar com a IA</button></p>)}
      <div style="margin-top:12px"><button class="btn-tinta" disabled={!lido} onClick={abrir}>Abrir em {lido?.sentido === "entrada" ? "Recebi" : "Gastei"}</button></div>
    </div></div>
  );
}

async function textoDoPdf(arquivo: File): Promise<string> {
  // Carregado só aqui, para não pesar na primeira tela. O PDF é lido no celular e não sai dele.
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  const doc = await pdfjs.getDocument({ data: await arquivo.arrayBuffer() }).promise;
  const linhas: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const conteudo = await (await doc.getPage(p)).getTextContent();
    const porY = new Map<number, string[]>();
    for (const it of conteudo.items as { str: string; transform: number[] }[]) {
      const y = Math.round(it.transform[5]!);
      porY.set(y, [...(porY.get(y) ?? []), it.str]);
    }
    for (const y of [...porY.keys()].sort((a, b) => b - a)) linhas.push(porY.get(y)!.join(" "));
  }
  return linhas.join("\n");
}

export function ImportarExtrato({ opcoes, aoFechar, aoImportado }: { opcoes: Opcoes | null; aoFechar(): void; aoImportado(n: number): void }) {
  const contas = opcoes?.contas.filter((c) => c.tipo === "checking" || c.tipo === "cash") ?? [];
  const [conta, setConta] = useState(contas[0]?.id ?? "");
  const [linhas, setLinhas] = useState<(LinhaImportada & { incluir: boolean })[] | null>(null);
  const [aviso, setAviso] = useState("");
  const [carregando, setCarregando] = useState(false);
  async function ler(texto: string) {
    const lido = lerExtrato(texto);
    if (!lido.linhas.length) return setAviso("Não encontrei movimentações nesse texto. O formato do extrato do PicPay ainda precisa ser conferido com um exemplo.");
    const div = lido.saldos.length ? conferirSaldos(lido, lido.saldos[0]!.saldo - lido.linhas.filter((l) => l.data <= lido.saldos[0]!.data).reduce((t, l) => t + l.valor, 0n)) : [];
    setAviso(div.length ? `O saldo impresso não fecha em ${div.length} dia(s), a partir de ${div[0]!.data.slice(8)}/${div[0]!.data.slice(5, 7)}. Confira antes de importar.` : lido.saldos.length ? "Conferido pelo saldo diário impresso." : "");
    const previa = await apiEntrada.previa(conta || contas[0]?.id || "", lido.linhas.map((l) => ({ data: l.data, descricao: l.descricao, valor: paraNumeric(l.valor) })));
    setLinhas(previa.linhas.map((l) => ({ ...l, incluir: !l.duplicada })));
  }
  async function arquivo(f: File) {
    setCarregando(true);
    try { await ler(f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf") ? await textoDoPdf(f) : await f.text()); }
    catch (e) { setAviso(e instanceof Error ? e.message : "Não deu para ler o arquivo."); }
    finally { setCarregando(false); }
  }
  const cats = opcoes?.categorias ?? [];
  const prontas = linhas?.filter((l) => l.incluir) ?? [];
  const faltaCategoria = prontas.some((l) => !l.categoria_id);
  return (
    <div class="veu" onClick={(e) => e.target === e.currentTarget && aoFechar()}><div class="folha" role="dialog" aria-modal="true" aria-labelledby="t-imp">
      <div class="topo"><h3 id="t-imp">Importar extrato</h3><button class="icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button></div>
      <p class="sub">O arquivo é lido aqui no celular; só as linhas que você confirmar vão para o app. Nada é gravado antes do botão Importar.</p>
      <div class="campo"><label for="i-conta">Conta</label><select id="i-conta" value={conta} onChange={(e) => setConta(e.currentTarget.value)}>{contas.map((c) => <option value={c.id}>{c.nome}</option>)}</select></div>
      <div class="campo"><label for="i-arq">Extrato (PDF ou texto)</label><input id="i-arq" type="file" accept=".pdf,.txt,.csv,application/pdf,text/plain" onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) arquivo(f); }} /></div>
      {carregando && <p class="nota">Lendo o extrato…</p>}
      {aviso && <p class="nota">{aviso}</p>}
      {linhas && (
        <>
          <section><h2>Revisar <span class="lado">{prontas.length} de {linhas.length}</span></h2>
            <div class="lista">{linhas.map((l, i) => (
              <div class="item">
                <label class="nome" style="display:flex;gap:8px;align-items:center"><input type="checkbox" checked={l.incluir} onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, incluir: e.currentTarget.checked } : x)))} />{l.descricao}</label>
                <span class="valor">{brl(l.valor, !l.valor.startsWith("-"))}</span>
                <span class="sub">{l.data.slice(8)}/{l.data.slice(5, 7)}{l.duplicada ? " · já lançado" : ""}</span>
                <select aria-label={`Categoria de ${l.descricao}`} value={l.categoria_id ?? ""} onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, categoria_id: e.currentTarget.value } : x)))} style="font-size:14px;max-width:150px">
                  <option value="">Categoria…</option>
                  {cats.filter((c) => c.tipo === (l.valor.startsWith("-") ? "expense" : "income")).map((c) => <option value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            ))}</div>
          </section>
          {faltaCategoria && <p class="erro-campo">Escolha a categoria de todas as linhas marcadas.</p>}
          <div style="margin-top:12px"><button class="btn-tinta" disabled={!prontas.length || faltaCategoria} onClick={() => apiEntrada.importar(conta || contas[0]?.id || "", prontas).then((r) => aoImportado(r.importadas)).catch((e: Error) => setAviso(e.message))}>Importar {prontas.length}</button></div>
        </>
      )}
    </div></div>
  );
}
