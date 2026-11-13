import { deDigitado, paraNumeric } from "@financeiro/dominio";
import type { Context, Hono } from "hono";
import type { Rodar } from "./app.ts";
import { consulta } from "./banco.ts";

const UUID = /^[0-9a-f-]{36}$/i, DATA = /^\d{4}-\d{2}-\d{2}$/;
type Corpo = Record<string, unknown>;
const corpo = (c: { req: { json<T>(): Promise<T> } }) => c.req.json<Corpo>().catch(() => ({}) as Corpo);
const TIPOS_DE_CONTA = ["checking", "credit_card", "goal", "investment", "cash"];
const CLASSES = ["paper", "brick", "logistics", "infra", "treasury", "other"];

/** Erro do banco que é do pedido (dado inválido, sem permissão de admin) e não do servidor. */
function respostaDeErro(c: Context, e: unknown) {
  const codigo = (e as { code?: string })?.code ?? "";
  if (codigo === "42501") return c.json({ erro: "Só quem administra o app pode fazer isso." }, 403);
  if (codigo === "23505") return c.json({ erro: "Já existe um cadastro com esse nome." }, 400);
  if (/^(22|23|P0)/.test(codigo)) return c.json({ erro: "O banco recusou: confira os dados." }, 400);
  throw e;
}

