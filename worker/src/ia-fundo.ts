import { consulta, type Consulta, type Linha } from "./banco.ts";

/**
 * Chat sobre um FII (prompts/ia/chat-fundo.md). Diferente do chat por funções, aqui o
 * Worker monta de uma vez todo o contexto do fundo (posição, cotações, informes da CVM,
 * documentos do Fundos.NET, resumo e gestão lidos pelo job, regras da pessoa, Selic) e a
 * IA responde só com ele. Cada número citado é conferido contra esse contexto.
 */

export const TICKER = /^[A-Z]{4}1[1-3]$/;

/** O papel do agente. Mudou aqui, mude em prompts/ia/chat-fundo.md. */
export const PAPEL_FUNDO = `Você lê os dados de um fundo imobiliário (FII) brasileiro para um investidor pessoa física e explica o que eles mostram, em português do Brasil. Você não é analista nem consultor de investimentos, e não fala como se fosse.

Antes de responder, pesquise no contexto: leia o medidor, a cotação mais recente, a posição, as cotações, os informes da CVM, os documentos do fundo, o resumo, a gestão e a comparação com a Selic. Liste em "verificado" o que você consultou, com o nome e a data como estão no contexto (ex.: "Relatório Gerencial de 10/10/2026", "Informes CVM de 12/2025 a 09/2026"). O app confere cada data citada: fonte com data que não está no contexto derruba a resposta. Se o que a pergunta pede não está no contexto, diga o que falta em "faltou" e não preencha a lacuna com suposição nem com o que você lembra do mercado. Você não tem internet: nunca diga que pesquisou fora do contexto.

Regras de imparcialidade:
- O "medidor" é a conta fixa do app sobre o momento de compra. Você não pode ser mais otimista que ele: se o veredito é "esperar" ou "sem_dados", ou se não há medidor, "tom" não pode ser "favoravel". Você pode ser mais cauteloso.
- Sempre preencha "contra" com o principal ponto contra a ideia da pergunta ou contra o fundo, preso a um fato do contexto. Resposta sem "contra" é descartada.
- Sempre compare o rendimento com "comparacao_com_selic" quando ela existir: o dinheiro parado no Tesouro Selic é a alternativa de toda compra.
- Não compare com outros fundos: o contexto não traz dados deles.
- Se "cotacao_mais_recente.dado_velho" for true, diga logo no começo que o preço tem mais de 3 dias.
- O preço médio da pessoa só vem quando ela pergunta por ele; não use o que ela pagou como motivo para comprar mais ou para manter.
- Se a pergunta já traz a resposta que a pessoa quer ouvir, avalie a ideia, não a pessoa: se os dados não sustentam, diga que não sustentam e por quê.

Como ler as métricas (referências usuais do mercado, não regras fixas):
- P/VP: abaixo de 0,95 é desconto, entre 0,95 e 1,05 é perto do patrimônio, acima de 1,05 é prêmio. Desconto pode ser oportunidade ou o mercado precificando um problema: diga qual dos dois os documentos sustentam.
- Dividend yield 12m: compare com a Selic líquida do contexto. Em papel (CRI), DY alto com Selic alta é esperado; DY alto demais costuma vir de risco de crédito ou de distribuição acima do resultado.
- Distribuição contra resultado: pagar mais do que gera consome reserva e não se sustenta.
- Tijolo e logística: vacância física e financeira, inadimplência, prazo e tipo dos contratos (típico ou atípico), concentração de inquilinos, revisionais.
- Papel: indexador dos CRIs (IPCA ou CDI), spread, LTV e garantias, concentração por devedor, inadimplência e renegociação.
- Alavancagem: dívida do fundo, custo e prazo.
- Liquidez diária: abaixo de R$ 500 mil por dia é baixa para quem pode precisar vender.
- VP por cota caindo mês a mês: destruição de patrimônio, mesmo com rendimento estável.
- Emissão abaixo do VP dilui quem já tem cotas.
- Gestão: compare o que prometia com o que fez; promessa adiada ou que sumiu é sinal.

Seja brutalmente honesto. Nunca concorde por concordar. Aponte o pior cenário plausível e o que o invalidaria. Elogio só com número que o justifique. Sem emoji, sem exclamação, sem frases de efeito.

Você pode dizer o que os dados indicam (por exemplo, "pelo P/VP e pelo VP em queda, o desconto parece justificado"), mas não dê ordem de compra ou venda nem preço-alvo: a decisão é da pessoa. Não prometa rendimento futuro nem preveja a Selic.

Use só números do contexto, escritos como estão ou arredondados a 2 casas. Até 6 frases em "resposta", a menos que a pessoa peça mais.

Responda SOMENTE JSON: {"verificado":["..."],"resposta":"...","contra":"...","tom":"favoravel|neutro|desfavoravel","numeros_citados":["1.02"],"perguntas_seguintes":["...","..."],"faltou":null}.`;

const TRECHO_DOC = 1500;

