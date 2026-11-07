import { conferirTransferencia, deDigitado, deNumeric, LancamentoInvalido, linhasDaEdicao, linhasDe, paraNumeric, type Intencao } from "@financeiro/dominio";
import type { Hono } from "hono";
import { consulta } from "./banco.ts";
import type { Rodar } from "./app.ts";

const MES = /^\d{4}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

/** Erro do Postgres que é culpa do pedido (CHECK, FK, trigger da fatura), não do servidor. */
function ehErroDeDado(e: unknown): boolean {
  const codigo = (e as { code?: string })?.code ?? "";
  return /^(22|23)/.test(codigo);
}

export function rotasDeLancamentos<E extends object>(app: Hono<{ Bindings: E }>, rodar: Rodar<E>) {
  app.get("/api/opcoes", async (c) => {
    const [contas, categorias, investimentos, todas] = await rodar(c, [
      consulta(`select id, name as nome, kind as tipo from accounts
                 where active and kind in ('checking','credit_card','cash') order by kind, name`),
      consulta(`select c.id, c.name as nome, c.kind as tipo, g.name as grupo from categories c
                  join category_groups g on g.id = c.group_id
                 where c.active order by g.sort_order, g.name, c.name`),
      consulta("select id, name as nome from accounts where active and kind = 'investment' order by name"),
      // Para editar transferência: cofrinho, investimento e a receber também são pernas.
      consulta("select id, name as nome, kind as tipo from accounts where active order by kind, name"),
    ]);
    return c.json({ contas, categorias, investimentos, todas_as_contas: todas });
  });

  app.get("/api/lancamentos", async (c) => {
    const mes = c.req.query("mes") ?? new Date().toISOString().slice(0, 7);
    if (!MES.test(mes)) return c.json({ erro: "Mês inválido." }, 400);
    const [linhas = []] = await rodar(c, [
      consulta(
        `select t.id, t.kind as tipo, t.amount::text as valor, t.occurred_on::text as data, t.description as descricao,
                t.invoice_month::text as mes_da_fatura, t.installment_no as parcela, t.installment_total as parcelas,
                c.name as categoria, c.id as categoria_id, a.name as conta, a.kind as tipo_conta, a2.name as conta_destino,
                t.account_id as conta_id, t2.account_id as conta_destino_id, a2.kind as tipo_conta_destino,
                (select sum(g.amount)::text from transactions g where g.installment_group_id = t.installment_group_id) as valor_total
           from transactions t
           join accounts a on a.id = t.account_id
           left join categories c on c.id = t.category_id
           left join transactions t2 on t2.transfer_id = t.transfer_id and t2.id <> t.id
           left join accounts a2 on a2.id = t2.account_id
          where t.occurred_on >= ($1 || '-01')::date and t.occurred_on < ($1 || '-01')::date + interval '1 month'
            and (t.kind <> 'transfer' or t.amount < 0)
          order by t.occurred_on desc, t.created_at desc
          limit 500`,
        mes,
      ),
    ]);
    // Totais pela data, sem transferências e sem compras no cartão (que contam no mês da fatura).
    let entrou = 0n, saiu = 0n;
    for (const l of linhas) {
      const v = deNumeric(String(l.valor));
      if (l.tipo === "income") entrou += v;
      if (l.tipo === "expense" && l.tipo_conta !== "credit_card") saiu -= v;
    }
    return c.json({ mes, lancamentos: linhas, entrou: paraNumeric(entrou), saiu: paraNumeric(saiu) });
  });

  app.get("/api/fatura-prevista", async (c) => {
    const conta = c.req.query("conta") ?? "", data = c.req.query("data") ?? "";
    if (!UUID.test(conta) || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return c.json({ mes_da_fatura: null });
    try {
      const [l = []] = await rodar(c, [
        consulta(
          `select invoice_month_for(a.id, $2::date, 1::smallint)::text as mes_da_fatura
             from accounts a where a.id = $1 and a.kind = 'credit_card'`,
          conta, data,
        ),
      ]);
      return c.json({ mes_da_fatura: l[0]?.mes_da_fatura ?? null });
    } catch (e) {
      if (ehErroDeDado(e)) return c.json({ mes_da_fatura: null });
      throw e;
    }
  });

  app.post("/api/lancamentos", async (c) => {
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    let linhas;
    try {
      linhas = linhasDe({
        intencao: b.intencao as Intencao,
        valor: deDigitado(String(b.valor ?? "")),
        contaId: String(b.conta_id ?? ""),
        categoriaId: String(b.categoria_id ?? ""),
        data: String(b.data ?? ""),
        descricao: String(b.descricao ?? "").slice(0, 200),
        parcelas: Number(b.parcelas ?? 1),
      });
      if (b.intencao !== "gastei" && b.intencao !== "recebi") throw new LancamentoInvalido("Intenção desconhecida.");
    } catch (e) {
      return c.json({ erro: e instanceof Error ? e.message : "Lançamento inválido." }, 400);
    }
    const grupo = linhas.length > 1 ? crypto.randomUUID() : null;
    try {
      const resultados = await rodar(
        c,
        linhas.map((l) =>
          consulta(
            // A categoria precisa ser do tipo do lançamento: despesa em categoria de despesa.
            `insert into transactions (user_id, kind, account_id, category_id, amount, occurred_on, description,
                                       installment_no, installment_total, installment_group_id, recurring_bill_id)
             select current_app_user(), $1::transaction_kind, $2::uuid, k.id, $4::numeric, $5::date, $6, $7, $8, $9::uuid, $10::uuid
               from categories k where k.id = $3::uuid and k.kind::text = $1::text and k.active
             returning id, invoice_month::text as mes_da_fatura`,
            l.tipo, b.conta_id, b.categoria_id, paraNumeric(l.valor), b.data, String(b.descricao ?? "").slice(0, 200),
            l.parcela, l.totalDeParcelas, grupo, UUID.test(String(b.conta_recorrente_id ?? "")) ? b.conta_recorrente_id : null,
          ),
        ),
      );
      const ids = resultados.flat();
      if (ids.length !== linhas.length) return c.json({ erro: "Categoria não encontrada para este tipo de lançamento." }, 400);
      return c.json({ ids: ids.map((r) => r.id), mes_da_fatura: ids[0]?.mes_da_fatura ?? null }, 201);
    } catch (e) {
      if (ehErroDeDado(e)) return c.json({ erro: "O banco recusou o lançamento. Confira conta, categoria e data." }, 400);
      throw e;
    }
  });

  /**
   * Edita qualquer campo. Campo ausente no corpo fica como está. Compra parcelada se edita
   * inteira (valor total, data da compra, parcelas); transferência muda as duas pernas juntas.
   */
  app.patch("/api/lancamentos/:id", async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) return c.json({ erro: "Lançamento inválido." }, 400);
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const texto = (v: unknown) => (v == null ? null : String(v));
    const [atual = []] = await rodar(c, [
      consulta(
        `select t.kind::text as tipo, t.amount::text as valor, t.occurred_on::text as data, t.description as descricao,
                t.category_id as categoria_id, t.account_id as conta_id, a.kind::text as tipo_conta,
                t.installment_group_id as grupo, coalesce(t.installment_total, 1) as parcelas, t.transfer_id as transferencia,
                (select sum(g.amount)::text from transactions g where g.installment_group_id = t.installment_group_id) as total_do_grupo,
                t2.id as outra_id, t2.account_id as outra_conta_id, a2.kind::text as tipo_outra_conta
           from transactions t
           join accounts a on a.id = t.account_id
           left join transactions t2 on t2.transfer_id = t.transfer_id and t2.id <> t.id
           left join accounts a2 on a2.id = t2.account_id
          where t.id = $1`,
        id,
      ),
    ]);
    const l = atual[0];
    if (!l) return c.json({ erro: "Lançamento não encontrado." }, 404);
    const descricao = (texto(b.descricao) ?? String(l.descricao)).slice(0, 200);
    const data = texto(b.data) ?? String(l.data);
    let consultas;
    try {
      const valorAtual = deNumeric(String(l.total_do_grupo ?? l.valor));
      const valor = b.valor == null ? (valorAtual < 0n ? -valorAtual : valorAtual) : deDigitado(String(b.valor));
      if (l.tipo === "transfer") {
        // A perna que sai é a origem, como na lista; cada conta só troca por outra do mesmo tipo,
        // para um aporte continuar aporte e um pagamento de fatura continuar pagamento.
        const saiDaAtual = deNumeric(String(l.valor)) < 0n;
        const origemAtual = String(saiDaAtual ? l.conta_id : l.outra_conta_id), destinoAtual = String(saiDaAtual ? l.outra_conta_id : l.conta_id);
        const origem = texto(b.conta_id) ?? origemAtual, destino = texto(b.conta_destino_id) ?? destinoAtual;
        conferirTransferencia({ valor, data, origem, destino });
        if (![origem, destino].every((x) => UUID.test(x))) throw new LancamentoInvalido("Conta inválida.");
        const [contas = []] = await rodar(c, [
          consulta("select id, kind::text as tipo from accounts where id = any($1::uuid[]) and active", [origem, destino, origemAtual, destinoAtual]),
        ]);
        const tipo = (x: string) => contas.find((k) => k.id === x)?.tipo;
        if (!tipo(origem) || !tipo(destino)) throw new LancamentoInvalido("Conta não encontrada.");
        if (tipo(origem) !== tipo(origemAtual) || tipo(destino) !== tipo(destinoAtual))
          throw new LancamentoInvalido("Troque a conta por outra do mesmo tipo.");
        consultas = [
          consulta(
            `update transactions set
                 amount = case when amount < 0 then -$2::numeric else $2::numeric end,
                 account_id = case when amount < 0 then $3::uuid else $4::uuid end,
                 occurred_on = $5::date, description = $6
               where transfer_id = $1 returning id`,
            l.transferencia, paraNumeric(valor), origem, destino, data, descricao,
          ),
        ];
      } else {
        const tipo = texto(b.tipo) ?? String(l.tipo);
        if (tipo !== "expense" && tipo !== "income") throw new LancamentoInvalido("Tipo inválido.");
        const contaId = texto(b.conta_id) ?? String(l.conta_id), categoriaId = texto(b.categoria_id) ?? String(l.categoria_id);
        if (!UUID.test(contaId) || !UUID.test(categoriaId)) throw new LancamentoInvalido("Escolha conta e categoria.");
        const [ref = []] = await rodar(c, [
          consulta(
            `select (select kind::text from accounts where id = $1 and active) as tipo_conta,
                    (select kind::text from categories where id = $2 and active) as tipo_categoria`,
            contaId, categoriaId,
          ),
        ]);
        if (!ref[0]?.tipo_conta) throw new LancamentoInvalido("Conta não encontrada.");
        if (ref[0].tipo_categoria !== tipo) throw new LancamentoInvalido("Categoria não encontrada para este tipo de lançamento.");
        const parcelasAtuais = Number(l.parcelas);
        const linhas = linhasDaEdicao({ tipo, valor, data, parcelas: b.parcelas == null ? parcelasAtuais : Number(b.parcelas), tipoDaConta: String(ref[0].tipo_conta) });
        const grupo = linhas.length > 1 ? String(l.grupo ?? crypto.randomUUID()) : null;
        consultas = [
          // Parcelas que sobram saem primeiro, para os CHECKs de parcelamento valerem linha a linha.
          ...(l.grupo ? [consulta("delete from transactions where installment_group_id = $1 and installment_no > $2", l.grupo, linhas.length)] : []),
          ...linhas.map((x, i) => {
            const campos = [x.tipo, contaId, categoriaId, paraNumeric(x.valor), data, descricao, x.parcela, x.totalDeParcelas, grupo] as const;
            if (i < parcelasAtuais)
              return consulta(
                // invoice_month volta a nulo para o trigger recalcular a fatura pela conta e data novas.
                `update transactions set kind = $1::transaction_kind, account_id = $2::uuid, category_id = $3::uuid, amount = $4::numeric,
                        occurred_on = $5::date, description = $6, installment_no = $7, installment_total = $8,
                        installment_group_id = $9::uuid, invoice_month = null
                  where ${l.grupo ? "installment_group_id = $10 and installment_no = $11" : "id = $10"} returning id`,
                ...campos, ...(l.grupo ? [l.grupo, i + 1] : [id]),
              );
            return consulta(
              `insert into transactions (user_id, kind, account_id, category_id, amount, occurred_on, description,
                                         installment_no, installment_total, installment_group_id)
               values (current_app_user(), $1::transaction_kind, $2::uuid, $3::uuid, $4::numeric, $5::date, $6, $7, $8, $9::uuid)
               returning id`,
              ...campos,
            );
          }),
        ];
      }
    } catch (e) {
      if (e instanceof LancamentoInvalido) return c.json({ erro: e.message }, 400);
      if (e instanceof Error && !("code" in e)) return c.json({ erro: e.message }, 400);
      throw e;
    }
    try {
      await rodar(c, consultas);
      return c.json({ id });
    } catch (e) {
      if (ehErroDeDado(e)) return c.json({ erro: "O banco recusou a alteração. Confira conta, categoria e data." }, 400);
      throw e;
    }
  });

  app.delete("/api/lancamentos/:id", async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) return c.json({ erro: "Lançamento inválido." }, 400);
    // Compra parcelada sai inteira; transferência sai com as duas pernas.
    const [l = []] = await rodar(c, [
      consulta(
        `delete from transactions t using transactions alvo
          where alvo.id = $1
            and (t.id = alvo.id or t.installment_group_id = alvo.installment_group_id or t.transfer_id = alvo.transfer_id)
         returning t.id`,
        id,
      ),
    ]);
    return l.length ? c.json({ excluidos: l.length }) : c.json({ erro: "Lançamento não encontrado." }, 404);
  });
}
