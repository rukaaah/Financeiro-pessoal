import type { Centavos } from "./dinheiro.ts";

/**
 * Carteira (RF09, RF15): posição calculada das operações, alocação contra a meta e
 * "Onde aportar" pelas regras do próprio Pedro. Não é recomendação de analista.
 * Quantidade e preço chegam como texto de numeric e são tratados em inteiros.
 */

export type Classe = "paper" | "brick" | "logistics" | "infra" | "treasury" | "other";
export const NOME_DA_CLASSE: Record<Classe, string> = { paper: "Papel", brick: "Tijolo", logistics: "Logística", infra: "FI-Infra", treasury: "Tesouro", other: "Outros" };

const ESCALA = 1_000_000n; // 6 casas, como numeric(18,6)
export function deDecimal6(t: string): bigint {
  const m = /^(-)?(\d+)(?:\.(\d{1,6}))?$/.exec(t.trim());
  if (!m) throw new Error(`número inválido: ${t}`);
  const v = BigInt(m[2]!) * ESCALA + BigInt((m[3] ?? "").padEnd(6, "0"));
  return m[1] ? -v : v;
}
const centavosDe = (qtd6: bigint, preco6: bigint): Centavos => (qtd6 * preco6 * 2n / (ESCALA * ESCALA / 100n) + 1n) / 2n;

export interface Operacao { readonly quantidade: string; readonly preco: string }
export interface Posicao { readonly quantidade6: bigint; readonly precoMedio6: bigint; readonly custo: Centavos }

/** Preço médio ponderado das compras; venda reduz a quantidade sem mudar o preço médio. */
export function posicaoDe(ops: readonly Operacao[]): Posicao {
  let q = 0n, custo6x = 0n; // custo em (quantidade × preço) com 12 casas
  for (const o of ops) {
    const qtd = deDecimal6(o.quantidade), preco = deDecimal6(o.preco);
    if (qtd > 0n) { custo6x += qtd * preco; q += qtd; }
    else if (q > 0n) { const pm = custo6x / q; q += qtd; custo6x = pm * q; }
  }
  const pm = q > 0n ? custo6x / q : 0n;
  return { quantidade6: q, precoMedio6: pm, custo: centavosDe(q, pm) };
}

export const valorDe = (p: Posicao, preco: string | null): Centavos => (preco ? centavosDe(p.quantidade6, deDecimal6(preco)) : p.custo);

export interface AtivoNaCarteira { ticker: string; classe: Classe; valor: Centavos; preco: string | null; pvp: number | null; liquidez: number | null }
export interface Regras { maxPvp: number; maxPeso: number; minLiquidez: number; metas: Partial<Record<Classe, number>> }
export interface Sugestao { ticker: string; valor: Centavos; cotas: number | null; motivo: string }

/**
 * Distribui o aporte: classes abaixo da meta recebem em proporção ao que falta; dentro
 * da classe, o ativo elegível de menor P/VP; cota inteira; a sobra vai para o destino
 * da sobra. Ativo barrado diz por quê.
 */
export function ondeAportar(ativos: readonly AtivoNaCarteira[], regras: Regras, aporte: Centavos): { sugestoes: Sugestao[]; fora: { ticker: string; motivo: string }[]; sobra: Centavos } {
  const total = ativos.reduce((s, a) => s + a.valor, 0n) + aporte;
  const fora: { ticker: string; motivo: string }[] = [];
  const elegivel = (a: AtivoNaCarteira) => {
    if (a.classe === "treasury") return true;
    if (a.pvp != null && a.pvp > regras.maxPvp) { fora.push({ ticker: a.ticker, motivo: `P/VP ${a.pvp.toFixed(2).replace(".", ",")} acima do seu máximo (${regras.maxPvp.toFixed(2).replace(".", ",")})` }); return false; }
    if (a.liquidez != null && a.liquidez < regras.minLiquidez) { fora.push({ ticker: a.ticker, motivo: `liquidez abaixo do mínimo de R$ ${Math.round(regras.minLiquidez / 1000)} mil/dia` }); return false; }
    if (total > 0n && Number((a.valor * 10000n) / total) / 100 >= regras.maxPeso) { fora.push({ ticker: a.ticker, motivo: `já pesa ${regras.maxPeso}% ou mais da carteira` }); return false; }
    return true;
  };
  const candidatos = ativos.filter(elegivel);
  const porClasse = new Map<Classe, Centavos>();
  for (const a of ativos) porClasse.set(a.classe, (porClasse.get(a.classe) ?? 0n) + a.valor);
  const faltas = (Object.entries(regras.metas) as [Classe, number][])
    .map(([c, pct]) => [c, (total * BigInt(Math.round(pct * 100))) / 10000n - (porClasse.get(c) ?? 0n)] as const)
    .filter(([, f]) => f > 0n);
  const somaFaltas = faltas.reduce((s, [, f]) => s + f, 0n);
  const sugestoes: Sugestao[] = [];
  let sobra = aporte;
  for (const [classe, falta] of faltas) {
    const parte = somaFaltas > 0n ? (aporte * falta) / somaFaltas : 0n;
    const escolhido = candidatos.filter((a) => a.classe === classe).sort((x, y) => (x.pvp ?? 9) - (y.pvp ?? 9))[0];
    if (!escolhido || parte <= 0n) continue;
    const pp = Number(((falta * 10000n) / (total || 1n))) / 100;
    if (classe === "treasury" || !escolhido.preco) {
      sugestoes.push({ ticker: escolhido.ticker, valor: parte, cotas: null, motivo: `${NOME_DA_CLASSE[classe]} está ${pp.toFixed(1).replace(".", ",")} p.p. abaixo da meta.` });
      sobra -= parte;
      continue;
    }
    const precoC = centavosDe(ESCALA, deDecimal6(escolhido.preco));
    const cotas = precoC > 0n ? parte / precoC : 0n;
    if (cotas <= 0n) continue;
    const valor = cotas * precoC;
    sobra -= valor;
    sugestoes.push({ ticker: escolhido.ticker, valor, cotas: Number(cotas), motivo: `${NOME_DA_CLASSE[classe]} está ${pp.toFixed(1).replace(".", ",")} p.p. abaixo da meta; menor P/VP elegível da classe${escolhido.pvp != null ? ` (${escolhido.pvp.toFixed(2).replace(".", ",")})` : ""}.` });
  }
  return { sugestoes, fora, sobra };
}

/** Projeção com premissas visíveis: aporte mensal, DY ao ano reinvestido. Não é previsão. */
export function projetar(inicial: Centavos, aporteMensal: Centavos, dyAnoPct: number, anos: number): Centavos[] {
  const r = dyAnoPct / 1200;
  let v = Number(inicial);
  const pontos: Centavos[] = [BigInt(Math.round(v))];
  for (let m = 1; m <= anos * 12; m++) { v = v * (1 + r) + Number(aporteMensal); if (m % 12 === 0) pontos.push(BigInt(Math.round(v))); }
  return pontos;
}
