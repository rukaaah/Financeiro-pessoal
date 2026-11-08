import { chaveDeDuplicidade, chaveDoCofrinho, cofrinhoNaDescricao, nomeDoCofrinho, deNumeric, normalizarEstabelecimento, paraNumeric, TIPOS_DA_LINHA, type TipoDaLinha } from "@financeiro/dominio";
import type { Hono } from "hono";
import type { Rodar } from "./app.ts";
import { consulta } from "./banco.ts";

const UUID = /^[0-9a-f-]{36}$/i, DATA = /^\d{4}-\d{2}-\d{2}$/;
/** "transferir" não vem da IA: a pessoa marca na revisão (ou o histórico sugere) que é troca entre contas dela. */
type TipoNaRevisao = TipoDaLinha | "transferir";
type Linha = { data: string; descricao: string; valor: string; categoria_id?: string | null; tipo?: TipoNaRevisao; cofrinho?: string | null; cofrinho_id?: string | null; finalidade?: string | null; original?: string | null; outra_conta_id?: string | null };
/** Contas entre as quais o dinheiro só troca de lugar (as mesmas do /api/transferir). */
const CONTAS_PROPRIAS = "('checking','cash','investment')";
const FINALIDADES = ["use", "loan", "withdrawal"];
/** Insert que precisa gravar: se não gravar nada (conta ou categoria que não combina), o lote inteiro desfaz. */
const exigir = (insert: string) => `with i as (${insert}) select 1 / (select count(*)::int from i) as ok`;

/** Tipo da linha: o que veio (da IA) se combinar com o sinal; senão cofrinho pela descrição; senão gasto ou entrada. */
function tipoDaLinha(l: Linha, valor: bigint): { tipo: TipoDaLinha; cofrinho: string | null } {
  const sai = valor < 0n;
  const veio = TIPOS_DA_LINHA.includes(l.tipo as TipoDaLinha) ? (l.tipo as TipoDaLinha) : null;
  if (veio && (veio === "gasto" || veio === "guardar") === sai) {
    const cofrinho = veio === "guardar" || veio === "resgatar" ? ((l.cofrinho ? nomeDoCofrinho(l.cofrinho) : null) || cofrinhoNaDescricao(l.descricao)) : null;
    if (veio === "gasto" || veio === "entrada" || cofrinho) return { tipo: veio, cofrinho };
  }
  const cofrinho = cofrinhoNaDescricao(l.descricao);
  if (cofrinho) return { tipo: sai ? "guardar" : "resgatar", cofrinho };
  return { tipo: sai ? "gasto" : "entrada", cofrinho: null };
}

/** Regras do usuário primeiro (RF05), depois o histórico de descrição → categoria (ideia 13). */
const SQL_REGRAS = "select contains as contem, category_id as categoria from categorization_rules order by priority, length(contains) desc";
const SQL_HISTORICO = `
  select description as descricao, category_id as categoria, kind as tipo from transactions
   where kind in ('income','expense') and category_id is not null order by occurred_on desc limit 1000`;

/** Descrições que já foram troca de conta saindo (ou entrando) desta conta, com a outra conta. */
const SQL_TRANSFERENCIAS = `
  select t.description as descricao, (t.amount < 0) as sai, o.account_id as outra from transactions t
    join transactions o on o.transfer_id = t.transfer_id and o.id <> t.id
    join accounts a on a.id = o.account_id
   where t.account_id = $1 and t.kind = 'transfer' and t.goal_movement is null and a.kind in ${CONTAS_PROPRIAS} and a.active
   order by t.occurred_on desc limit 300`;

function sugeridorDeTransferencia(historico: Record<string, unknown>[]) {
  const porChave = new Map<string, string>();
  for (const h of historico) {
    const chave = `${h.sai}|${normalizarEstabelecimento(String(h.descricao))}`;
    if (!chave.endsWith("|") && !porChave.has(chave)) porChave.set(chave, String(h.outra));
  }
  return (descricao: string, sai: boolean) => porChave.get(`${sai}|${normalizarEstabelecimento(descricao)}`) ?? null;
}

