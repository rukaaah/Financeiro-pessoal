import { type Centavos, formatar } from "./dinheiro.ts";

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
export const centavosDe = (qtd6: bigint, preco6: bigint): Centavos => (qtd6 * preco6 * 2n / (ESCALA * ESCALA / 100n) + 1n) / 2n;

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
export interface ResultadoDoAporte { sugestoes: Sugestao[]; fora: { ticker: string; motivo: string }[]; sobra: Centavos; avisos: string[] }

const pp = (v: number) => v.toFixed(1).replace(".", ",");

export function ondeAportar(ativos: readonly AtivoNaCarteira[], regras: Regras, aporte: Centavos): ResultadoDoAporte {
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
  const sugestoes: Sugestao[] = [];
  const avisos: string[] = [];
  let sobra = aporte;
  if (ativos.length === 0) avisos.push("Nenhum ativo na carteira ainda. Registre a primeira compra em \"Comprei\" para a conta ter onde distribuir.");
  else if (Object.values(regras.metas).every((v) => !v)) avisos.push("Sem meta por classe, não há o que completar. Defina as metas em Ajustes, Investimentos.");
  else if (faltas.length === 0) avisos.push("Todas as classes já estão na meta ou acima com este aporte.");

  // Só entram na divisão as classes com quem comprar; as outras viram aviso, e a parte
  // delas vai para as demais em vez de sumir na sobra.
  const abaixo = (falta: Centavos) => pp(Number((falta * 10000n) / (total || 1n)) / 100);
  type Alvo = { classe: Classe; falta: Centavos; ativo: AtivoNaCarteira; cota: Centavos | null; gasto: Centavos; cotas: bigint };
  const alvos: Alvo[] = [];
  for (const [classe, falta] of faltas) {
    const ativo = candidatos.filter((a) => a.classe === classe).sort((x, y) => (x.pvp ?? 9) - (y.pvp ?? 9))[0];
    if (!ativo) {
      const temNaClasse = ativos.some((a) => a.classe === classe);
      avisos.push(`${NOME_DA_CLASSE[classe]} está ${abaixo(falta)} p.p. abaixo da meta, mas ${temNaClasse ? "nenhum ativo dessa classe passou nas suas regras" : "você não tem ativo dessa classe"}. O valor foi para as outras classes.`);
      continue;
    }
    const cota = classe === "treasury" || !ativo.preco ? null : centavosDe(ESCALA, deDecimal6(ativo.preco));
    alvos.push({ classe, falta, ativo, cota: cota && cota > 0n ? cota : null, gasto: 0n, cotas: 0n });
  }
  const somaFaltas = alvos.reduce((s, x) => s + x.falta, 0n);
  // 1ª passada: cada classe recebe em proporção ao que falta, em cotas inteiras.
  for (const x of alvos) {
    const parte = somaFaltas > 0n ? (aporte * x.falta) / somaFaltas : 0n;
    if (x.cota == null) x.gasto = parte;
    else { x.cotas = parte / x.cota; x.gasto = x.cotas * x.cota; }
    sobra -= x.gasto;
  }
  // 2ª passada: a sobra compra mais uma cota de quem ainda está mais longe da meta e cabe nela.
  for (;;) {
    const cabe = alvos.filter((x) => x.cota != null && x.cota <= sobra && x.gasto < x.falta).sort((x, y) => { const d = (y.falta - y.gasto) - (x.falta - x.gasto); return d > 0n ? 1 : d < 0n ? -1 : 0; })[0];
    if (!cabe || cabe.cota == null) break;
    cabe.cotas += 1n; cabe.gasto += cabe.cota; sobra -= cabe.cota;
  }
  for (const x of alvos) {
    if (x.gasto <= 0n) {
      if (x.cota != null) avisos.push(`${x.ativo.ticker} (${NOME_DA_CLASSE[x.classe]}): a cota de ${formatar(x.cota)} não coube neste aporte.`);
      continue;
    }
    const motivo = `${NOME_DA_CLASSE[x.classe]} está ${abaixo(x.falta)} p.p. abaixo da meta${x.cota != null ? `; menor P/VP elegível da classe${x.ativo.pvp != null ? ` (${x.ativo.pvp.toFixed(2).replace(".", ",")})` : ""}` : ""}.`;
    sugestoes.push({ ticker: x.ativo.ticker, valor: x.gasto, cotas: x.cota != null ? Number(x.cotas) : null, motivo });
  }
  return { sugestoes, fora, sobra, avisos };
}

/** Projeção com premissas visíveis: aporte mensal, DY ao ano reinvestido. Não é previsão. */
export function projetar(inicial: Centavos, aporteMensal: Centavos, dyAnoPct: number, anos: number): Centavos[] {
  const r = dyAnoPct / 1200;
  let v = Number(inicial);
  const pontos: Centavos[] = [BigInt(Math.round(v))];
  for (let m = 1; m <= anos * 12; m++) { v = v * (1 + r) + Number(aporteMensal); if (m % 12 === 0) pontos.push(BigInt(Math.round(v))); }
  return pontos;
}

