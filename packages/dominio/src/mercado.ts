import { type Centavos } from "./dinheiro.ts";
import { centavosDe, deDecimal6 } from "./investimentos.ts";

/**
 * Rendimento da carteira por ativo e por classe, caminho da Selic pelas decisões do
 * Copom e histórico de funcionamento de um FII. Só fontes oficiais: informe mensal da
 * CVM (ADR-020) e os comunicados do Copom publicados pelo Banco Central.
 */

/** Uma compra (quantidade > 0) ou venda (< 0), com a data do pregão. */
export interface OperacaoDatada { readonly data: string; readonly quantidade: string }
/** Rendimento declarado por cota no mês (CVM: DY do mês × VP da cota do mês anterior). */
export interface RendimentoDoMes { readonly mes: string; readonly porCota: string }

/**
 * Proventos do ativo pelos informes da CVM: em cada mês, o rendimento por cota vezes as
 * cotas que você já tinha no primeiro dia do mês. Conservador: compra feita no meio do
 * mês só conta a partir do mês seguinte.
 */
export function proventosEstimados(ops: readonly OperacaoDatada[], rendimentos: readonly RendimentoDoMes[]): Centavos {
  let total = 0n;
  for (const r of rendimentos) {
    const inicio = `${r.mes}-01`;
    const cotas = ops.filter((o) => o.data < inicio).reduce((s, o) => s + deDecimal6(o.quantidade), 0n);
    if (cotas > 0n) total += centavosDe(cotas, deDecimal6(r.porCota));
  }
  return total;
}

export interface Rendimento { readonly valorizacao: number | null; readonly proventos: number | null; readonly total: number | null }
const pct1 = (parte: bigint, base: bigint) => Number((parte * 10000n) / base) / 100;

/** Percentuais sobre o custo: valorização da cota, proventos e a soma dos dois. */
export function rendimentoSobreCusto(custo: Centavos, valor: Centavos, proventos: Centavos): Rendimento {
  if (custo <= 0n) return { valorizacao: null, proventos: null, total: null };
  return { valorizacao: pct1(valor - custo, custo), proventos: pct1(proventos, custo), total: pct1(valor - custo + proventos, custo) };
}

export type AcaoDoCopom = "manteve" | "reduziu" | "elevou";
export interface DecisaoDoCopom { readonly reuniao: number; readonly data: string; readonly acao: AcaoDoCopom; readonly taxa: number }

/** Lê a decisão do título oficial, como "282ª reunião - Copom mantém a taxa Selic em 13,75% a.a.". */
export function lerDecisao(reuniao: number, data: string, titulo: string): DecisaoDoCopom | null {
  const m = /(mant[ée]m|reduz|eleva)\b[^0-9]*?(\d{1,2},\d{1,2})\s*%/i.exec(titulo);
  if (!m) return null;
  const verbo = m[1]!.toLowerCase();
  const acao: AcaoDoCopom = verbo.startsWith("mant") ? "manteve" : verbo === "reduz" ? "reduziu" : "elevou";
  return { reuniao, data, acao, taxa: Number(m[2]!.replace(",", ".")) };
}

export type Fase = "manutencao" | "queda" | "alta";
export interface CaminhoDaSelic {
  readonly taxa: number; readonly fase: Fase; readonly ultima: DecisaoDoCopom;
  /** Reuniões seguidas com a mesma ação, contando a última. */
  readonly seguidas: number;
  /** O movimento antes da pausa atual, se houver: ação e quanto mudou no total. */
  readonly antes: { readonly acao: "reduziu" | "elevou"; readonly reunioes: number; readonly pontos: number | null } | null;
  readonly historico: readonly DecisaoDoCopom[];
}

/** Fase atual pela última decisão; em manutenção, diz qual foi o ciclo anterior. */
export function caminhoDaSelic(decisoes: readonly DecisaoDoCopom[]): CaminhoDaSelic | null {
  const h = [...decisoes].sort((a, b) => b.reuniao - a.reuniao);
  const ultima = h[0];
  if (!ultima) return null;
  const fase: Fase = ultima.acao === "manteve" ? "manutencao" : ultima.acao === "reduziu" ? "queda" : "alta";
  let seguidas = 0;
  while (seguidas < h.length && h[seguidas]!.acao === ultima.acao) seguidas++;
  let antes: CaminhoDaSelic["antes"] = null;
  const mov = h[seguidas];
  if (fase === "manutencao" && mov && mov.acao !== "manteve") {
    let n = 0;
    while (seguidas + n < h.length && h[seguidas + n]!.acao === mov.acao) n++;
    const inicio = h[seguidas + n];
    antes = { acao: mov.acao, reunioes: n, pontos: inicio ? Math.round((mov.taxa - inicio.taxa) * 100) / 100 : null };
  }
  return { taxa: ultima.taxa, fase, ultima, seguidas, antes, historico: h };
}

/** Parágrafos de texto de um comunicado em HTML, sem marcação. */
export function paragrafos(html: string): string[] {
  const ent: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&ordm;": "º", "&ordf;": "ª" };
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/tr|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&[#a-z0-9]+;/gi, (e) => ent[e.toLowerCase()] ?? (/^&#\d+;$/.test(e) ? String.fromCharCode(Number(e.slice(2, -1))) : " "))
    .split(/\n+/).map((t) => t.replace(/\s+/g, " ").trim()).filter((t) => t.length > 0);
}

export interface CotasNoMes { readonly mes: string; readonly cotas: string }
/** Meses em que a quantidade de cotas emitidas cresceu: uma emissão nova entrou. */
export function emissoesDe(serie: readonly CotasNoMes[]): { mes: string; novas: number }[] {
  const s = [...serie].sort((a, b) => a.mes.localeCompare(b.mes));
  const saida: { mes: string; novas: number }[] = [];
  for (let i = 1; i < s.length; i++) {
    const d = Number(s[i]!.cotas) - Number(s[i - 1]!.cotas);
    if (d > 0) saida.push({ mes: s[i]!.mes, novas: d });
  }
  return saida;
}
