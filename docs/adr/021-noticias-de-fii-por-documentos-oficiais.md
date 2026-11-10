# ADR-021 — Notícias e insights de FII pelos documentos oficiais do fundo

- **Status:** Proposto (aguarda o Pedro no PR).
- **Data:** 2026-11-10

## Contexto

O Pedro pediu, em cada card de FII da aba Patrimônio, as últimas notícias, as emissões,
um resumo por IA e o que fazer para se preparar (direito de preferência, data-com,
assembleia). Mesma restrição do ADR-020: nada de raspar site que proíbe cópia.

## Decisão

- **Fonte:** Fundos.NET da B3 (`fnet.bmfbovespa.com.br`), consulta pública onde o próprio
  fundo publica fato relevante, comunicado ao mercado, aviso aos cotistas (rendimento,
  data-base), relatório gerencial, oferta pública (emissões) e edital de assembleia. É a
  fonte primária do que os portais de notícia repetem. Busca por CNPJ, que já temos do
  informe mensal da CVM (`fii_reports`).
- **Fora, por ora:** manchetes de portais e do Google News. Os termos do Google News
  proíbem "robot, spider [...] to monitor or copy any content"
  (https://www.google.com/intl/en_us/terms_google_news.html, seção 2). Decisão do Pedro
  em aberto no PR.
- **Job diário** (`jobs/pesquisar_fiis.py`, `insights-fii.yml`, 21h30): guarda os
  documentos novos com o texto extraído (PDF por pypdf, XML estruturado como
  "Campo: valor") em `fii_documents`; se mudou o conjunto dos últimos 90 dias, pede à
  Workers AI (mesmo modelo do app, API REST) um JSON com resumo, até 3 ações e eventos
  datados, gravado em `fii_insights`.
- **Sem dado inventado:** evento só entra se a data estiver escrita no documento que a
  IA citou; resposta sem resumo é descartada e o resumo anterior fica. O card linka cada
  documento original.
- Tabelas de mercado sem `user_id`, como `fii_reports`; a tela filtra pelos tickers da
  carteira de quem pede (RLS em `assets`).

## Consequências

- O token `CLOUDFLARE_API_TOKEN` do GitHub precisa da permissão "Workers AI: Read". Sem
  ela, o job guarda os documentos e o card mostra a lista sem resumo.
- Custo: um resumo por fundo só quando chega documento novo, dentro da cota grátis da
  Workers AI.
- Ticker sem informe da CVM (sem CNPJ) fica sem notícias até o informe chegar.
