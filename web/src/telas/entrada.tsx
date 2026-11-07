import { conferirSaldos, lerCsvDeExtrato, lerExtrato, lerNotificacao, paraNumeric } from "@financeiro/dominio";
import { useState } from "preact/hooks";
import { apiEntrada, apiIA, brl, hoje, type LinhaImportada, type Opcoes, type TipoDaLinha } from "../api.ts";
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

const TIPOS: Record<TipoDaLinha, string> = { gasto: "Gasto", entrada: "Entrada", guardar: "Guardar no cofrinho", resgatar: "Resgate do cofrinho" };
const FINALIDADES: [string, string][] = [["withdrawal", "Retirada definitiva"], ["use", "Usado no objetivo"], ["loan", "Empréstimo (a devolver)"]];
type Revisada = LinhaImportada & { incluir: boolean };

export function ImportarExtrato({ opcoes, aoFechar, aoImportado }: { opcoes: Opcoes | null; aoFechar(): void; aoImportado(n: number, cofrinhos: number): void }) {
  const contas = opcoes?.contas.filter((c) => c.tipo === "checking" || c.tipo === "cash") ?? [];
  const [conta, setConta] = useState(contas[0]?.id ?? "");
  const [linhas, setLinhas] = useState<Revisada[] | null>(null);
  const [aviso, setAviso] = useState("");
  const [pelaIA, setPelaIA] = useState(false);
  const [carregando, setCarregando] = useState("");
  const contaId = conta || contas[0]?.id || "";

  /** A IA lê qualquer formato e acha os cofrinhos; a regra fica de reserva (demo, IA desligada ou sem resposta). */
  async function ler(texto: string) {
    setCarregando("A IA está lendo o extrato…");
    let motivoIA = "";
    const ia = await apiIA.extrato(texto).catch((e: Error) => { motivoIA = e.message; return null; });
    if (ia?.demo) motivoIA = ia.motivo ?? "";
    else if (ia && !ia.linhas?.length) motivoIA = "A IA não achou movimentações que conferissem com o texto.";
    const prefixo = motivoIA ? `${motivoIA} ` : "";
    let entrada: LinhaImportada[] = [];
    if (ia?.linhas?.length) {
      entrada = ia.linhas;
      setPelaIA(true);
      const partes = [`A IA leu ${ia.linhas.length} movimentações. Valor e data foram conferidos com o texto do extrato.`];
      if (ia.de_fora) partes.push(`${ia.de_fora} linha(s) com valor ficaram de fora; confira no extrato.`);
      setAviso(partes.join(" "));
    } else {
      setPelaIA(false);
      const csv = lerCsvDeExtrato(texto);
      if (csv) {
        setAviso(`${prefixo}Li ${csv.linhas.length} movimentações pelas colunas do arquivo${csv.ignoradas ? `; ${csv.ignoradas} linha(s) sem data ou valor ficaram de fora` : ""}.`);
        const previa = await apiEntrada.previa(contaId, csv.linhas.map((l) => ({ data: l.data, descricao: l.descricao, valor: paraNumeric(l.valor) })));
        return setLinhas(previa.linhas.map((l) => ({ ...l, incluir: !l.duplicada })));
      }
      const lido = lerExtrato(texto);
      if (!lido.linhas.length) return setAviso(ia?.demo ? "No modo demonstração a IA não lê extratos, e a regra não reconheceu este formato." : "Nem a IA nem a regra encontraram movimentações nesse texto.");
      const div = lido.saldos.length ? conferirSaldos(lido, lido.saldos[0]!.saldo - lido.linhas.filter((l) => l.data <= lido.saldos[0]!.data).reduce((t, l) => t + l.valor, 0n)) : [];
      setAviso(div.length ? `O saldo impresso não fecha em ${div.length} dia(s), a partir de ${div[0]!.data.slice(8)}/${div[0]!.data.slice(5, 7)}. Confira antes de importar.` : lido.saldos.length ? "Conferido pelo saldo diário impresso." : "");
      entrada = lido.linhas.map((l) => ({ data: l.data, descricao: l.descricao, valor: paraNumeric(l.valor) }));
    }
    setCarregando("Conferindo com o que já está lançado…");
    const previa = await apiEntrada.previa(contaId, entrada);
    setLinhas(previa.linhas.map((l) => ({ ...l, incluir: !l.duplicada })));
  }
  async function arquivo(f: File) {
    setCarregando("Lendo o arquivo…");
    try { await ler(f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf") ? await textoDoPdf(f) : await f.text()); }
    catch (e) { setAviso(e instanceof Error ? e.message : "Não deu para ler o arquivo."); }
    finally { setCarregando(""); }
  }
  const mudar = (i: number, m: Partial<Revisada>) => setLinhas((ls) => ls && ls.map((x, j) => (j === i ? { ...x, ...m } : x)));
  const cats = opcoes?.categorias ?? [];
  const prontas = linhas?.filter((l) => l.incluir) ?? [];
  const deCofrinho = (l: LinhaImportada) => l.tipo === "guardar" || l.tipo === "resgatar";
  const faltaCategoria = prontas.some((l) => !deCofrinho(l) && !l.categoria_id);
  const faltaCofrinho = prontas.some((l) => deCofrinho(l) && !l.cofrinho?.trim());
  const novos = [...new Set(prontas.filter((l) => deCofrinho(l) && !l.cofrinho_id && l.cofrinho?.trim()).map((l) => l.cofrinho!.trim()))];
  return (
    <div class="veu" onClick={(e) => e.target === e.currentTarget && aoFechar()}><div class="folha" role="dialog" aria-modal="true" aria-labelledby="t-imp">
      <div class="topo"><h3 id="t-imp">Importar extrato</h3><button class="icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button></div>
      <p class="sub">O PDF é lido aqui no celular. A IA recebe só o texto, sem CPF, e-mail e números de conta. Nada é gravado antes do botão Importar.</p>
      <div class="campo"><label for="i-conta">Conta</label><select id="i-conta" value={conta} onChange={(e) => setConta(e.currentTarget.value)}>{contas.map((c) => <option value={c.id}>{c.nome}</option>)}</select></div>
      <div class="campo"><label for="i-arq">Extrato (PDF ou texto)</label><input id="i-arq" type="file" accept=".pdf,.txt,.csv,application/pdf,text/plain" onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) arquivo(f); }} /></div>
      {carregando && <p class="nota">{carregando}</p>}
      {aviso && <p class="nota">{pelaIA && <span class="selo-ia" style="margin-right:6px"><Icone nome="ia" tamanho={14} />IA</span>}{aviso}</p>}
      {linhas && (
        <>
          <section><h2>Revisar <span class="lado">{prontas.length} de {linhas.length}</span></h2>
            <div class="lista">{linhas.map((l, i) => {
              const sai = l.valor.startsWith("-");
              return (
                <div class="item">
                  <label class="nome" style="display:flex;gap:8px;align-items:center;min-width:0"><input type="checkbox" checked={l.incluir} onChange={(e) => mudar(i, { incluir: e.currentTarget.checked })} /><span style="min-width:0;overflow-wrap:break-word">{l.descricao}</span></label>
                  <span class="valor">{brl(l.valor, !sai)}</span>
                  <span class="sub">{l.data.slice(8)}/{l.data.slice(5, 7)}{l.duplicada ? " · já lançado" : ""}{deCofrinho(l) && l.cofrinho?.trim() ? (l.cofrinho_id ? " · cofrinho existente" : " · cofrinho novo") : ""}</span>
                  <div class="controles-linha">
                    <select aria-label={`Tipo de ${l.descricao}`} value={l.tipo ?? (sai ? "gasto" : "entrada")}
                      onChange={(e) => { const t = e.currentTarget.value as TipoDaLinha; mudar(i, { tipo: t, finalidade: t === "resgatar" ? (l.finalidade ?? "withdrawal") : null }); }}>
                      {(sai ? ["gasto", "guardar"] as const : ["entrada", "resgatar"] as const).map((t) => <option value={t}>{TIPOS[t]}</option>)}
                    </select>
                    {deCofrinho(l)
                      ? <>
                          <input aria-label={`Cofrinho de ${l.descricao}`} placeholder="Nome do cofrinho" value={l.cofrinho ?? ""} onInput={(e) => mudar(i, { cofrinho: e.currentTarget.value, cofrinho_id: null })} />
                          {l.tipo === "resgatar" && <select aria-label={`Finalidade do resgate de ${l.descricao}`} value={l.finalidade ?? "withdrawal"} onChange={(e) => mudar(i, { finalidade: e.currentTarget.value })}>{FINALIDADES.map(([v, n]) => <option value={v}>{n}</option>)}</select>}
                        </>
                      : <select aria-label={`Categoria de ${l.descricao}`} value={l.categoria_id ?? ""} onChange={(e) => mudar(i, { categoria_id: e.currentTarget.value })}>
                          <option value="">Categoria…</option>
                          {cats.filter((c) => c.tipo === (sai ? "expense" : "income")).map((c) => <option value={c.id}>{c.nome}</option>)}
                        </select>}
                  </div>
                </div>
              );
            })}</div>
          </section>
          {novos.length > 0 && <p class="nota">Vou criar {novos.length === 1 ? "o cofrinho" : "os cofrinhos"} {novos.join(", ")}.</p>}
          {faltaCategoria && <p class="erro-campo">Escolha a categoria de todos os gastos e entradas marcados.</p>}
          {faltaCofrinho && <p class="erro-campo">Dê o nome do cofrinho nas linhas de cofrinho.</p>}
          <div style="margin-top:12px"><button class="btn-tinta" disabled={!prontas.length || faltaCategoria || faltaCofrinho} onClick={() => apiEntrada.importar(contaId, prontas).then((r) => aoImportado(r.importadas, r.cofrinhos_criados ?? 0)).catch((e: Error) => setAviso(e.message))}>Importar {prontas.length}</button></div>
        </>
      )}
    </div></div>
  );
}
