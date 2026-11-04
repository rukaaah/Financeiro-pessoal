import { chaveDeDuplicidade, deNumeric, normalizarEstabelecimento, paraNumeric } from "@financeiro/dominio";
import type { Hono } from "hono";
import type { Rodar } from "./app.ts";
import { consulta } from "./banco.ts";

const UUID = /^[0-9a-f-]{36}$/i, DATA = /^\d{4}-\d{2}-\d{2}$/;
type Linha = { data: string; descricao: string; valor: string; categoria_id?: string };

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

  /** Prévia: marca duplicadas e sugere categoria. Nada é gravado. */
  app.post("/api/importar/previa", async (c) => {
    const b = await c.req.json<{ conta_id?: string; linhas?: Linha[] }>().catch(() => ({}) as { conta_id?: string; linhas?: Linha[] });
    const linhas = (b.linhas ?? []).slice(0, 500);
    if (!UUID.test(String(b.conta_id)) || !linhas.length) return c.json({ erro: "Escolha a conta e envie o extrato." }, 400);
    const [h = [], regras = [], existentes = []] = await rodar(c, [
      consulta(SQL_HISTORICO),
      consulta(SQL_REGRAS),
      consulta("select occurred_on::text as data, amount::text as valor, description as descricao from transactions where account_id = $1 and occurred_on >= $2::date", b.conta_id, linhas.map((l) => l.data).sort()[0]),
    ]);
    const sugerir = sugeridor(h, regras);
    const ja = new Set(existentes.map((e) => chaveDeDuplicidade({ data: String(e.data), valor: deNumeric(String(e.valor)), descricao: String(e.descricao) })));
    return c.json({
      linhas: linhas.map((l) => {
        const valor = deNumeric(l.valor);
        return { ...l, duplicada: ja.has(chaveDeDuplicidade({ data: l.data, valor, descricao: l.descricao })), categoria_id: sugerir(l.descricao, valor > 0n ? "income" : "expense") };
      }),
    });
  });

  /** Confirma: tudo numa transação só. */
  app.post("/api/importar", async (c) => {
    const b = await c.req.json<{ conta_id?: string; linhas?: Linha[] }>().catch(() => ({}) as { conta_id?: string; linhas?: Linha[] });
    const linhas = (b.linhas ?? []).slice(0, 500);
    if (!UUID.test(String(b.conta_id)) || !linhas.length) return c.json({ erro: "Nada para importar." }, 400);
    for (const l of linhas) if (!DATA.test(l.data) || !UUID.test(String(l.categoria_id)) || deNumeric(l.valor) === 0n) return c.json({ erro: "Toda linha precisa de data, valor e categoria." }, 400);
    try {
      const r = await rodar(c, linhas.map((l) => {
        const v = deNumeric(l.valor);
        return consulta(
          `insert into transactions (user_id, kind, account_id, category_id, amount, occurred_on, description)
           select current_app_user(), k.kind::text::transaction_kind, a.id, k.id, $3::numeric, $4::date, $5
             from accounts a, categories k
            where a.id = $1 and a.kind in ('checking','cash') and k.id = $2 and k.kind = $6::category_kind returning id`,
          b.conta_id, l.categoria_id, paraNumeric(v), l.data, l.descricao.slice(0, 200), v > 0n ? "income" : "expense");
      }));
      const ok = r.filter((x) => x.length).length;
      if (ok !== linhas.length) return c.json({ erro: "Alguma categoria não combina com o tipo (gasto ou entrada) da linha." }, 400);
      return c.json({ importadas: ok }, 201);
    } catch (e) {
      if (/^(22|23)/.test((e as { code?: string })?.code ?? "")) return c.json({ erro: "O banco recusou a importação." }, 400);
      throw e;
    }
  });
}
