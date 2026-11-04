import { type Centavos, deNumeric, somar } from "./dinheiro.ts";

/**
 * A posição do mês (05-arquitetura-de-informacao.md §1): quatro números separados,
 * como o Pedro pediu no Portão 1, e todas as telas leem daqui. Nenhuma tela soma por
 * conta própria — foi a causa dos três "quanto resta" do diagnóstico.
 */

export interface LinhaDeCategoria {
  readonly id: string;
  readonly nome: string;
  readonly tipo: "expense" | "income";
  readonly grupo: string;
  readonly previsto: string;
  readonly ajustado: boolean;
  readonly realizado: string;
  readonly media3m: string;
}

export type Estado = "dentro" | "perto" | "fora";

export interface Categoria {
  readonly id: string;
  readonly nome: string;
  readonly grupo: string;
  readonly previsto: Centavos;
  readonly gasto: Centavos;
  readonly media3m: Centavos;
  readonly ajustado: boolean;
  readonly estado: Estado;
}

export interface PosicaoDoMes {
  readonly previsto: Centavos;
  readonly gasto: Centavos;
  readonly aPagar: Centavos;
  readonly livre: Centavos;
  readonly porDia: Centavos;
  readonly diasRestantes: number;
  readonly diaDoMes: number;
  readonly diasNoMes: number;
  readonly rendaPrevista: Centavos;
  readonly renda: Centavos;
  readonly guardado: Centavos;
  readonly sobra: Centavos;
  readonly categorias: readonly Categoria[];
  readonly descoberta: string | null;
}

/** Perto do limite a partir de 80% do previsto (RF20, prazo padrão aprovado). */
export const LIMIAR_PERTO = 80n;

export function estadoDe(gasto: Centavos, previsto: Centavos): Estado {
  if (gasto > previsto) return "fora";
  if (previsto > 0n && gasto * 100n >= previsto * LIMIAR_PERTO) return "perto";
  return "dentro";
}

/**
 * `hoje` e `mes` em AAAA-MM-DD e AAAA-MM. Num mês passado não há dias restantes; num
 * mês futuro, o mês inteiro está pela frente.
 */
export function posicaoDoMes(linhas: readonly LinhaDeCategoria[], opcoes: { mes: string; hoje: string; aPagar: Centavos; guardado: Centavos; formatar(v: Centavos): string }): PosicaoDoMes {
  const despesas = linhas.filter((l) => l.tipo === "expense");
  const receitas = linhas.filter((l) => l.tipo === "income");
  const categorias: Categoria[] = despesas.map((l) => {
    const previsto = deNumeric(l.previsto), gasto = deNumeric(l.realizado);
    return { id: l.id, nome: l.nome, grupo: l.grupo, previsto, gasto, media3m: deNumeric(l.media3m), ajustado: l.ajustado, estado: estadoDe(gasto, previsto) };
  });
  const previsto = somar(categorias.map((c) => c.previsto));
  const gasto = somar(categorias.map((c) => c.gasto));
  const livre = previsto - gasto - opcoes.aPagar;

  const [ano, mes] = opcoes.mes.split("-").map(Number) as [number, number];
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const mesDeHoje = opcoes.hoje.slice(0, 7);
  const diaDoMes = mesDeHoje === opcoes.mes ? Number(opcoes.hoje.slice(8, 10)) : mesDeHoje > opcoes.mes ? diasNoMes : 0;
  const diasRestantes = diasNoMes - diaDoMes + (mesDeHoje === opcoes.mes ? 1 : 0);
  const porDia = diasRestantes > 0 && livre > 0n ? livre / BigInt(diasRestantes) : 0n;

  const renda = somar(receitas.map((l) => deNumeric(l.realizado)));
  const rendaPrevista = somar(receitas.map((l) => deNumeric(l.previsto)));

  // A descoberta do dia: a categoria mais acima do previsto; senão, a mais acima da média.
  const fora = categorias.filter((c) => c.estado === "fora").sort((a, b) => Number((b.gasto - b.previsto) - (a.gasto - a.previsto)));
  let descoberta: string | null = null;
  if (fora[0]) {
    const c = fora[0], acimaDaMedia = c.gasto - c.media3m;
    descoberta = `${c.nome} passou ${opcoes.formatar(c.gasto - c.previsto)} do previsto` + (c.media3m > 0n && acimaDaMedia > 0n ? ` e está ${opcoes.formatar(acimaDaMedia)} acima da média de 3 meses.` : ".");
  } else if (livre < 0n) {
    descoberta = `O previsto do mês já não cobre o gasto e as contas a pagar: faltam ${opcoes.formatar(-livre)}.`;
  }

  return { previsto, gasto, aPagar: opcoes.aPagar, livre, porDia, diasRestantes, diaDoMes, diasNoMes, rendaPrevista, renda, guardado: opcoes.guardado, sobra: renda - gasto - opcoes.guardado, categorias, descoberta };
}
