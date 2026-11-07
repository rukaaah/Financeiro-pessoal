import { chaveDeDuplicidade, chaveDoCofrinho, cofrinhoNaDescricao, deNumeric, normalizarEstabelecimento, paraNumeric, TIPOS_DA_LINHA, type TipoDaLinha } from "@financeiro/dominio";
import type { Hono } from "hono";
import type { Rodar } from "./app.ts";
import { consulta } from "./banco.ts";

const UUID = /^[0-9a-f-]{36}$/i, DATA = /^\d{4}-\d{2}-\d{2}$/;
type Linha = { data: string; descricao: string; valor: string; categoria_id?: string | null; tipo?: TipoDaLinha; cofrinho?: string | null; cofrinho_id?: string | null; finalidade?: string | null; original?: string | null };
const FINALIDADES = ["use", "loan", "withdrawal"];
/** Insert que precisa gravar: se não gravar nada (conta ou categoria que não combina), o lote inteiro desfaz. */
const exigir = (insert: string) => `with i as (${insert}) select 1 / (select count(*)::int from i) as ok`;

/** Tipo da linha: o que veio (da IA) se combinar com o sinal; senão cofrinho pela descrição; senão gasto ou entrada. */
function tipoDaLinha(l: Linha, valor: bigint): { tipo: TipoDaLinha; cofrinho: string | null } {
  const sai = valor < 0n;
  const veio = TIPOS_DA_LINHA.includes(l.tipo as TipoDaLinha) ? l.tipo! : null;
  if (veio && (veio === "gasto" || veio === "guardar") === sai) {
    const cofrinho = veio === "guardar" || veio === "resgatar" ? (l.cofrinho?.trim() || cofrinhoNaDescricao(l.descricao)) : null;
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
    const [h = [], regras = [], existentes = [], cats = [], cofrinhos = []] = await rodar(c, [
      consulta(SQL_HISTORICO),
      consulta(SQL_REGRAS),
      consulta("select occurred_on::text as data, amount::text as valor, description as descricao from transactions where account_id = $1 and occurred_on >= $2::date", b.conta_id, linhas.map((l) => l.data).sort()[0]),
      consulta("select id, kind as tipo from categories where active"),
      consulta("select id, name as nome from accounts where kind = 'goal' and active"),
    ]);
    const sugerir = sugeridor(h, regras);
    const tipoDaCategoria = new Map(cats.map((k) => [String(k.id), String(k.tipo)]));
    const cofrinhoPorChave = new Map(cofrinhos.map((k) => [chaveDoCofrinho(String(k.nome)), { id: String(k.id), nome: String(k.nome) }]));
    const ja = new Set(existentes.map((e) => chaveDeDuplicidade({ data: String(e.data), valor: deNumeric(String(e.valor)), descricao: String(e.descricao) })));
    return c.json({
      linhas: linhas.map((l) => {
        const valor = deNumeric(l.valor);
        const { tipo, cofrinho } = tipoDaLinha(l, valor);
        const original = typeof l.original === "string" && l.original.trim() ? l.original.slice(0, 300) : null;
        const duplicada = ja.has(chaveDeDuplicidade({ data: l.data, valor, descricao: l.descricao }));
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
    const preparadas: (Movimento | DeCofrinho)[] = [];
    for (const l of linhas) {
      const v = (() => { try { return deNumeric(String(l.valor)); } catch { return 0n; } })();
      if (!DATA.test(String(l.data)) || v === 0n) return c.json({ erro: "Toda linha precisa de data e valor." }, 400);
      const { tipo, cofrinho } = tipoDaLinha(l, v);
      const descricao = String(l.descricao ?? "").slice(0, 200);
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
