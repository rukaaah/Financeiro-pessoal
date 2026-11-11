import { lerNotificacao, type Sessao } from "@financeiro/dominio";
import type { Context, Hono } from "hono";
import { type Consulta, consulta, type Linha } from "./banco.ts";
import { hojeEmSaoPaulo } from "./contexto.ts";
import { lerExtratoComIA } from "./extrato-ia.ts";
import { consultasDoFundo, historicoLimpo, montarContextoDoFundo, PAPEL_FUNDO, RESPOSTA_DEMO_FUNDO, selicMeta, TICKER } from "./ia-fundo.ts";

/**
 * IA (ADR-018, docs/v3/04-ia.md, prompts/ia/chat.md). A IA não lê o banco: ela escolhe
 * funções de um catálogo fechado, o Worker executa sob RLS, e ela só escreve a resposta
 * com os números devolvidos. Todo número da resposta é conferido; o que não bate é
 * descartado. Demonstração nunca chama o modelo.
 */

export interface ModeloDeIA { run(modelo: string, entrada: object): Promise<unknown> }
export type RodarComSessao<E extends object> = (c: Context<{ Bindings: E }>, consultas: readonly Consulta[]) => Promise<{ sessao: Sessao; linhas: Linha[][] }>;

const MODELO = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const COTA_DIARIA = 40, COTA_EXTRATO = 15;
const MES = /^\d{4}-\d{2}$/, UUID = /^[0-9a-f-]{36}$/i;

/** Respostas fixas do modo demonstração (requisito 3 do pedido). */
export const RESPOSTAS_DEMO: Record<string, { pergunta: string; resposta: string }[]> = {
  mes: [
    { pergunta: "Avalie meu orçamento", resposta: "Exemplo: você gastou 45% do previsto até o dia 4, com R$ 1.700,00 de contas ainda a pagar. Mercado está em 83% do previsto." },
    { pergunta: "Onde gastei mais?", resposta: "Exemplo: Mercado concentra a maior parte do gasto do mês, seguido de Moradia." },
  ],
  categoria: [{ pergunta: "Onde gastei mais?", resposta: "Exemplo: a maior parte desta categoria saiu em duas compras no cartão." }],
  investimentos: [{ pergunta: "O que mudou na carteira?", resposta: "Exemplo: EXEMP11 foi o que mais subiu no mês e TESTE11 o que mais caiu. Não faço recomendação de compra ou venda." }],
  fundo: [{ pergunta: "Vale a pena aumentar a posição?", resposta: RESPOSTA_DEMO_FUNDO }],
};

/**
 * Apaga CPF, CNPJ, e-mail e sequências de 4+ dígitos que não sejam valor, data ou ano.
 * Nomes de pessoas e estabelecimentos ficam: a IA precisa deles para entender onde, como
 * e por que se gasta (decisão do Pedro, 2026-11-07).
 */
export function limpar(texto: string): string {
  return texto
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "•••")
    .replace(/[\d*•]{3}\.[\d*•]{3}\.[\d*•]{3}-[\d*•]{2}/g, "•••")
    .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, "•••")
    .replace(/(?<![\d.,/])(?!(?:19|20)\d{2}(?!\d))\d{4,}(?![\d.,/])/g, "•••");
}

/** Os números que a resposta cita precisam estar nos resultados (normalizados para 2 casas). */
export function numerosConferem(citados: unknown, resultados: unknown): boolean {
  if (!Array.isArray(citados)) return true;
  const pool = new Set<string>();
  JSON.stringify(resultados).replace(/-?\d+(?:\.\d+)?/g, (n) => { pool.add(Number(n).toFixed(2)); pool.add(String(Number(n))); return n; });
  const numero = (c: unknown) => { const t = String(c).replace(/R\$\s?/, "").trim(); return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); };
  return citados.every((c) => { const n = numero(c); return Number.isFinite(n) && (pool.has(n.toFixed(2)) || pool.has(String(n))); });
}

function jsonDe(saida: unknown): Record<string, unknown> | null {
  const texto = typeof saida === "object" && saida && "response" in saida ? (saida as { response: unknown }).response : saida;
  if (texto && typeof texto === "object") return texto as Record<string, unknown>;
  const m = /\{[\s\S]*\}/.exec(String(texto ?? ""));
  try { return m ? (JSON.parse(m[0]) as Record<string, unknown>) : null; } catch { return null; }
}

