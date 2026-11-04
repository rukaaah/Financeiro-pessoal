import type { Centavos } from "./dinheiro.ts";
import type { Categoria } from "./orcamento.ts";

/**
 * A aba Atenção (RF20) e o saldo projetado (ideia 7). Prazos aprovados no Portão 1:
 * lembrete 3 dias antes da conta, 5 dias antes da fatura, orçamento em 80%.
 */

export type Gravidade = "critico" | "atencao" | "informativo";
export type Urgencia = "essential" | "important" | "deferrable";

export interface ContaRecorrente { id: string; nome: string; valor: Centavos; vencimento: string; urgencia: Urgencia; paga: boolean; noCartao: boolean }
export interface FaturaPendente { cartao: string; nome: string; mes: string; vencimento: string; falta: Centavos }
export interface EntradaPrevista { id: string; descricao: string; data: string; estimativa: Centavos }

export interface Item {
  readonly chave: string;
  readonly gravidade: Gravidade;
  readonly titulo: string;
  readonly detalhe: string;
  readonly valor: Centavos;
  readonly data: string | null;
  readonly acao: { tipo: "ver-categoria"; id: string } | { tipo: "pagar-conta"; id: string } | { tipo: "pagar-fatura"; cartao: string; mes: string } | { tipo: "receber"; id: string } | { tipo: "nenhuma" };
}

export const URGENCIA: Record<Urgencia, string> = { essential: "Essencial", important: "Importante", deferrable: "Adiável" };
const DIAS_CONTA = 3, DIAS_FATURA = 5;
const ORDEM: Record<Gravidade, number> = { critico: 0, atencao: 1, informativo: 2 };

export const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function itensDeAtencao(e: {
  hoje: string; mes: string; categorias: readonly Categoria[]; contas: readonly ContaRecorrente[]; faturas: readonly FaturaPendente[];
  entradas: readonly EntradaPrevista[]; adiados: ReadonlyMap<string, string | null>; formatar(v: Centavos): string; menorSaldo?: { dia: string; valor: Centavos } | null;
}): Item[] {
  const itens: Item[] = [];
  for (const c of e.categorias) {
    if (c.estado === "dentro") continue;
    itens.push({
      chave: `categoria:${c.id}:${e.mes}`, gravidade: c.estado === "fora" ? "critico" : "atencao",
      titulo: c.estado === "fora" ? `${c.nome} passou do previsto` : `${c.nome} perto do limite`,
      detalhe: `${e.formatar(c.gasto)} de ${e.formatar(c.previsto)} previstos`, valor: c.gasto - c.previsto, data: null, acao: { tipo: "ver-categoria", id: c.id },
    });
  }
  for (const k of e.contas) {
    if (k.paga) continue;
    const faltam = diasEntre(e.hoje, k.vencimento);
    const gravidade: Gravidade = faltam < 0 ? "critico" : faltam <= DIAS_CONTA ? "atencao" : "informativo";
    itens.push({
      chave: `conta:${k.id}:${e.mes}`, gravidade, titulo: faltam < 0 ? `${k.nome} atrasada` : faltam === 0 ? `${k.nome} vence hoje` : `${k.nome} vence em ${faltam} dias`,
      detalhe: `${dm(k.vencimento)} · ${URGENCIA[k.urgencia]}${k.noCartao ? " · no cartão" : ""}`, valor: k.valor, data: k.vencimento, acao: { tipo: "pagar-conta", id: k.id },
    });
  }
  for (const f of e.faturas) {
    if (f.falta <= 0n) continue;
    const faltam = diasEntre(e.hoje, f.vencimento);
    const gravidade: Gravidade = faltam < 0 ? "critico" : faltam <= DIAS_FATURA ? "atencao" : "informativo";
    itens.push({
      chave: `fatura:${f.cartao}:${f.mes}`, gravidade, titulo: faltam < 0 ? `Fatura ${f.nome} atrasada` : `Fatura ${f.nome} vence em ${faltam} dias`,
      detalhe: `${dm(f.vencimento)} · ainda não paga`, valor: f.falta, data: f.vencimento, acao: { tipo: "pagar-fatura", cartao: f.cartao, mes: f.mes },
    });
  }
  for (const x of e.entradas) {
    if (x.data > e.hoje) continue;
    itens.push({ chave: `entrada:${x.id}`, gravidade: "atencao", titulo: `${x.descricao} previsto para ${x.data === e.hoje ? "hoje" : dm(x.data)}`, detalhe: "Chegou? Registre quanto entrou em reais.", valor: x.estimativa, data: x.data, acao: { tipo: "receber", id: x.id } });
  }
  if (e.menorSaldo && e.menorSaldo.valor < 0n) {
    itens.push({ chave: `saldo:${e.mes}`, gravidade: "critico", titulo: `Saldo fica negativo em ${dm(e.menorSaldo.dia)}`, detalhe: "Pela projeção das contas, da fatura e das entradas previstas.", valor: -e.menorSaldo.valor, data: e.menorSaldo.dia, acao: { tipo: "nenhuma" } });
  }
  return itens
    .filter((i) => { if (!e.adiados.has(i.chave)) return true; const ate = e.adiados.get(i.chave); return ate != null && ate <= e.hoje; })
    .sort((a, b) => ORDEM[a.gravidade] - ORDEM[b.gravidade] || (a.data ?? "").localeCompare(b.data ?? ""));
}

/**
 * Saldo da conta do dia a dia, de hoje ao fim do mês: contas e fatura saem no
 * vencimento, entradas previstas entram na data, e o livre do mês é gasto por igual.
 */
export function saldoProjetado(e: {
  hoje: string; fimDoMes: string; saldoHoje: Centavos; livre: Centavos; contas: readonly ContaRecorrente[]; faturas: readonly FaturaPendente[]; entradas: readonly EntradaPrevista[];
}): { dia: string; saldo: Centavos }[] {
  const dias = diasEntre(e.hoje, e.fimDoMes);
  if (dias < 0) return [];
  const porDia = e.livre > 0n ? e.livre / BigInt(dias + 1) : 0n;
  const pontos: { dia: string; saldo: Centavos }[] = [];
  let saldo = e.saldoHoje;
  for (let i = 0; i <= dias; i++) {
    const dia = new Date(Date.parse(`${e.hoje}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    saldo -= porDia;
    for (const k of e.contas) if (!k.paga && !k.noCartao && (k.vencimento === dia || (i === 0 && k.vencimento < dia))) saldo -= k.valor;
    for (const f of e.faturas) if (f.vencimento === dia || (i === 0 && f.vencimento < dia)) saldo -= f.falta;
    for (const x of e.entradas) if (x.data === dia || (i === 0 && x.data < dia)) saldo += x.estimativa;
    pontos.push({ dia, saldo });
  }
  return pontos;
}