function sugeridor(historico: Record<string, unknown>[], regras: Record<string, unknown>[] = []) {
  const contagem = new Map<string, Map<string, number>>();
  for (const h of historico) {
    const chave = `${h.tipo}|${normalizarEstabelecimento(String(h.descricao))}`;
    if (chave.endsWith("|")) continue;
    const m = contagem.get(chave) ?? new Map<string, number>();
    m.set(String(h.categoria), (m.get(String(h.categoria)) ?? 0) + 1);
    contagem.set(chave, m);
  }
  return (descricao: string, tipo: "income" | "expense") => {
    const porRegra = regras.find((r) => descricao.toUpperCase().includes(String(r.contem)));
    if (porRegra) return String(porRegra.categoria);
    const m = contagem.get(`${tipo}|${normalizarEstabelecimento(descricao)}`);
    return m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0]![0] : null;
  };
}

export function rotasDeImportacao<E extends object>(app: Hono<{ Bindings: E }>, rodar: Rodar<E>) {
  app.get("/api/sugerir-categoria", async (c) => {
    const descricao = (c.req.query("descricao") ?? "").slice(0, 120), tipo = c.req.query("tipo") === "income" ? "income" : "expense";
    const [h = [], r = []] = await rodar(c, [consulta(SQL_HISTORICO), consulta(SQL_REGRAS)]);
    return c.json({ categoria_id: sugeridor(h, r)(descricao, tipo) });
  });

  /** Prévia: marca duplicadas, sugere categoria e acha (ou propõe) o cofrinho. Nada é gravado. */
  app.post("/api/importar/previa", async (c) => {
    const b = await c.req.json<{ conta_id?: string; linhas?: Linha[] }>().catch(() => ({}) as { conta_id?: string; linhas?: Linha[] });
    const linhas = (b.linhas ?? []).slice(0, 500);
    if (!UUID.test(String(b.conta_id)) || !linhas.length) return c.json({ erro: "Escolha a conta e envie o extrato." }, 400);
    const [h = [], regras = [], existentes = [], cats = [], cofrinhos = [], trocas = [], proprias = []] = await rodar(c, [
      consulta(SQL_HISTORICO),
      consulta(SQL_REGRAS),
      consulta("select occurred_on::text as data, amount::text as valor, description as descricao from transactions where account_id = $1 and occurred_on >= $2::date", b.conta_id, linhas.map((l) => l.data).sort()[0]),
      consulta("select id, kind as tipo from categories where active"),
      consulta("select id, name as nome from accounts where kind = 'goal' and active"),
      consulta(SQL_TRANSFERENCIAS, b.conta_id),
      consulta(`select id from accounts where active and kind in ${CONTAS_PROPRIAS} and id <> $1`, b.conta_id),
    ]);
    const sugerir = sugeridor(h, regras);
    const sugerirTroca = sugeridorDeTransferencia(trocas);
    const outrasContas = new Set(proprias.map((k) => String(k.id)));
    const tipoDaCategoria = new Map(cats.map((k) => [String(k.id), String(k.tipo)]));
    const cofrinhoPorChave = new Map(cofrinhos.map((k) => [chaveDoCofrinho(String(k.nome)), { id: String(k.id), nome: String(k.nome) }]));
    const ja = new Set(existentes.map((e) => chaveDeDuplicidade({ data: String(e.data), valor: deNumeric(String(e.valor)), descricao: String(e.descricao) })));
    return c.json({
      linhas: linhas.map((l) => {
        const valor = deNumeric(l.valor);
        const { tipo, cofrinho } = tipoDaLinha(l, valor);
        const original = typeof l.original === "string" && l.original.trim() ? l.original.slice(0, 300) : null;
        const duplicada = ja.has(chaveDeDuplicidade({ data: l.data, valor, descricao: l.descricao }));
        // Troca de conta: o que a pessoa marcou, ou o que essa descrição já foi antes (exceto se a IA viu cofrinho).
        const outra = l.tipo === "transferir" && outrasContas.has(String(l.outra_conta_id)) ? String(l.outra_conta_id)
          : tipo === "gasto" || tipo === "entrada" ? sugerirTroca(l.descricao, valor < 0n) : null;
        if (outra && outrasContas.has(outra)) {
          return { data: l.data, descricao: l.descricao, original, valor: l.valor, duplicada, tipo: "transferir", cofrinho: null, cofrinho_id: null, categoria_id: null, outra_conta_id: outra };
        }
        if (tipo === "guardar" || tipo === "resgatar") {
          const achado = cofrinhoPorChave.get(chaveDoCofrinho(cofrinho!));
          return { data: l.data, descricao: l.descricao, original, valor: l.valor, duplicada, tipo, cofrinho: achado?.nome ?? cofrinho, cofrinho_id: achado?.id ?? null, categoria_id: null, finalidade: tipo === "resgatar" ? "withdrawal" : null };
        }
        const kind = tipo === "entrada" ? "income" : "expense";
        const veio = l.categoria_id && tipoDaCategoria.get(l.categoria_id) === kind ? l.categoria_id : null;
        // Regra e histórico do usuário primeiro; a categoria proposta pela IA cobre o que nunca foi visto.
        return { data: l.data, descricao: l.descricao, original, valor: l.valor, duplicada, tipo, cofrinho: null, cofrinho_id: null, categoria_id: sugerir(l.descricao, kind) ?? veio };
      }),
    });
  });

  /** Confirma: tudo numa transação só, criando os cofrinhos que ainda não existem. */
  app.post("/api/importar", async (c) => {
    const b = await c.req.json<{ conta_id?: string; linhas?: Linha[] }>().catch(() => ({}) as { conta_id?: string; linhas?: Linha[] });
    const linhas = (b.linhas ?? []).slice(0, 500);
    if (!UUID.test(String(b.conta_id)) || !linhas.length) return c.json({ erro: "Nada para importar." }, 400);
    type Movimento = { tipo: "gasto" | "entrada"; v: bigint; data: string; descricao: string; categoria_id: string };
    type DeCofrinho = { tipo: "guardar" | "resgatar"; v: bigint; data: string; descricao: string; cofrinho_id: string; cofrinho: string; fin: string | null };
    type Troca = { tipo: "transferir"; v: bigint; data: string; descricao: string; outra_conta_id: string };
    const preparadas: (Movimento | DeCofrinho | Troca)[] = [];
    for (const l of linhas) {
      const v = (() => { try { return deNumeric(String(l.valor)); } catch { return 0n; } })();
      if (!DATA.test(String(l.data)) || v === 0n) return c.json({ erro: "Toda linha precisa de data e valor." }, 400);
      const descricao = String(l.descricao ?? "").slice(0, 200);
      if (l.tipo === "transferir") {
        if (!UUID.test(String(l.outra_conta_id)) || l.outra_conta_id === b.conta_id) return c.json({ erro: "Escolha a outra conta de cada troca entre contas." }, 400);
        preparadas.push({ tipo: "transferir", v, data: l.data, descricao, outra_conta_id: String(l.outra_conta_id) });
        continue;
      }
      const { tipo, cofrinho } = tipoDaLinha(l, v);
      if (tipo === "gasto" || tipo === "entrada") {
        if (!UUID.test(String(l.categoria_id))) return c.json({ erro: "Escolha a categoria de todos os gastos e entradas." }, 400);
        preparadas.push({ tipo, v, data: l.data, descricao, categoria_id: String(l.categoria_id) });
      } else {
        const id = UUID.test(String(l.cofrinho_id)) ? String(l.cofrinho_id) : "";
        const nome = (cofrinho ?? "").slice(0, 60);
        if (!id && !nome) return c.json({ erro: "Toda linha de cofrinho precisa do nome do cofrinho." }, 400);
        const fin = tipo === "resgatar" ? (FINALIDADES.includes(String(l.finalidade)) ? String(l.finalidade) : "withdrawal") : l.finalidade === "repayment" ? "repayment" : null;
        preparadas.push({ tipo, v, data: l.data, descricao, cofrinho_id: id, cofrinho: nome, fin });
      }
    }
    // Cofrinho novo: criado com o nome do extrato, a menos que já exista um com o mesmo nome.
    const deCofrinho = preparadas.filter((p): p is DeCofrinho => p.tipo === "guardar" || p.tipo === "resgatar");
    const novos = [...new Map(deCofrinho.filter((p) => !p.cofrinho_id).map((p) => [chaveDoCofrinho(p.cofrinho), p.cofrinho])).values()];
    const criar = novos.map((nome) => consulta(
      `insert into accounts (user_id, name, kind) select current_app_user(), $1::text, 'goal'
        where not exists (select 1 from accounts where kind = 'goal' and lower(name) = lower($1::text))
       on conflict (user_id, name) do nothing returning id`, nome));
    const COFRINHO = `(select a.id from accounts a where a.kind = 'goal' and (a.id::text = $1::text or lower(a.name) = lower($2::text)) order by (a.id::text = $1::text) desc limit 1)`;
    const insercoes = preparadas.flatMap((p) => {
      if (p.tipo === "transferir") {
        // Duas pernas que somam zero: o que saiu desta conta entra na outra (ou o contrário).
        const tid = crypto.randomUUID();
        const perna = (conta: string, valor: bigint) => consulta(exigir(
          `insert into transactions (user_id, kind, account_id, amount, occurred_on, description, transfer_id)
           select current_app_user(), 'transfer', a.id, $2::numeric, $3::date, $4, $5::uuid from accounts a where a.id = $1 and a.kind in ${CONTAS_PROPRIAS} returning id`),
          conta, paraNumeric(valor), p.data, p.descricao, tid);
        return [perna(String(b.conta_id), p.v), perna(p.outra_conta_id, -p.v)];
      }
      if (p.tipo === "gasto" || p.tipo === "entrada") {
        return [consulta(exigir(
          `insert into transactions (user_id, kind, account_id, category_id, amount, occurred_on, description)
           select current_app_user(), k.kind::text::transaction_kind, a.id, k.id, $3::numeric, $4::date, $5
             from accounts a, categories k
            where a.id = $1 and a.kind in ('checking','cash') and k.id = $2 and k.kind = $6::category_kind returning id`),
          b.conta_id, p.categoria_id, paraNumeric(p.v), p.data, p.descricao, p.tipo === "entrada" ? "income" : "expense")];
      }
      const q = p as DeCofrinho;
      const tid = crypto.randomUUID();
      return [
        consulta(exigir(`insert into transactions (user_id, kind, account_id, amount, occurred_on, description, transfer_id)
          select current_app_user(), 'transfer', a.id, $2::numeric, $3::date, $4, $5::uuid from accounts a where a.id = $1 and a.kind in ('checking','cash') returning id`),
          b.conta_id, paraNumeric(q.v), q.data, q.descricao, tid),
        consulta(exigir(`insert into transactions (user_id, kind, account_id, amount, occurred_on, description, transfer_id, goal_movement)
          select current_app_user(), 'transfer', g.id, $3::numeric, $4::date, $5, $6::uuid, $7::goal_movement from ${COFRINHO} g(id) where g.id is not null returning id`),
          q.cofrinho_id, q.cofrinho, paraNumeric(-q.v), q.data, q.descricao, tid, q.fin),
      ];
    });
    try {
      const r = await rodar(c, [...criar, ...insercoes]);
      return c.json({ importadas: preparadas.length, cofrinhos_criados: r.slice(0, criar.length).filter((x) => x.length).length }, 201);
    } catch (e) {
      const codigo = (e as { code?: string })?.code ?? "";
      if (codigo === "22012") return c.json({ erro: "Alguma linha não combina: conta de outro tipo, categoria de outro tipo ou um cofrinho com o nome de outra conta. Nada foi importado." }, 400);
      if (/^(22|23)/.test(codigo)) return c.json({ erro: "O banco recusou a importação. Nada foi importado." }, 400);
      throw e;
    }
  });
}
