import type { Centavos } from "./dinheiro.ts";

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
/** Valor em reais escrito num texto ("R$ 42,50", "-42,50", "1.234,56"). */
export const TEM_VALOR = /(?<![\d/-])-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}(?![\d/-])/;

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
  const i = /^(\d{4})-(\d{2})-(\d{2})(?:[t ][\d:.z+-]*)?$/.exec(t);
  if (i) return { dia: Number(i[3]), mes: Number(i[2]), ano: Number(i[1]) };
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
  const lido = lerValorDeExtrato(trechoValor);
  if (lido === null || lido === 0n) return null;
  const abs = lido < 0n ? -lido : lido;
  // Sinal escrito só conta quando o trecho traz um: "87,40" sozinho não diz nada.
  const sinal = /^\s*[-−]|[-−]\s*$|D\s*$/i.test(trechoValor) ? -1 : /^\s*\+|\+\s*$|C\s*$/i.test(trechoValor) ? 1 : 0;
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

/**
 * Número de extrato em qualquer das duas grafias: "1.234,56", "-87,40", "R$ -87,40",
 * "-87.40", "1234.56", "1,234.56". Precisa ter exatamente 2 casas decimais. Null se não for.
 */
export function lerValorDeExtrato(trecho: string): Centavos | null {
  const t = trecho.replace(/R\$/gi, "").replace(/\s/g, "").replace(/−/g, "-");
  const m = /^([-+])?(?:(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})|(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2}))([-+CD])?$/i.exec(t);
  if (!m) return null;
  const inteiro = (m[2] ?? m[4]!).replace(/[.,]/g, ""), dec = m[3] ?? m[5]!;
  const v = BigInt(inteiro) * 100n + BigInt(dec);
  const neg = m[1] === "-" || m[6] === "-" || m[6]?.toUpperCase() === "D";
  return neg ? -v : v;
}

const COLUNAS = {
  data: /^(data|date|dia)(\b|[ _]|$)/,
  descricao: /(descri|hist[oó]rico|lan[cç]amento|estabelecimento|detalhe|t[ií]tulo|movimenta|nome|favorecido|destin|origem|benefici|pagador|recebedor|contraparte|para$|^de$)/,
  valor: /^(valor|value|montante|quantia)/,
  entrada: /(entrada|cr[eé]dito)/,
  saida: /(sa[ií]da|d[eé]bito)/,
  tipo: /^(tipo|natureza|opera[cç][aã]o)/,
};

/** Divide uma linha de CSV respeitando aspas. */
function celulas(linha: string, sep: string): string[] {
  const out: string[] = [];
  let atual = "", aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i]!;
    if (ch === '"') { if (aspas && linha[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas; }
    else if (ch === sep && !aspas) { out.push(atual.trim()); atual = ""; }
    else atual += ch;
  }
  out.push(atual.trim());
  return out;
}

function dataDeCelula(c: string): string | null {
  let m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(c);
  if (m) return dataValida(+m[3]!, +m[2]!, +m[1]!) ? iso(+m[3]!, +m[2]!, +m[1]!) : null;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(c);
  if (m) return dataValida(+m[1]!, +m[2]!, +m[3]!) ? iso(+m[1]!, +m[2]!, +m[3]!) : null;
  return null;
}

/**
 * CSV de extrato de qualquer banco, pelo cabeçalho: acha as colunas de data, descrição
 * e valor (ou entrada e saída separadas). Null se o texto não parecer um CSV assim.
 */
export function lerCsvDeExtrato(texto: string): { linhas: { data: string; descricao: string; valor: Centavos; original: string }[]; ignoradas: number } | null {
  const brutas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  for (let h = 0; h < Math.min(brutas.length, 15); h++) {
    const sep = [";", ",", "\t"].map((s) => [s, celulas(brutas[h]!, s).length] as const).sort((a, b) => b[1] - a[1])[0]!;
    if (sep[1] < 2) continue;
    const cab = celulas(brutas[h]!, sep[0]).map((c) => semAcento(c).toLowerCase().replace(/^"|"$/g, "").trim());
    const achar = (re: RegExp, menos: number[] = []) => cab.findIndex((c, i) => re.test(c) && !menos.includes(i));
    const iData = achar(COLUNAS.data);
    if (iData < 0) continue;
    const iValor = achar(COLUNAS.valor, [iData]);
    const iEntrada = iValor < 0 ? achar(COLUNAS.entrada, [iData]) : -1, iSaida = iValor < 0 ? achar(COLUNAS.saida, [iData]) : -1;
    if (iValor < 0 && (iEntrada < 0 || iSaida < 0)) continue;
    const usadas = [iData, iValor, iEntrada, iSaida];
    const iTipo = achar(COLUNAS.tipo, usadas);
    // Toda coluna de texto que descreve a movimentação entra: descrição, nome de quem recebeu ou pagou.
    const iDescs = cab.flatMap((c, i) => (COLUNAS.descricao.test(c) && !usadas.includes(i) && i !== iTipo ? [i] : []));
    const linhas: { data: string; descricao: string; valor: Centavos; original: string }[] = [];
    let ignoradas = 0;
    for (const bruta of brutas.slice(h + 1)) {
      const c = celulas(bruta, sep[0]);
      const data = dataDeCelula(c[iData] ?? "");
      let valor: Centavos | null = null;
      if (iValor >= 0) valor = lerValorDeExtrato(c[iValor] ?? "");
      else {
        const e = lerValorDeExtrato(c[iEntrada] ?? ""), s = lerValorDeExtrato(c[iSaida] ?? "");
        valor = e && e !== 0n ? (e < 0n ? -e : e) : s && s !== 0n ? (s > 0n ? -s : s) : null;
      }
      if (!data || valor === null || valor === 0n) { ignoradas++; continue; }
      const partes = [...iDescs.map((i) => c[i]), iTipo >= 0 ? c[iTipo] : ""].filter((x): x is string => !!x && !!x.trim());
      const original = c.filter((x) => x.trim()).join(" · ").slice(0, 300);
      linhas.push({ data, descricao: [...new Set(partes)].join(" · ").replace(/\s+/g, " ").trim().slice(0, 200) || "Sem descrição", valor, original });
    }
    if (linhas.length) return { linhas, ignoradas };
  }
  return null;
}