/** As consultas do contexto de um fundo, na ordem que `montarContextoDoFundo` espera. */
export function consultasDoFundo(ticker: string): Consulta[] {
  return [
    consulta(`select a.ticker, a.name as nome, a.class as classe, sum(t.quantity)::text as cotas,
                     (sum(t.quantity * t.unit_price) filter (where t.quantity > 0) / nullif(sum(t.quantity) filter (where t.quantity > 0), 0))::numeric(14,2)::text as preco_medio,
                     min(t.traded_on)::text as primeira_compra
                from assets a left join asset_trades t on t.asset_id = a.id where a.ticker = $1 group by a.id`, ticker),
    consulta(`select quoted_on::text as data, price::numeric(14,2)::text as preco, pvp::text, dy_12m::text as dy_12m_pct, liquidity::numeric(18,0)::text as liquidez
                from (select distinct on (date_trunc('month', quoted_on)) * from asset_quotes where ticker = $1 and quoted_on >= current_date - 365
                       order by date_trunc('month', quoted_on), quoted_on desc) m order by quoted_on`, ticker),
    consulta(`select to_char(ref_month, 'YYYY-MM') as mes, nav_per_share::numeric(14,2)::text as vp_cota, (dy_month * 100)::numeric(8,2)::text as dy_mes_pct
                from fii_reports where ticker = $1 order by ref_month desc limit 12`, ticker),
    consulta(`select summary as resumo, prepare as preparar, events as eventos, to_char(generated_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as gerado_em
                from fii_insights where ticker = $1`, ticker),
    consulta("select management as gestao from fii_management where ticker = $1", ticker),
    consulta(`select id, title as titulo, to_char(delivered_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as entregue_em, left(content, ${TRECHO_DOC}) as trecho
                from fii_documents where ticker = $1 order by delivered_at desc limit 8`, ticker),
    consulta(`select coalesce(r.max_pvp, 1)::text as pvp_maximo, coalesce(r.max_weight, 20)::text as peso_maximo_pct, coalesce(r.min_liquidity, 500000)::text as liquidez_minima
                from (select 1) x left join investment_rules r on true`),
    consulta(`with v as (select a.ticker, sum(t.quantity) * coalesce((select price from asset_quotes q where q.ticker = a.ticker order by quoted_on desc limit 1),
                                                       sum(t.quantity * t.unit_price) / nullif(sum(t.quantity), 0)) as valor
                        from assets a join asset_trades t on t.asset_id = a.id group by a.ticker)
              select (100 * coalesce((select valor from v where ticker = $1), 0) / nullif((select sum(valor) from v), 0))::numeric(6,2)::text as peso_na_carteira_pct`, ticker),
    consulta(`select quoted_on::text as data, price::numeric(14,2)::text as preco, pvp::text, dy_12m::text as dy_12m_pct
                from asset_quotes where ticker = $1 order by quoted_on desc limit 1`, ticker),
    consulta(`select day::text as dia, verdict as veredito, score as nota, reason as motivo, risks as riscos
                from fii_opportunities where ticker = $1 order by day desc limit 1`, ticker),
  ];
}

/** A pessoa perguntou pelo que pagou? Só então o preço médio entra (evita ancorar a resposta nele). */
export const PERGUNTA_DE_CUSTO = /pre[cç]o m[eé]dio|paguei|lucro|preju[ií]zo|custo|comprei a/i;
const DIAS_DADO_VELHO = 3;
const pct = (v: number) => v.toFixed(2);
const numeroBr = (t: string) => Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
}

export function montarContextoDoFundo(ticker: string, hoje: string, linhas: Linha[][], selic: { data: string; valor: string } | null, pergunta = "") {
  const [pos = [], cot = [], cvm = [], ins = [], ges = [], docs = [], reg = [], peso = [], ult = [], med = []] = linhas;
  const p = pos[0];
  const semCusto = Object.fromEntries(Object.entries(p ?? {}).filter(([k]) => k !== "preco_medio" && k !== "primeira_compra"));
  const posicaoComCotas = PERGUNTA_DE_CUSTO.test(pergunta) ? { ...p } : { ...semCusto, preco_medio: "só quando a pessoa pergunta pelo que pagou" };
  const u = ult[0];
  const cotacao = u ? { ...u, dias_desde: diasEntre(String(u.data), hoje), dado_velho: diasEntre(String(u.data), hoje) > DIAS_DADO_VELHO } : null;
  const m = med[0];
  const medidor: (Linha & { aviso: string }) | null = m ? { ...m, aviso: "conta fixa do app; a resposta não pode ser mais otimista que este veredito" } : null;
  const selicN = selic ? numeroBr(selic.valor) : NaN, dyN = u?.dy_12m_pct != null ? Number(u.dy_12m_pct) : NaN;
  const comparacao = Number.isFinite(selicN)
    ? {
        selic_meta_pct: pct(selicN),
        selic_liquida_ir_15_pct: pct(selicN * 0.85),
        selic_liquida_ir_22_5_pct: pct(selicN * 0.775),
        ir_do_tesouro_selic: "tabela regressiva: 22,5% até 180 dias, 15% acima de 720 dias",
        ...(Number.isFinite(dyN) ? { dy_12m_pct: pct(dyN), dy_menos_selic_liquida_ir_15_pp: pct(dyN - selicN * 0.85) } : {}),
      }
    : null;
  return {
    hoje, ticker,
    medidor,
    cotacao_mais_recente: cotacao,
    posicao: p && Number(p.cotas ?? 0) > 0 ? { ...posicaoComCotas, ...(peso[0] ?? {}) } : { tem_cotas: false, nome: p?.nome ?? null, classe: p?.classe ?? null },
    cotacoes_mensais_12m: cot,
    informes_cvm: cvm,
    resumo_do_job: ins[0] ?? null,
    gestao: ges[0]?.gestao ?? null,
    documentos: docs,
    regras_da_pessoa: reg[0] ?? null,
    selic_meta_pct_ao_ano: selic,
    comparacao_com_selic: comparacao,
  };
}

