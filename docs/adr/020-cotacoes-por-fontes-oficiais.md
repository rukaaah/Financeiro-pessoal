# ADR-020 — Cotações e indicadores de FII por fontes oficiais, sem scraping

- **Status:** Proposto (aguarda o Pedro no PR). Substitui a leitura do Investidor10 da fatia 7.
- **Data:** 2026-11-05

## Contexto

O job da fatia 7 lia a página de cada FII no Investidor10. Os Termos de Uso do site
(https://investidor10.com.br/pagina/termos-de-uso/, "Regras Gerais e Políticas", item 8)
dizem que "é terminantemente proibido baixar ou reproduzir de qualquer outra maneira o
conteúdo da plataforma", e o item 9 proíbe retransmitir qualquer parte do serviço. Ler a
página de hora em hora, como o Pedro pediu, conflita com isso.

O job também nunca rodou: o GitHub só dispara `schedule` pelo arquivo do branch padrão
("Scheduled workflows will only run on the default branch", documentação de eventos do
GitHub Actions), e o `cotacoes.yml` só existia na `replanejamento/v3`.

## Fontes conferidas em 2026-11-05

| Fonte | O que dá | Custo e limite | Conferido como |
|---|---|---|---|
| B3, arquivo diário `COTAHIST_DDDMMAAAA.ZIP` | Fechamento, volume financeiro e ISIN de todo papel do dia | Grátis, sem cadastro; publicado por volta das 20h30 | Baixado num job do GitHub Actions em 05/11; layout oficial (revisão 02, 05/10/2020) |
| CVM, informe mensal estruturado de FII | `Valor_Patrimonial_Cotas`, `Percentual_Dividend_Yield_Mes` (fração), ISIN e CNPJ | Grátis, licença ODbL, atualização semanal | https://dados.cvm.gov.br/dataset/fii-doc-inf_mensal; colunas lidas do arquivo de 2026 |
| brapi, plano gratuito | Preço intradia (`regularMarketPrice`) | 15.000 pedidos/mês, 1 ativo por pedido, ~30 min de atraso, exige token | https://brapi.dev/faq/quais-as-limitacoes; sem token responde `MISSING_TOKEN` |
| brapi, `/api/v2/fii/*` | P/VP e DY prontos | Só no plano Pro (pago); sem token, só MXRF11 e HGLG11 | https://brapi.dev/faq/a-brapi-tem-dados-de-fundos-imobiliarios-fiis-tao-detalhados-quanto-os-de-acoes |

## Decisão

1. **Fechamento (B3 + CVM), toda noite de dia útil.** Preço e volume do dia pela B3;
   completa os pregões que faltam nos últimos 31 dias. Informes da CVM deste ano e do
   anterior em `fii_reports` (migration 013), ligados ao ticker pelo ISIN.
2. **Intradia (brapi), de hora em hora no pregão**, só se o secret `BRAPI_TOKEN` existir.
   Não passa por cima do fechamento da B3. Com 8 leituras por dia útil, cabem cerca de
   80 tickers no limite mensal.
3. **P/VP e DY calculados**, não copiados. A CVM define o DY do mês como "rendimentos
   declarados por cota no mês de referência / valor patrimonial da cota do último dia útil
   do mês anterior". Então rendimento do mês m = `dy_mes(m) × vp(m-1)`, e
   DY 12m = soma dos 12 rendimentos / preço. Sem 13 meses seguidos de informe, fica vazio.
4. **Liquidez** = média do volume financeiro diário dos últimos 21 pregões gravados.
5. Até o corte, o `cotacoes.yml` também vive no `main`, fazendo checkout da `replanejamento/v3`.

## Consequências

- Nenhum serviço pago, nenhuma leitura de página de terceiros.
- P/VP usa o informe mais recente, que chega à CVM até o meio do mês seguinte: o VP tem
  de 1 a 2 meses de atraso. A tela diz de que mês é.
- O DY é estimativa pelo histórico, não promessa; a tela diz isso.
