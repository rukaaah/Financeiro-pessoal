import { type Centavos, deDigitado } from "./dinheiro.ts";

/**
 * Leitura de extrato pela IA (pedido do Pedro, 2026-11-07): o extrato precisa ser
 * entendido mesmo num formato que a regra não conhece, e as movimentações de cofrinho
 * precisam virar cofrinhos com o nome que aparece no extrato.
 *
 * A IA propõe; esta regra confere. Cada item que volta precisa apontar a linha do texto
 * e copiar dela o trecho do valor e o da data. O valor e a data são relidos aqui, por
 * regra, a partir desses trechos: a IA nunca é a fonte de um número.
 */

export type TipoDaLinha = "gasto" | "entrada" | "guardar" | "resgatar";
export const TIPOS_DA_LINHA: readonly TipoDaLinha[] = ["gasto", "entrada", "guardar", "resgatar"];

export interface LinhaLidaPelaIA {
  readonly linha: number;
  readonly data: string; // AAAA-MM-DD
  readonly descricao: string;
  readonly valor: Centavos; // negativo sai da conta, positivo entra
  readonly tipo: TipoDaLinha;
  readonly cofrinho: string | null;
  readonly categoria_id: string | null;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const VALOR_NO_TRECHO = /^\s*([-+−])?\s*(?:R\$)?\s*([-+−])?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*([-+−]|[CD])?\s*$/i;
/** Valor em reais escrito num texto ("R$ 42,50", "-42,50", "1.234,56"). */
export const TEM_VALOR = /(?:R\$\s?)?-?\s?\b\d{1,3}(?:\.\d{3})*,\d{2}\b/;

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function dataValida(a: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(a, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * Dia, mês e (se houver) ano de um trecho de data de extrato: "03/11", "03/11/2026",
 * "3 de novembro", "03 NOV 2026", "3 de nov. de 2026". Null se não for data.
 */
export function lerTrechoDeData(trecho: string): { dia: number; mes: number; ano: number | null } | null {
  const t = semAcento(trecho).toLowerCase().replace(/\s+/g, " ").trim();
  const n = /^(?:[a-z]+,? )?(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(t);
  if (n) {
    const ano = n[3] ? Number(n[3].length === 2 ? `20${n[3]}` : n[3]) : null;
    return { dia: Number(n[1]), mes: Number(n[2]), ano };
  }
  const e = /^(?:[a-z]+,? )?(\d{1,2})(?: de)? ([a-z]{3})[a-z]*\.?(?:(?: de)? (\d{4}))?$/.exec(t);
  if (e) {
    const mes = MESES.indexOf(e[2]!) + 1;
    if (mes > 0) return { dia: Number(e[1]), mes, ano: e[3] ? Number(e[3]) : null };
  }
  return null;
}

/** Sinal explícito no trecho do valor: -1, +1 ou 0 (sem sinal). */
function sinalDoTrecho(m: RegExpExecArray): -1 | 0 | 1 {
  const s = (m[1] ?? m[2] ?? "").toUpperCase(), depois = (m[4] ?? "").toUpperCase();
  if (s === "-" || s === "−" || depois === "-" || depois === "−" || depois === "D") return -1;
  if (s === "+" || depois === "+" || depois === "C") return 1;
  return 0;
}

const SAI: Record<TipoDaLinha, boolean> = { gasto: true, guardar: true, entrada: false, resgatar: false };

/**
 * Confere o que a IA devolveu contra as linhas que ela recebeu. Descarta o item cujo
 * trecho de valor não está na linha citada, cuja data não aparece até ali, cujo sinal
 * escrito contradiz o tipo, ou cujo cofrinho não aparece por perto no texto.
 */
export function conferirLeituraDaIA(linhas: readonly string[], itens: unknown, hoje: string): { linhas: LinhaLidaPelaIA[]; descartadas: number } {
  const lidas: LinhaLidaPelaIA[] = [];
  const vistas = new Set<string>();
  let descartadas = 0;
  for (const bruto of Array.isArray(itens) ? itens : []) {
    const r = conferirItem(linhas, bruto as Record<string, unknown>, hoje);
    if (!r) { descartadas++; continue; }
    const chave = `${r.linha}|${r.valor}`;
    if (vistas.has(chave)) { descartadas++; continue; }
    vistas.add(chave);
    lidas.push(r);
  }
  return { linhas: lidas.sort((a, b) => a.linha - b.linha), descartadas };
}

function conferirItem(linhas: readonly string[], it: Record<string, unknown>, hoje: string): LinhaLidaPelaIA | null {
  if (!it || typeof it !== "object") return null;
  const n = Number(it.linha);
  if (!Number.isInteger(n) || n < 0 || n >= linhas.length) return null;
  const texto = linhas[n]!;
  const tipo = TIPOS_DA_LINHA.includes(it.tipo as TipoDaLinha) ? (it.tipo as TipoDaLinha) : null;
  if (!tipo) return null;

  // Valor: o trecho é cópia literal da linha e é relido aqui.
  const trechoValor = typeof it.trecho_valor === "string" ? it.trecho_valor.trim() : "";
  if (!trechoValor || !texto.includes(trechoValor)) return null;
  const mv = VALOR_NO_TRECHO.exec(trechoValor);
  if (!mv) return null;
  const abs = deDigitado(mv[3]!);
  if (abs <= 0n) return null;
  const sinal = sinalDoTrecho(mv);
  if (sinal !== 0 && (sinal < 0) !== SAI[tipo]) return null;
  const valor = SAI[tipo] ? -abs : abs;

  // Data: o trecho está na linha citada ou numa das 60 anteriores (extratos agrupam por dia).
  const trechoData = typeof it.trecho_data === "string" ? it.trecho_data.trim() : "";
  if (!trechoData || !linhas.slice(Math.max(0, n - 60), n + 1).some((l) => l.includes(trechoData))) return null;
  const d = lerTrechoDeData(trechoData);
  if (!d) return null;
  const data = anoDaData(d, typeof it.data === "string" ? it.data : "", hoje);
  if (!data) return null;

  // Cofrinho: o nome precisa estar no texto perto da linha, para não vir da imaginação da IA.
  let cofrinho: string | null = null;
  if (tipo === "guardar" || tipo === "resgatar") {
    cofrinho = typeof it.cofrinho === "string" ? it.cofrinho.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    const perto = linhas.slice(Math.max(0, n - 2), n + 3).join(" ").toLowerCase();
    if (!cofrinho || !perto.includes(cofrinho.toLowerCase())) return null;
  }

  const descricao = (typeof it.descricao === "string" && it.descricao.trim() ? it.descricao : texto.replace(trechoValor, ""))
    .replace(/\s+/g, " ").trim().slice(0, 200) || (cofrinho ? `Cofrinho ${cofrinho}` : "Sem descrição");
  const categoria_id = (tipo === "gasto" || tipo === "entrada") && typeof it.categoria_id === "string" ? it.categoria_id : null;
  return { linha: n, data, descricao, valor, tipo, cofrinho, categoria_id };
}

/** Ano da data: o escrito no trecho; senão o que a IA propôs, se plausível; senão o mais recente que não passe de hoje. */
function anoDaData(d: { dia: number; mes: number; ano: number | null }, proposta: string, hoje: string): string | null {
  const anoHoje = Number(hoje.slice(0, 4));
  let ano = d.ano;
  if (ano === null) {
    const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(proposta);
    const anoP = p && Number(p[2]) === d.mes && Number(p[3]) === d.dia ? Number(p[1]) : null;
    if (anoP !== null && anoP >= anoHoje - 1 && iso(anoP, d.mes, d.dia) <= hoje) ano = anoP;
    else ano = iso(anoHoje, d.mes, d.dia) > hoje ? anoHoje - 1 : anoHoje;
  }
  return dataValida(ano, d.mes, d.dia) ? iso(ano, d.mes, d.dia) : null;
}

/**
 * Linhas com valor em reais que nenhum item aceito usou. Não acusa linha de saldo.
 * Serve para avisar "a IA deixou estas de fora", já que a conferência pega valor
 * inventado mas não pega omissão.
 */
export function linhasComValorDeFora(linhas: readonly string[], usadas: readonly number[]): number[] {
  const u = new Set(usadas);
  return linhas.flatMap((l, i) => (!u.has(i) && TEM_VALOR.test(l) && !/\bsaldo\b/i.test(l) ? [i] : []));
}

/**
 * Cofrinho numa descrição já lida pela regra ("Guardado no Cofrinho Viagem",
 * "Resgate cofrinho: Reserva"). Devolve o nome ou null.
 */
export function cofrinhoNaDescricao(descricao: string): string | null {
  const m = /\bcofrinho\b\s*[:\-–]?\s*(?:(?:d[aeo]s?|n[ao]s?)\s+)?(.+)$/i.exec(descricao.replace(/\s+/g, " ").trim());
  const nome = m?.[1]?.replace(/^["'“]|["'”]$/g, "").trim();
  return nome ? nome.slice(0, 60) : null;
}

/** Nome de cofrinho comparável: sem acento, sem caixa, sem espaço sobrando. */
export const chaveDoCofrinho = (nome: string) => semAcento(nome).toLowerCase().replace(/\s+/g, " ").trim();