export function rotasDeAjustes<E extends object>(app: Hono<{ Bindings: E }>, rodar: Rodar<E>) {
  app.get("/api/ajustes", async (c) => {
    const [contas = [], prazos = [], categorias = [], grupos = [], regras = [], recorrentes = [], inv = [], metas = [], admin = []] = await rodar(c, [
      consulta("select id, name as nome, kind as tipo, active as ativa from accounts where kind <> 'receivable' order by active desc, kind, name"),
      consulta(`select t.account_id as cartao, a.name as nome, t.closing_day as fechamento, t.due_day as vencimento, lower(t.vigencia)::text as desde
                  from account_terms t join accounts a on a.id = t.account_id where t.vigencia @> current_date`),
      consulta(`select k.id, k.name as nome, k.kind as tipo, g.name as grupo, k.active as ativa,
                       (select bt.amount::text from budget_templates bt where bt.category_id = k.id and bt.valid_from <= current_date order by bt.valid_from desc limit 1) as previsto
                  from categories k join category_groups g on g.id = k.group_id order by k.kind desc, g.sort_order, g.name, k.name`),
      consulta("select id, name as nome from category_groups order by sort_order, name"),
      consulta("select r.id, r.contains as contem, r.priority as prioridade, k.name as categoria from categorization_rules r join categories k on k.id = r.category_id order by r.priority, r.contains"),
      consulta(`select b.id, b.name as nome, b.amount::text as valor, b.due_day as dia, b.urgency as urgencia from recurring_bills b
                 where b.valid_until is null or b.valid_until >= current_date order by b.due_day`),
      consulta("select max_pvp::float as max_pvp, max_weight::float as max_peso, min_liquidity::float as min_liquidez from investment_rules"),
      consulta("select class as classe, percent::float as meta from allocation_targets"),
      consulta("select is_admin from app_users where id = current_app_user()"),
    ]);
    return c.json({ contas, prazos, categorias, grupos, regras, recorrentes, investimento: inv[0] ?? null, metas, admin: Boolean(admin[0]?.is_admin) });
  });

  app.post("/api/contas", async (c) => {
    const b = await corpo(c);
    const nome = String(b.nome ?? "").trim(), tipo = String(b.tipo ?? "");
    if (!nome || !TIPOS_DE_CONTA.includes(tipo)) return c.json({ erro: "Dê nome e tipo à conta." }, 400);
    try {
      const [l = []] = await rodar(c, [consulta("insert into accounts (user_id, name, kind) values (current_app_user(), $1, $2::account_kind) returning id", nome.slice(0, 60), tipo)]);
      return c.json({ id: l[0]?.id }, 201);
    } catch (e) { return respostaDeErro(c, e); }
  });

  app.patch("/api/contas/:id", async (c) => {
    const id = c.req.param("id"), b = await corpo(c);
    if (!UUID.test(id)) return c.json({ erro: "Conta inválida." }, 400);
    try {
      const [l = []] = await rodar(c, [consulta("update accounts set name = coalesce($2, name), active = coalesce($3, active) where id = $1 returning id",
        id, b.nome == null ? null : String(b.nome).trim().slice(0, 60), b.ativa == null ? null : Boolean(b.ativa))]);
      return l.length ? c.json({ ok: true }) : c.json({ erro: "Conta não encontrada." }, 404);
    } catch (e) { return respostaDeErro(c, e); }
  });

  /** Novos prazos do cartão a partir de uma data: fecha a vigência atual e abre outra (ADR-005). */
  app.post("/api/cartoes/:id/prazos", async (c) => {
    const id = c.req.param("id"), b = await corpo(c);
    const fecha = Number(b.fechamento), vence = Number(b.vencimento), desde = String(b.desde ?? "");
    if (!UUID.test(id) || !(fecha >= 1 && fecha <= 31) || !(vence >= 1 && vence <= 31) || !DATA.test(desde)) return c.json({ erro: "Fechamento e vencimento de 1 a 31, e a data a partir da qual vale." }, 400);
    try {
      const [, l = []] = await rodar(c, [
        consulta("update account_terms set vigencia = daterange(lower(vigencia), $2::date) where account_id = $1 and vigencia @> $2::date and lower(vigencia) < $2::date", id, desde),
        consulta(`insert into account_terms (user_id, account_id, vigencia, closing_day, due_day)
                  select current_app_user(), a.id, daterange($2::date, null), $3, $4 from accounts a where a.id = $1 and a.kind = 'credit_card' returning id`, id, desde, fecha, vence),
      ]);
      return l.length ? c.json({ ok: true }, 201) : c.json({ erro: "Cartão não encontrado." }, 404);
    } catch (e) { return respostaDeErro(c, e); }
  });

  app.post("/api/categorias", async (c) => {
    const b = await corpo(c);
    const nome = String(b.nome ?? "").trim(), grupo = String(b.grupo ?? "").trim(), tipo = b.tipo === "income" ? "income" : "expense";
    if (!nome || !grupo) return c.json({ erro: "Dê nome e grupo à categoria." }, 400);
    let previsto: string | null = null;
    try { if (b.previsto) previsto = paraNumeric(deDigitado(String(b.previsto))); } catch { return c.json({ erro: "Digite o previsto como 600,00." }, 400); }
    try {
      const [, , l = []] = await rodar(c, [
        consulta("insert into category_groups (user_id, name) values (current_app_user(), $1) on conflict (user_id, name) do nothing", grupo.slice(0, 40)),
        consulta("select 1"),
        consulta(`insert into categories (user_id, group_id, name, kind)
                  select current_app_user(), g.id, $2, $3::category_kind from category_groups g where g.name = $1 returning id`, grupo.slice(0, 40), nome.slice(0, 40), tipo),
      ]);
      const id = l[0]?.id;
      if (id && previsto) await rodar(c, [consulta("insert into budget_templates (user_id, category_id, amount, valid_from) values (current_app_user(), $1, $2::numeric, date_trunc('month', current_date)::date)", id, previsto)]);
      return c.json({ id }, 201);
    } catch (e) { return respostaDeErro(c, e); }
  });

  /** Arquivar esconde dos formulários sem apagar o histórico (RF03). */
  app.patch("/api/categorias/:id", async (c) => {
    const id = c.req.param("id"), b = await corpo(c);
    if (!UUID.test(id)) return c.json({ erro: "Categoria inválida." }, 400);
    const [l = []] = await rodar(c, [consulta("update categories set active = $2 where id = $1 returning id", id, Boolean(b.ativa))]);
    return l.length ? c.json({ ok: true }) : c.json({ erro: "Categoria não encontrada." }, 404);
  });

  app.post("/api/regras", async (c) => {
    const b = await corpo(c);
    const contem = String(b.contem ?? "").trim().toUpperCase();
    if (contem.length < 2 || !UUID.test(String(b.categoria_id))) return c.json({ erro: "Texto com 2 letras ou mais e uma categoria." }, 400);
    try {
      const [l = []] = await rodar(c, [consulta("insert into categorization_rules (user_id, contains, category_id, priority) values (current_app_user(), $1, $2, $3) returning id", contem.slice(0, 60), b.categoria_id, Number(b.prioridade ?? 50))]);
      return c.json({ id: l[0]?.id }, 201);
    } catch (e) { return respostaDeErro(c, e); }
  });

  app.delete("/api/regras/:id", async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) return c.json({ erro: "Regra inválida." }, 400);
    const [l = []] = await rodar(c, [consulta("delete from categorization_rules where id = $1 returning id", id)]);
    return l.length ? c.json({ ok: true }) : c.json({ erro: "Regra não encontrada." }, 404);
  });

  app.delete("/api/contas-recorrentes/:id", async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) return c.json({ erro: "Conta inválida." }, 400);
    // Encerrar a vigência, não apagar: os meses passados continuam como foram.
    const [l = []] = await rodar(c, [consulta("update recurring_bills set valid_until = (date_trunc('month', current_date) - interval '1 day')::date where id = $1 returning id", id)]);
    return l.length ? c.json({ ok: true }) : c.json({ erro: "Conta não encontrada." }, 404);
  });

  app.put("/api/investimentos/regras", async (c) => {
    const b = await corpo(c);
    const metas = (b.metas && typeof b.metas === "object" ? b.metas : {}) as Record<string, unknown>;
    const soma = Object.values(metas).reduce<number>((s, v) => s + Number(v || 0), 0);
    if (soma > 100.0001) return c.json({ erro: "As metas por classe somam mais de 100%." }, 400);
    try {
      await rodar(c, [
        consulta(`insert into investment_rules (user_id, max_pvp, max_weight, min_liquidity) values (current_app_user(), $1, $2, $3)
                  on conflict (user_id) do update set max_pvp = excluded.max_pvp, max_weight = excluded.max_weight, min_liquidity = excluded.min_liquidity`,
          Number(b.max_pvp ?? 1), Number(b.max_peso ?? 20), Number(b.min_liquidez ?? 500000)),
        consulta("delete from allocation_targets"),
        ...Object.entries(metas).filter(([k, v]) => CLASSES.includes(k) && Number(v) > 0).map(([k, v]) =>
          consulta("insert into allocation_targets (user_id, class, percent) values (current_app_user(), $1::asset_class, $2)", k, Number(v))),
      ]);
      return c.json({ ok: true });
    } catch (e) { return respostaDeErro(c, e); }
  });

  // ------------------------------------------------------------ acesso (RF19)
  app.get("/api/acesso", async (c) => {
    try {
      const [pessoas = [], registro = []] = await rodar(c, [consulta("select id, email, display_name as nome, is_admin as admin, active as ativa, is_demo as demo from admin_list_app_users()"), consulta("select quando::text, quem, acao, alvo from admin_access_log()")]);
      return c.json({ pessoas, registro });
    } catch (e) { return respostaDeErro(c, e); }
  });

  app.post("/api/acesso", async (c) => {
    const b = await corpo(c);
    const email = String(b.email ?? "").trim().toLowerCase(), nome = String(b.nome ?? "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !nome) return c.json({ erro: "E-mail e nome da pessoa." }, 400);
    try {
      await rodar(c, [consulta("select admin_add_app_user($1, $2)", email, nome.slice(0, 60))]);
      return c.json({ ok: true }, 201);
    } catch (e) { return respostaDeErro(c, e); }
  });

  app.patch("/api/acesso/:id", async (c) => {
    const id = c.req.param("id"), b = await corpo(c);
    if (!UUID.test(id)) return c.json({ erro: "Pessoa inválida." }, 400);
    try {
      await rodar(c, [consulta("select admin_set_active($1, $2)", id, Boolean(b.ativa))]);
      return c.json({ ok: true });
    } catch (e) { return respostaDeErro(c, e); }
  });
}
