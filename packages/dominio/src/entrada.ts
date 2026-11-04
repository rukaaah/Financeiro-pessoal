import { type Centavos, deDigitado } from "./dinheiro.ts";

/**
 * Entrada em lote (fatia 8): colar notificação ou SMS do banco (ideia 11), linhas de
 * extrato (RF05) e categoria sugerida pelo histórico (ideia 13). Tudo por regra; a IA
 * só entra como reserva, na fatia 9, quando a regra não reconhece.
 */

export interface LidoDaNotificacao {
  readonly valor: Centavos;
  readonly data: string | null; // AAAA-MM-DD
  readonly estabelecimento: string | null;
  readonly sentido: "saida" | "entrada";
  readonly noCartao: boolean;
  readonly parcelas: number | null;
}

const VALOR = /R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i;
const DATA = /\b(\d{2})\/(\d{2})(?:\/(\d{2,4}))?\b/;

/** Lê o que importa de uma notificação de compra, PIX ou transferência. Null se não houver valor. */
export function lerNotificacao(texto: string, hoje: string): LidoDaNotificacao | null {
  const t = texto.replace(/\s+/g, " ").trim();
  const v = VALOR.exec(t);
  if (!v) return null;
  const valor = deDigitado(v[1]!);
  let data: string | null = null;
  const d = DATA.exec(t);
  if (d) {
    const ano = d[3] ? (d[3].length === 2 ? `20${d[3]}` : d[3]) : hoje.slice(0, 4);
    data = `${ano}-${d[2]}-${d[1]}`;
    if (!d[3] && data > hoje) data = `${Number(ano) - 1}-${d[2]}-${d[1]}`;
  }
  const entrada = /\b(recebe(u|ido|mos)|pix recebido|transferência recebida|depósito|crédito em conta)\b/i.test(t);
  const noCartao = /\b(cart[aã]o|cr[eé]dito final|compra aprovada)\b/i.test(t) && !entrada;
  const p = /\b(\d{1,2})\s?x\b|parcela\s?\d+\s?\/\s?(\d+)/i.exec(t);
  const parcelas = p ? Number(p[1] ?? p[2]) : null;
  const est = /\b(?:em|no|na|para|de)\s+([A-Z0-9][A-Z0-9 *&.\-]{2,40}?)(?=\s+(?:em|no dia|às|as|dia|valor|R\$)\b|[.,;]|$)/.exec(t);
  const estabelecimento = est ? normalizarEstabelecimento(est[1]!) : null;
  return { valor, data, estabelecimento: estabelecimento || null, sentido: entrada ? "entrada" : "saida", noCartao, parcelas: parcelas && parcelas > 1 ? parcelas : null };
}

/** Maiúsculas, sem números de terminal, sem prefixos de adquirente (PAG*, MP*, IFD*). */
export function normalizarEstabelecimento(nome: string): string {
  return nome.toUpperCase().replace(/^(PAG|MP|IFD|PG|EC|SUMUP|STONE)\s?\*/i, "").replace(/\*/g, " ").replace(/\d{3,}/g, "").replace(/\s+/g, " ").trim();
}

export interface LinhaDeExtrato { readonly data: string; readonly descricao: string; readonly valor: Centavos }
export interface ExtratoLido { readonly linhas: LinhaDeExtrato[]; readonly saldos: { data: string; saldo: Centavos }[]; readonly ignoradas: number }

const LINHA = /^(\d{2})\/(\d{2})\/(\d{4})\s+(.+?)\s+(-|\+)?\s?R\$\s?(-)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*$/i;
const SALDO = /^(\d{2})\/(\d{2})\/(\d{4})\s+saldo(?: do dia| final| ao final do dia)?\s+(-)?\s?R\$\s?(-)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*$/i;

/**
 * Lê o texto de um extrato, uma movimentação por linha ("dd/mm/aaaa descrição -R$ 42,50")
 * e os saldos diários impressos ("dd/mm/aaaa Saldo do dia R$ 1.840,35"). O formato exato
 * do PDF do PicPay ainda precisa ser conferido com um extrato de exemplo.
 */
export function lerExtrato(texto: string): ExtratoLido {
  const linhas: LinhaDeExtrato[] = [], saldos: { data: string; saldo: Centavos }[] = [];
  let ignoradas = 0;
  for (const bruta of texto.split(/\r?\n/)) {
    const l = bruta.replace(/\s+/g, " ").trim();
    if (!l) continue;
    const s = SALDO.exec(l);
    if (s) { const v = deDigitado(s[6]!); saldos.push({ data: `${s[3]}-${s[2]}-${s[1]}`, saldo: s[4] || s[5] ? -v : v }); continue; }
    const m = LINHA.exec(l);
    if (!m) { ignoradas++; continue; }
    const v = deDigitado(m[7]!);
    linhas.push({ data: `${m[3]}-${m[2]}-${m[1]}`, descricao: m[4]!.trim(), valor: m[5] === "-" || m[6] === "-" ? -v : v });
  }
  return { linhas, saldos, ignoradas };
}

/** Confere cada saldo impresso contra o saldo anterior mais as linhas do dia. Devolve os dias que não fecham. */
export function conferirSaldos(lido: ExtratoLido, saldoAnterior: Centavos): { data: string; esperado: Centavos; impresso: Centavos }[] {
  return [...lido.saldos]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((s) => ({ data: s.data, impresso: s.saldo, esperado: lido.linhas.filter((l) => l.data <= s.data).reduce((t, l) => t + l.valor, saldoAnterior) }))
    .filter((d) => d.esperado !== d.impresso);
}

/** Impressão digital para deduplicar: data, valor e descrição normalizada. */
export const chaveDeDuplicidade = (l: { data: string; valor: Centavos; descricao: string }) => `${l.data}|${l.valor}|${normalizarEstabelecimento(l.descricao)}`;
