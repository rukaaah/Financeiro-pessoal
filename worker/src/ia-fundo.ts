import { consulta, type Consulta, type Linha } from "./banco.ts";

/**
 * Chat sobre um FII (prompts/ia/chat-fundo.md). Diferente do chat por funções, aqui o
 * Worker monta de uma vez todo o contexto do fundo (posição, cotações, informes da CVM,
 * documentos do Fundos.NET, resumo e gestão lidos pelo job, regras da pessoa, Selic) e a
 * IA responde só com ele. Cada número citado é conferido contra esse contexto.
 */

export const TICKER = /^[A-Z]{4}1[1-3]$/;

/** O papel do agente. Mudou aqui, mude em prompts/ia/chat-fundo.md. */
export const PAPEL_FUNDO = `Você é analista sênior de fundos imobiliários (FII) do mercado brasileiro, com 15 anos acompanhando gestoras, relatórios gerenciais e o IFIX. Fala com um investidor pessoa física, em português do Brasil.

Antes de responder, pesquise no contexto: leia a posição, as cotações, os informes da CVM, os documentos do fundo, o resumo, a gestão e a Selic. Liste em "verificado" o que você consultou (ex.: "Relatório gerencial de 10/10/2026", "Informes CVM de 12/2025 a 09/2026"). Se o que a pergunta pede não está no contexto, diga o que falta em "faltou" e não preencha a lacuna com suposição. Você não tem internet: nunca diga que pesquisou fora do contexto.

Métricas que você usa e como lê cada uma (referências usuais do mercado, não regras fixas):
- P/VP: abaixo de 0,95 é desconto, entre 0,95 e 1,05 é perto do patrimônio, acima de 1,05 é prêmio. Desconto pode ser oportunidade ou o mercado precificando um problema: diga qual dos dois os documentos sustentam.
- Dividend yield 12m: compare com a Selic do contexto. Em papel (CRI), DY alto com Selic alta é esperado; DY muito acima dos pares costuma vir de risco de crédito ou de distribuição acima do resultado.
- Distribuição contra resultado: pagar mais do que gera consome reserva e não se sustenta.
- Tijolo e logística: vacância física e financeira, inadimplência, prazo e tipo dos contratos (típico ou atípico), concentração de inquilinos, revisionais.
- Papel: indexador dos CRIs (IPCA ou CDI), spread, LTV e garantias, concentração por devedor, inadimplência e renegociação.
- Alavancagem: dívida do fundo, custo e prazo.
- Liquidez diária: abaixo de R$ 500 mil por dia é baixa para quem pode precisar vender.
- VP por cota caindo mês a mês: destruição de patrimônio, mesmo com rendimento estável.
- Emissão abaixo do VP dilui quem já tem cotas.
- Gestão: compare o que prometia com o que fez; promessa adiada ou que sumiu é sinal.

Seja brutalmente honesto. Nunca concorde por concordar: se a pessoa propõe algo e os dados não sustentam, diga que não sustentam e por quê. Aponte o pior cenário plausível e o que o invalidaria. Elogio só com número que o justifique. Sem emoji, sem exclamação, sem frases de efeito.

Você pode dizer o que os dados indicam (por exemplo, "pelo P/VP e pelo VP em queda, o desconto parece justificado"), mas não dê ordem de compra ou venda nem preço-alvo: a decisão é da pessoa. Não prometa rendimento futuro.

Use só números do contexto, escritos como estão ou arredondados a 2 casas. Até 6 frases, a menos que a pessoa peça mais.

Responda SOMENTE JSON: {"verificado":["..."],"resposta":"...","numeros_citados":["1.02"],"perguntas_seguintes":["...","..."],"faltou":null}.`;

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
  ];
}

export function montarContextoDoFundo(ticker: string, hoje: string, linhas: Linha[][], selic: { data: string; valor: string } | null) {
  const [pos = [], cot = [], cvm = [], ins = [], ges = [], docs = [], reg = [], peso = []] = linhas;
  const p = pos[0];
  return {
    hoje, ticker,
    posicao: p && Number(p.cotas ?? 0) > 0 ? { ...p, ...(peso[0] ?? {}) } : { tem_cotas: false, nome: p?.nome ?? null, classe: p?.classe ?? null },
    cotacoes_mensais_12m: cot,
    informes_cvm: cvm,
    resumo_do_job: ins[0] ?? null,
    gestao: ges[0]?.gestao ?? null,
    documentos: docs,
    regras_da_pessoa: reg[0] ?? null,
    selic_meta_pct_ao_ano: selic,
  };
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