/** Linha do relatório da carteira: o que mudou e o que pede atenção, pelas regras do Pedro. */
export interface AtivoNoRelatorio {
  ticker: string; classe: Classe; valor: Centavos; preco: number | null; precoAnterior: number | null; preco30d: number | null;
  pvp: number | null; dy: number | null; liquidez: number | null; cotadoEm: string | null;
}
export interface Alerta { ticker: string; tipo: "oportunidade" | "atencao"; texto: string }
export interface Relatorio { rendaMensal: Centavos; alertas: Alerta[]; desatualizado: string | null }

const variacao = (agora: number | null, antes: number | null) => (agora != null && antes != null && antes > 0 ? ((agora - antes) / antes) * 100 : null);
const virgula = (v: number, casas = 1) => v.toFixed(casas).replace(".", ",");

/** Dia útil anterior a `hoje` (só fim de semana; feriado conta como dia útil). */
export function diaUtilAnterior(hoje: string): string {
  const d = new Date(`${hoje}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() - 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

/**
 * Renda estimada por mês (DY de 12 meses sobre o valor de hoje, dividido por 12), alertas
 * de P/VP, liquidez e queda forte, e aviso quando a cotação mais nova é velha demais.
 */
export function relatorioDaCarteira(ativos: readonly AtivoNoRelatorio[], regras: Regras, hoje: string): Relatorio {
  const alertas: Alerta[] = [];
  let renda = 0n;
  for (const a of ativos) {
    if (a.dy != null) renda += (a.valor * BigInt(Math.round(a.dy * 100))) / 120000n;
    if (a.classe === "treasury") continue;
    const dia = variacao(a.preco, a.precoAnterior), mes = variacao(a.preco, a.preco30d);
    if (a.pvp != null && a.pvp <= regras.maxPvp * 0.9) alertas.push({ ticker: a.ticker, tipo: "oportunidade", texto: `P/VP ${virgula(a.pvp, 2)}, 10% ou mais abaixo do seu máximo (${virgula(regras.maxPvp, 2)}).` });
    if (a.pvp != null && a.pvp > regras.maxPvp) alertas.push({ ticker: a.ticker, tipo: "atencao", texto: `P/VP ${virgula(a.pvp, 2)} passou do seu máximo (${virgula(regras.maxPvp, 2)}): fica fora do "Onde aportar".` });
    if (a.liquidez != null && a.liquidez < regras.minLiquidez) alertas.push({ ticker: a.ticker, tipo: "atencao", texto: `Liquidez média de R$ ${Math.round(a.liquidez / 1000)} mil/dia, abaixo do seu mínimo.` });
    if (dia != null && dia <= -3) alertas.push({ ticker: a.ticker, tipo: "atencao", texto: `Caiu ${virgula(-dia)}% desde o pregão anterior.` });
    if (mes != null && mes <= -8) alertas.push({ ticker: a.ticker, tipo: "atencao", texto: `Caiu ${virgula(-mes)}% em 30 dias.` });
  }
  const datas = ativos.filter((a) => a.classe !== "treasury" && a.cotadoEm).map((a) => a.cotadoEm!).sort();
  const maisNova = datas[datas.length - 1] ?? null;
  const desatualizado = maisNova && maisNova < diaUtilAnterior(hoje) ? maisNova : null;
  return { rendaMensal: renda, alertas, desatualizado };
}

/**
 * Momento de compra (ADR-022): quantas cotas inteiras o aporte compra no fundo apontado
 * pelo medidor, sem passar das regras do próprio usuário (P/VP máximo e peso máximo).
 */
export interface CotasSugeridas { cotas: number; valor: Centavos; limite: string | null }

export function cotasSugeridas(preco: string, aporte: Centavos, valorAtual: Centavos, totalCarteira: Centavos, regras: Pick<Regras, "maxPvp" | "maxPeso">, pvp: number | null): CotasSugeridas {
  const preco6 = deDecimal6(preco);
  if (preco6 <= 0n || aporte <= 0n) return { cotas: 0, valor: 0n, limite: null };
  if (pvp != null && pvp > regras.maxPvp) return { cotas: 0, valor: 0n, limite: `P/VP ${pp2(pvp)} acima do seu máximo (${pp2(regras.maxPvp)})` };
  const peloAporte = (aporte * 10_000n) / preco6;
  const teto = ((totalCarteira + aporte) * BigInt(Math.round(regras.maxPeso * 100))) / 10_000n - valorAtual;
  const peloPeso = teto > 0n ? (teto * 10_000n) / preco6 : 0n;
  const cotas = peloAporte < peloPeso ? peloAporte : peloPeso;
  const limite = peloPeso < peloAporte ? `limitado ao seu peso máximo de ${pp(regras.maxPeso)}% por ativo` : null;
  return { cotas: Number(cotas), valor: centavosDe(cotas * ESCALA, preco6), limite };
}
const pp2 = (v: number) => v.toFixed(2).replace(".", ",");
