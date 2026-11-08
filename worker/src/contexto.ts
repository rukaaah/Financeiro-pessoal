import {
  type ContaRecorrente, deNumeric, type EntradaPrevista, estimativa, type FaturaPendente, faturasDe, formatar,
  itensDeAtencao, type LinhaDeCategoria, type LinhaDeFatura, paraNumeric, posicaoDoMes, saldoProjetado, type Urgencia,
} from "@financeiro/dominio";
import { consulta } from "./banco.ts";

export const hojeEmSaoPaulo = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/** Previsto, realizado e média de 3 meses por categoria, pelo mês do orçamento (ADR-005, ADR-019). */
const SQL_CATEGORIAS = `
  with m as (select ($1 || '-01')::date as mes),
  mov as (
    select t.category_id, mes_do_orcamento(t.occurred_on, t.invoice_month) as mm, sum(abs(t.amount)) as v
      from transactions t, m
     where t.kind in ('income', 'expense')
       and mes_do_orcamento(t.occurred_on, t.invoice_month) between (m.mes - interval '3 months')::date and m.mes
     group by 1, 2
  )
  select c.id, c.name as nome, c.kind as tipo, g.name as grupo, p.previsto::text as previsto, p.ajustado,
         coalesce((select v from mov where mov.category_id = c.id and mov.mm = m.mes), 0)::numeric(14,2)::text as realizado,
         (coalesce((select sum(v) from mov where mov.category_id = c.id and mov.mm < m.mes), 0) / 3)::numeric(14,2)::text as media3m
    from m, categories c
    join category_groups g on g.id = c.group_id
    join previsto_do_mes((select mes from m)) p on p.category_id = c.id
   where c.active
   order by g.sort_order, g.name, c.name`;

const SQL_GUARDADO = `
  select coalesce(sum(t.amount), 0)::numeric(14,2)::text as guardado
    from transactions t join accounts a on a.id = t.account_id
   where t.kind = 'transfer' and t.amount > 0 and a.kind in ('goal', 'investment')
     and date_trunc('month', t.occurred_on) = ($1 || '-01')::date`;

/** Contas recorrentes vigentes no mês, com o vencimento e se já há lançamento apontando para ela. */
const SQL_CONTAS = `
  with m as (select ($1 || '-01')::date as mes)
  select b.id, b.name as nome, b.amount::text as valor, b.urgency as urgencia, a.kind = 'credit_card' as no_cartao,
         make_date(extract(year from m.mes)::int, extract(month from m.mes)::int,
                   least(b.due_day, extract(day from (m.mes + interval '1 month - 1 day'))::int))::text as vencimento,
         exists (select 1 from transactions t where t.recurring_bill_id = b.id
                  and mes_do_orcamento(t.occurred_on, t.invoice_month) = m.mes) as paga
    from m, recurring_bills b join accounts a on a.id = b.account_id
   where b.valid_from <= (m.mes + interval '1 month - 1 day')::date and (b.valid_until is null or b.valid_until >= m.mes)
   order by b.due_day, b.name`;

const SQL_FATURAS = `
  with compras as (select account_id, invoice_month as mes, -sum(amount) as total from transactions where invoice_month is not null group by 1, 2),
       pagos as (select account_id, settles_invoice_month as mes, sum(amount) as pago from transactions where settles_invoice_month is not null group by 1, 2)
  select c.account_id as cartao, a.name as nome, t.due_day as dia, c.mes::text as mes, c.total::numeric(14,2)::text as total, coalesce(p.pago, 0)::numeric(14,2)::text as pago
    from compras c join accounts a on a.id = c.account_id
    left join pagos p using (account_id, mes)
    left join account_terms t on t.account_id = c.account_id and t.vigencia @> current_date`;

const SQL_ENTRADAS = `
  select id, description as descricao, currency as moeda, amount::text as valor, expected_on::text as data
    from expected_incomes where transaction_id is null order by expected_on`;

/** Desconto médio medido nos recebimentos em dólar, em pontos-base (ideia 21). */
const SQL_DESCONTO = `
  select coalesce(avg(fee_brl / nullif(amount * reference_rate, 0)) * 10000, 0)::int as pb
    from expected_incomes where currency = 'USD' and received_brl is not null and reference_rate is not null`;

const SQL_SALDO = `
  select (coalesce((select sum(t.amount) from transactions t join accounts a on a.id = t.account_id
                     where a.kind in ('checking', 'cash') and t.occurred_on <= $1::date), 0)
          + coalesce((select sum(a.opening_balance) from accounts a where a.kind in ('checking', 'cash')), 0))::numeric(14,2)::text as saldo`;

/** Cofrinhos ativos com saldo (saldo inicial + lançamentos até hoje) abaixo de zero. */
const SQL_COFRINHOS_NEGATIVOS = `
  select id, nome, saldo::text from (
    select a.id, a.name as nome,
           (a.opening_balance + coalesce((select sum(t.amount) from transactions t where t.account_id = a.id and t.occurred_on <= $1::date), 0))::numeric(14,2) as saldo
      from accounts a where a.kind = 'goal' and a.active) x
   where saldo < 0 order by nome`;