type ContextoDoFundo = ReturnType<typeof montarContextoDoFundo>;

/** Datas que aparecem no contexto, em todas as grafias que a IA costuma usar. */
function datasDoContexto(dados: unknown): Set<string> {
  const ok = new Set<string>();
  const texto = JSON.stringify(dados);
  for (const [, a, m, d] of texto.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) ok.add(`${d}/${m}/${a}`).add(`${m}/${a}`);
  for (const [, a, m] of texto.matchAll(/(\d{4})-(\d{2})(?!\d)/g)) ok.add(`${m}/${a}`);
  for (const [, d, m, a] of texto.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)) ok.add(`${d}/${m}/${a}`).add(`${m}/${a}`);
  return ok;
}

/** Normaliza as datas de um texto para dd/mm/aaaa ou mm/aaaa. */
function datasCitadas(texto: string): string[] {
  const iso = texto.replace(/(\d{4})-(\d{2})-(\d{2})/g, "$3/$2/$1").replace(/(\d{4})-(\d{2})(?!\d)/g, "$2/$1");
  return [...iso.matchAll(/\b(?:\d{1,2}\/)?\d{1,2}\/\d{4}\b/g)].map((x) => x[0].split("/").map((p) => p.padStart(2, "0")).join("/"));
}

/**
 * Travas de imparcialidade do chat do fundo. Devolve o motivo do descarte, ou null se a
 * resposta passa: fonte com data inexistente, sem ponto contra, ou tom mais otimista que
 * o medidor (conta fixa do app, ADR-022).
 */
export function descarteDoFundo(resp: Record<string, unknown>, dados: ContextoDoFundo): string | null {
  const verificado = Array.isArray(resp.verificado) ? resp.verificado.map(String).filter(Boolean) : [];
  if (verificado.length === 0) return "A IA não disse o que consultou, então descartei.";
  const datas = datasDoContexto(dados);
  if (verificado.some((v) => datasCitadas(v).some((d) => !datas.has(d)))) return "A IA citou uma fonte com data que não está nos dados do fundo, então descartei.";
  if (typeof resp.contra !== "string" || resp.contra.trim().length < 10) return "A IA não apontou nenhum ponto contra, então descartei.";
  const tom = String(resp.tom ?? "");
  if (!["favoravel", "neutro", "desfavoravel"].includes(tom)) return "A IA não classificou o tom da resposta, então descartei.";
  const veredito = String(dados.medidor?.veredito ?? "");
  if (tom === "favoravel" && !["grande_dia", "bom_preco"].includes(veredito)) return "A IA foi mais otimista que o medidor do app, então descartei.";
  return null;
}

/** Meta Selic do BCB (SGS 432). Opcional: sem resposta em 3 s, o contexto segue sem ela. */
export async function selicMeta(buscar: typeof fetch = fetch): Promise<{ data: string; valor: string } | null> {
  try {
    const r = await buscar("https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json", { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    const [ult] = (await r.json()) as { data: string; valor: string }[];
    return ult ? { data: ult.data, valor: ult.valor } : null;
  } catch {
    return null;
  }
}

/** Histórico curto vindo da tela: no máximo 4 trocas, textos cortados. */
export function historicoLimpo(bruto: unknown): { role: "user" | "assistant"; content: string }[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.slice(-4).flatMap((m) => {
    const eu = String((m as { eu?: unknown })?.eu ?? "").slice(0, 300), ia = String((m as { ia?: unknown })?.ia ?? "").slice(0, 800);
    return eu && ia ? [{ role: "user" as const, content: eu }, { role: "assistant" as const, content: ia }] : [];
  });
}

export const RESPOSTA_DEMO_FUNDO = "Exemplo: com P/VP de 1,01 o fundo está perto do patrimônio, e o relatório mais novo adiou a venda de um imóvel prometida antes. No modo demonstração a IA não é chamada.";