/** Catálogo fechado de funções. Cada uma é uma consulta já pronta, executada sob RLS. */
function funcao(nome: string, args: Record<string, unknown>): { consulta: Consulta; limpar?: boolean } | null {
  const de = MES.test(String(args.de)) ? String(args.de) : null, ate = MES.test(String(args.ate)) ? String(args.ate) : null;
  const mes = MES.test(String(args.mes)) ? String(args.mes) : null;
  const cats = Array.isArray(args.categorias) ? args.categorias.filter((x) => UUID.test(String(x))).map(String).slice(0, 20) : [];
  switch (nome) {
    case "gasto_por_categoria":
      if (!de || !ate) return null;
      return { consulta: consulta(`select k.name as categoria, to_char(mes_do_orcamento(t.occurred_on, t.invoice_month), 'YYYY-MM') as mes, sum(-t.amount)::numeric(14,2)::text as gasto
          from transactions t join categories k on k.id = t.category_id where t.kind = 'expense'
           and mes_do_orcamento(t.occurred_on, t.invoice_month) between ($1 || '-01')::date and ($2 || '-01')::date
           and (cardinality($3::uuid[]) = 0 or k.id = any($3::uuid[])) group by 1, 2 order by 2, 3 desc`, de, ate, cats) };
    case "gasto_por_dia_da_semana":
      if (!mes) return null;
      return { consulta: consulta(`select to_char(t.occurred_on, 'TMDay') as dia, count(*)::int as quantidade, sum(-t.amount)::numeric(14,2)::text as gasto
          from transactions t where t.kind = 'expense' and mes_do_orcamento(t.occurred_on, t.invoice_month) = ($1 || '-01')::date
           and (cardinality($2::uuid[]) = 0 or t.category_id = any($2::uuid[])) group by 1 order by 3 desc`, mes, cats) };
    case "lancamentos":
      if (!de || !ate) return null;
      return { consulta: consulta(`select t.occurred_on::text as data, t.description as descricao, k.name as categoria, t.amount::text as valor
          from transactions t join categories k on k.id = t.category_id where t.kind in ('income','expense')
           and mes_do_orcamento(t.occurred_on, t.invoice_month) between ($1 || '-01')::date and ($2 || '-01')::date
           and (cardinality($3::uuid[]) = 0 or k.id = any($3::uuid[])) order by abs(t.amount) desc limit 40`, de, ate, cats), limpar: true };
    case "previsto":
      if (!mes) return null;
      return { consulta: consulta(`select k.name as categoria, p.previsto::text from previsto_do_mes(($1 || '-01')::date) p join categories k on k.id = p.category_id
           where (cardinality($2::uuid[]) = 0 or k.id = any($2::uuid[]))`, mes, cats) };
    case "posicoes":
      return { consulta: consulta(`select a.ticker, a.class as classe, sum(t.quantity)::text as quantidade,
           (select q.price::text from asset_quotes q where q.ticker = a.ticker order by quoted_on desc limit 1) as preco,
           (select q.pvp::text from asset_quotes q where q.ticker = a.ticker order by quoted_on desc limit 1) as pvp,
           (select q.dy_12m::text from asset_quotes q where q.ticker = a.ticker order by quoted_on desc limit 1) as dy_12m
          from assets a join asset_trades t on t.asset_id = a.id group by a.id order by a.ticker`) };
    default: return null;
  }
}

const PAPEL_PLANO = `Você traduz perguntas sobre finanças pessoais, em português do Brasil, num plano de consultas a funções. Não responda à pergunta.
Funções: gasto_por_categoria{categorias:[id],de:"AAAA-MM",ate:"AAAA-MM"}; gasto_por_dia_da_semana{categorias:[id],mes}; lancamentos{categorias:[id],de,ate} (os maiores lançamentos, com descrição); previsto{categorias:[id],mes}; posicoes{} (carteira de investimentos).
Use só ids e funções da entrada, no máximo 4 chamadas. "Este mês" e "mês passado" são relativos a hoje. Responda SOMENTE JSON: {"chamadas":[{"funcao":"...","args":{...}}],"faltou":null}. Se nenhuma função serve, "chamadas":[] e explique em "faltou".`;

const PAPEL_RESPOSTA = `Você responde em português do Brasil, em até 4 frases, sobre as finanças de uma pessoa, usando SOMENTE os números em "resultados".
Sem julgamento, sem emoji, sem exclamação. Gasto no cartão já está no mês da fatura. Transferência não é gasto.
Investimentos: interprete, nunca recomende comprar, vender ou manter; se perguntarem, diga "Não faço recomendação de investimento. O Onde aportar aplica as suas regras."
"Como diminuir" ou "como melhorar": sugestões presas aos números, com a conta.
Responda SOMENTE JSON: {"resposta":"...","numeros_citados":["123.45"],"perguntas_seguintes":["...","..."]}.`;