const SQL_ADIADOS = `select item_key as chave, until::text as ate from attention_snoozes`;

export const consultasDoMes = (mes: string, hoje: string) => [
  consulta(SQL_CATEGORIAS, mes), consulta(SQL_GUARDADO, mes), consulta(SQL_CONTAS, mes), consulta(SQL_FATURAS),
  consulta(SQL_ENTRADAS), consulta(SQL_DESCONTO), consulta(SQL_SALDO, hoje), consulta(SQL_ADIADOS),
  consulta(SQL_COFRINHOS_NEGATIVOS, hoje),
];

type L = Record<string, unknown>;

/** Monta a resposta do Mês: a posição, a Atenção e o saldo projetado, de um lote só. */
export function montarMes(mes: string, hoje: string, linhas: L[][], ptax: string | null) {
  const [cats = [], guard = [], contasL = [], fatL = [], entL = [], desc = [], saldoL = [], adiadosL = [], negL = []] = linhas;
  const contas: ContaRecorrente[] = contasL.map((k) => ({
    id: String(k.id), nome: String(k.nome), valor: deNumeric(String(k.valor)), vencimento: String(k.vencimento),
    urgencia: k.urgencia as Urgencia, paga: Boolean(k.paga), noCartao: Boolean(k.no_cartao),
  }));
  const aPagar = contas.filter((k) => !k.paga).reduce((s, k) => s + k.valor, 0n);
  const p = posicaoDoMes(cats as unknown as LinhaDeCategoria[], { mes, hoje, aPagar, guardado: deNumeric(String(guard[0]?.guardado ?? "0")), formatar });

  const faturas: FaturaPendente[] = [];
  for (const cartao of new Set(fatL.map((f) => String(f.cartao)))) {
    const doCartao = fatL.filter((f) => f.cartao === cartao);
    for (const f of faturasDe(doCartao as unknown as LinhaDeFatura[], Number(doCartao[0]?.dia ?? 10), hoje))
      if (f.situacao === "aberta" || f.situacao === "atrasada" || f.situacao === "parcial")
        faturas.push({ cartao, nome: String(doCartao[0]?.nome), mes: f.mes, vencimento: f.vencimento, falta: f.falta });
  }
  const descontoPb = Number(desc[0]?.pb ?? 0);
  const entradas: EntradaPrevista[] = entL.map((x) => {
    const valor = deNumeric(String(x.valor));
    return { id: String(x.id), descricao: String(x.descricao), data: String(x.data), estimativa: x.moeda === "USD" ? (ptax ? estimativa(valor, ptax, descontoPb) : 0n) : valor };
  });

  const fimDoMes = `${mes}-${String(p.diasNoMes).padStart(2, "0")}`;
  const ehMesCorrente = hoje.slice(0, 7) === mes;
  const projecao = ehMesCorrente
    ? saldoProjetado({ hoje, fimDoMes, saldoHoje: deNumeric(String(saldoL[0]?.saldo ?? "0")), livre: p.livre, contas, faturas, entradas: entradas.filter((x) => x.data <= fimDoMes) })
    : [];
  const menor = projecao.reduce<{ dia: string; saldo: bigint } | null>((m, x) => (!m || x.saldo < m.saldo ? x : m), null);
  const adiados = new Map(adiadosL.map((a) => [String(a.chave), a.ate == null ? null : String(a.ate)]));
  const atencao = itensDeAtencao({ hoje, mes, categorias: p.categorias, contas, faturas, entradas, adiados, formatar, menorSaldo: menor ? { dia: menor.dia, valor: menor.saldo } : null,
    cofrinhosNegativos: negL.map((k) => ({ id: String(k.id), nome: String(k.nome), saldo: deNumeric(String(k.saldo)) })) });

  const n = paraNumeric;
  return {
    mes, previsto: n(p.previsto), gasto: n(p.gasto), a_pagar: n(p.aPagar), livre: n(p.livre), por_dia: n(p.porDia),
    dia_do_mes: p.diaDoMes, dias_no_mes: p.diasNoMes, dias_restantes: p.diasRestantes,
    renda: n(p.renda), renda_prevista: n(p.rendaPrevista), guardado: n(p.guardado), sobra: n(p.sobra), descoberta: p.descoberta,
    categorias: p.categorias.map((k) => ({ id: k.id, nome: k.nome, grupo: k.grupo, previsto: n(k.previsto), gasto: n(k.gasto), media3m: n(k.media3m), ajustado: k.ajustado, estado: k.estado })),
    contas: contas.map((k) => ({ ...k, valor: n(k.valor) })),
    entradas: entradas.map((x) => ({ ...x, estimativa: n(x.estimativa) })),
    ptax, desconto_pb: descontoPb,
    atencao: atencao.map((i) => ({ ...i, valor: n(i.valor) })),
    projecao: projecao.map((x) => ({ dia: x.dia, saldo: n(x.saldo) })),
    saldo_hoje: String(saldoL[0]?.saldo ?? "0.00"),
  };
}