export function rotasDaIA<E extends object>(app: Hono<{ Bindings: E }>, rodar: RodarComSessao<E>, modelo: (env: E) => ModeloDeIA | null) {
  app.post("/api/chat", async (c) => {
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const contexto = ["mes", "categoria", "investimentos", "fundo"].includes(String(b.contexto)) ? String(b.contexto) : "mes";
    const pergunta = String(b.pergunta ?? "").trim().slice(0, 300);
    const hoje = hojeEmSaoPaulo(), mes = MES.test(String(b.mes)) ? String(b.mes) : hoje.slice(0, 7);
    const [{ sessao, linhas: [cats = [], hojeL = []] }] = await Promise.all([rodar(c, [
      consulta("select k.id, k.name as nome, g.name as grupo from categories k join category_groups g on g.id = k.group_id where k.active"),
      consulta("select count(*)::int as n from ai_calls where created_at >= now() - interval '1 day'"),
    ])]);
    if (sessao.modo === "demo") {
      const fixas = RESPOSTAS_DEMO[contexto] ?? [];
      return c.json({ demo: true, resposta: fixas.find((f) => f.pergunta === pergunta)?.resposta ?? "No modo demonstração as respostas são de exemplo. Toque numa das perguntas prontas.", perguntas_seguintes: fixas.map((f) => f.pergunta) });
    }
    const ia = modelo(c.env);
    if (!ia) return c.json({ erro: "IA desligada neste ambiente." }, 503);
    if (Number(hojeL[0]?.n ?? 0) >= COTA_DIARIA) return c.json({ erro: "Limite de perguntas de hoje atingido. Volta amanhã." }, 429);
    if (!pergunta) return c.json({ erro: "Escreva a pergunta." }, 400);
    if (contexto === "fundo") {
      const ticker = String(b.ticker ?? "").toUpperCase();
      if (!TICKER.test(ticker)) return c.json({ erro: "Fundo inválido." }, 400);
      const [{ linhas }, selic] = await Promise.all([rodar(c, consultasDoFundo(ticker)), selicMeta()]);
      const dados = montarContextoDoFundo(ticker, hoje, linhas, selic);
      const entrada = JSON.stringify({ contexto: dados, pergunta });
      const resp = jsonDe(await ia.run(MODELO, { messages: [{ role: "system", content: PAPEL_FUNDO }, ...historicoLimpo(b.historico), { role: "user", content: entrada }], max_tokens: 700, temperature: 0.2 }));
      const aceito = !!resp && typeof resp.resposta === "string" && numerosConferem(resp.numeros_citados, dados);
      await rodar(c, [consulta("insert into ai_calls (user_id, use_case, input_chars, accepted) values (current_app_user(), 'chat', $1, $2)", entrada.length, aceito)]);
      if (!aceito) return c.json({ resposta: "A resposta da IA citou números que não estão nos dados do fundo, então descartei. Pergunte de outro jeito.", perguntas_seguintes: [] });
      const lista = (v: unknown, n: number) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, n) : []);
      return c.json({ resposta: resp!.resposta, verificado: lista(resp!.verificado, 6), faltou: typeof resp!.faltou === "string" && resp!.faltou ? resp!.faltou : null, perguntas_seguintes: lista(resp!.perguntas_seguintes, 2) });
    }
    const contextoTexto = { hoje, mes, contexto, categoria_id: UUID.test(String(b.categoria_id)) ? b.categoria_id : null, categorias: cats.map((k) => ({ id: k.id, nome: k.nome, grupo: k.grupo })) };
    const plano = jsonDe(await ia.run(MODELO, { messages: [{ role: "system", content: PAPEL_PLANO }, { role: "user", content: JSON.stringify({ ...contextoTexto, pergunta }) }], max_tokens: 400 }));
    const chamadas = (Array.isArray(plano?.chamadas) ? plano!.chamadas : []).slice(0, 4) as { funcao?: string; args?: Record<string, unknown> }[];
    const execs = chamadas.map((ch) => ({ ch, f: funcao(String(ch.funcao), ch.args ?? {}) })).filter((x) => x.f);
    let resultados: { funcao: string; linhas: Linha[] }[] = [];
    if (execs.length) {
      const { linhas } = await rodar(c, execs.map((x) => x.f!.consulta));
      resultados = execs.map((x, i) => ({ funcao: String(x.ch.funcao), linhas: (linhas[i] ?? []).map((l) => (x.f!.limpar ? { ...l, descricao: limpar(String(l.descricao ?? "")) } : l)) }));
    }
    const entrada = JSON.stringify({ pergunta, contexto, resultados, faltou: plano?.faltou ?? null });
    const resp = execs.length ? jsonDe(await ia.run(MODELO, { messages: [{ role: "system", content: PAPEL_RESPOSTA }, { role: "user", content: entrada }], max_tokens: 500 })) : null;
    const aceito = !!resp && typeof resp.resposta === "string" && numerosConferem(resp.numeros_citados, resultados);
    await rodar(c, [consulta("insert into ai_calls (user_id, use_case, input_chars, accepted) values (current_app_user(), 'chat', $1, $2)", entrada.length, aceito)]);
    if (!execs.length) return c.json({ resposta: String(plano?.faltou ?? "Não sei responder isso com os dados do app."), perguntas_seguintes: [] });
    if (!aceito) return c.json({ resposta: "A resposta da IA citou números que não estão nos seus dados, então mostro só a tabela.", tabela: resultados, perguntas_seguintes: [] });
    return c.json({ resposta: resp!.resposta, perguntas_seguintes: Array.isArray(resp!.perguntas_seguintes) ? resp!.perguntas_seguintes.slice(0, 2) : [], tabela: resultados });
  });

  /** Reserva da regra de notificação: só quando lerNotificacao não reconhece (ideia 11). */
  app.post("/api/ia/notificacao", async (c) => {
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const texto = String(b.texto ?? "").slice(0, 500), hoje = hojeEmSaoPaulo();
    const pelaRegra = lerNotificacao(texto, hoje);
    if (pelaRegra) return c.json({ regra: true });
    const [{ sessao }] = await Promise.all([rodar(c, [])]);
    if (sessao.modo === "demo") return c.json({ reconheceu: false, motivo: "No modo demonstração a IA não é chamada." });
    const ia = modelo(c.env);
    if (!ia) return c.json({ erro: "IA desligada neste ambiente." }, 503);
    const mascarado = limpar(texto);
    const r = jsonDe(await ia.run(MODELO, { messages: [{ role: "system", content: 'Extraia de uma notificação de banco brasileiro uma movimentação. Responda SOMENTE JSON: {"reconheceu":true,"trecho_do_valor":"R$ 42,50","trecho_da_data":"03/11","estabelecimento":"NOME","sentido":"saida"|"entrada"}. trecho_do_valor e trecho_da_data são cópias literais do texto. Sem valor: {"reconheceu":false,"motivo":"..."}' }, { role: "user", content: JSON.stringify({ hoje, texto: mascarado }) }], max_tokens: 200 }));
    const ok = !!r?.reconheceu && typeof r.trecho_do_valor === "string" && mascarado.includes(r.trecho_do_valor);
    await rodar(c, [consulta("insert into ai_calls (user_id, use_case, input_chars, accepted) values (current_app_user(), 'notificacao', $1, $2)", mascarado.length, ok)]);
    if (!ok) return c.json({ reconheceu: false, motivo: "Não reconheci este formato." });
    const relido = lerNotificacao(`${r!.trecho_do_valor} ${r!.trecho_da_data ?? ""} em ${String(r!.estabelecimento ?? "")}`, hoje);
    return c.json({ reconheceu: !!relido, valor: relido ? String(relido.valor) : null, data: relido?.data ?? null, estabelecimento: relido?.estabelecimento ?? null, sentido: r!.sentido === "entrada" ? "entrada" : "saida" });
  });

  /**
   * Extrato lido pela IA: qualquer formato de banco, inclusive guardar e resgatar de
   * cofrinho. Nada é gravado aqui; as linhas seguem para a prévia e o usuário confirma.
   */
  app.post("/api/ia/extrato", async (c) => {
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const texto = String(b.texto ?? "").slice(0, 120_000), hoje = hojeEmSaoPaulo();
    if (!texto.trim()) return c.json({ erro: "Envie o texto do extrato." }, 400);
    const [{ sessao, linhas: [cats = [], hojeL = []] }] = await Promise.all([rodar(c, [
      consulta("select id, name as nome, kind as tipo from categories where active order by name"),
      consulta("select count(*)::int as n from ai_calls where use_case = 'extrato' and created_at >= now() - interval '1 day'"),
    ])]);
    if (sessao.modo === "demo") return c.json({ demo: true, motivo: "No modo demonstração a IA não é chamada." });
    const ia = modelo(c.env);
    if (!ia) return c.json({ erro: "IA desligada neste ambiente." }, 503);
    if (Number(hojeL[0]?.n ?? 0) >= COTA_EXTRATO) return c.json({ erro: "Limite de leituras de extrato de hoje atingido. Volta amanhã." }, 429);
    const categorias = cats.map((k) => ({ id: String(k.id), nome: String(k.nome), tipo: String(k.tipo) }));
    const { caracteres, ...leitura } = await lerExtratoComIA(ia, MODELO, texto, categorias, hoje);
    await rodar(c, [consulta("insert into ai_calls (user_id, use_case, input_chars, accepted) values (current_app_user(), 'extrato', $1, $2)", caracteres, leitura.linhas.length > 0)]);
    return c.json(leitura);
  });
}
