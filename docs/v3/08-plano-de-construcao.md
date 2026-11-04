# Etapa 8 — Plano de construção

Data: 2026-11-04. Stack aprovada no Portão 3 (ADRs 015 a 019). Cada fatia vai do banco
à tela, tem um PR próprio com CI verde e termina com o demo funcionando e o seed
cobrindo o que entrou. 👤 marca o que precisa do Pedro.

Regras de toda fatia: domínio com teste primeiro (Vitest); integração conectando como o
papel `app`, nunca `owner`; medição no celular emulado ("Fast 4G" do Chrome, 375 × 812)
ao fim de cada tela, registrada no PR; o seed do demo ganha os dados da fatia, com as
asserções de `06b-telas.md` ("Números que precisam concordar").

## Fatia 0 — Prova da stack

**Entrega:** um Worker (Hono) que serve uma PWA mínima (casca, barra inferior, tarja) e
uma rota `/api/saude` que abre uma transação no Neon pelo driver serverless com
`set_config('app.user_id', ..., true)` e lê uma tabela com RLS.

- Estrutura do repositório: `web/` (PWA, Vite + Preact + TypeScript), `worker/` (Hono),
  `packages/dominio/` (módulos do ADR-001 em TS), mantendo `migrations/`, `jobs/`,
  `scripts/` e `tests/` em Python.
- CI: lint e tipos de TS, Vitest, build da PWA, e os testes Python que já existem.
- Teste de isolamento chamando o Worker local com dois usuários.
- Workflow de deploy com `cloudflare/wrangler-action`.

**Aceite:** o teste de isolamento passa pelo Worker; `/api/saude` publicado com p50 ≤
300 ms e p95 ≤ 800 ms em "Fast 4G"; a casca abre do cache com a rede desligada.
**Se não passar:** parar e voltar ao Portão 3 (ADR-015, critério de reversão).

👤 Conta Cloudflare, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
`DATABASE_URL_APP` (string do papel `app` do branch `dev` primeiro).

## Fatia 1 — Login, demo e allowlist

- OIDC do Google no Worker (ADR-017), sessão em cookie, revalidação em `app_users`.
- Usuário demo com o seed reescrito: dados coerentes por regra, sem datas no futuro,
  compras dentro do ciclo (ideia 18). Reset noturno continua.
- Tarja "Dados fictícios" antes de tudo, sempre no demo.
- Migration 005 (`is_admin`, pagamento aponta a fatura) aplicada em `dev`.

**Aceite:** teste automatizado de que conta fora da allowlist e e-mail não verificado
caem no demo e não leem nenhuma linha real; demo não chama a IA.
👤 Redirect novo no OAuth client; `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

## Fatia 2 — Lançar e Lançamentos

- `ledger`: registrar (gastei, recebi, transferência), editar, excluir com desfazer
  (exclusão lógica por 5 s, depois definitiva), listar com filtros.
- Diálogo Lançar (Gastei e Recebi), com "entra na fatura que vence em…" vindo do
  banco (`invoice_month_for`).
- Tela Lançamentos com o rodapé "pela data do lançamento" (ideia 2) e exportar CSV
  (ideia 17).

**Aceite:** lançar um gasto em ≤ 3 toques além do valor; feedback do toque ≤ 200 ms;
desfazer funciona; CSV abre no LibreOffice com acentos e vírgula decimal.

## Fatia 3 — Mês

- Migration 007 (previsto com vigência, ADR-019) e 006 (natureza da categoria).
- `budgeting.posicao_do_mes(mes)`: previsto, gasto, a pagar, livre e categorias, numa
  view; **toda tela lê daqui** (ideia 1 como o Pedro reformulou).
- Tela Mês: bloco de destaque com a régua, descoberta do dia, categorias com média de
  3 meses (ideia 9), guardado e sobra, copiar resumo (RF21). Detalhe da categoria com
  12 meses e ajuste do previsto.

**Aceite:** o teste compara os números da tela com a função; `/api/mes` p50 ≤ 300 ms.

## Fatia 4 — Cartão

- `cards`: faturas por vencimento, compras da fatura, parcelas (`installment_plans`),
  comprometido, pagar fatura (ADR-010), parcial.
- Tela Cartão; Lançar → Paguei a fatura.

**Aceite:** os casos de fechamento inclusivo da Unicred (4 e 11) do teste existente
passam pela tela.

## Fatia 5 — Contas recorrentes, entradas previstas e Atenção

- Migration 008: contas recorrentes com urgência e vigência (RF20), entradas previstas
  com valor em USD, data prevista e o desconto do PayPal no recebimento (ideia 21).
- PTAX do dia pelo Banco Central (job diário, fonte oficial).
- Recorrente vira lançamento sugerido no dia (ideia 6).
- Saldo projetado dia a dia (ideia 7) e a lista Atenção com "lembrar amanhã" e
  "resolvido" gravando; alerta de cobrança duplicada e assinatura nova (ideia 14).

**Aceite:** conta recorrente paga sai de "a pagar" e entra em "gasto", nunca nos dois;
"o PayPal ficou com R$ X" bate com USD × PTAX − reais.

## Fatia 6 — Patrimônio

- `goals`: cofrinhos (guardar, resgatar com finalidade, a devolver, RF14 e RF18).
- `ledger`: a receber por pessoa (RF17), registrar recebimento, perdoar.
- Patrimônio líquido sem a receber, com as partes e a data de atualização (ideias 3, 4
  e 20); conciliação de saldo (ideia 8, migration 009).

**Aceite:** CDB aparece só em Cofrinhos; patrimônio = soma das partes exibidas.

## Fatia 7 — Investimentos

- `investments` e `market_data`: posições, preço médio, job de cotações e proventos
  (Investidor10, uso permitido; Tesouro e CDI por fontes oficiais), séries de 12 meses.
- Tela com Resumo, Carteira, Proventos e Movimentos; detalhe do ativo; Onde aportar
  (regras do Pedro) e Projeção.

**Aceite:** a série do patrimônio investido termina no valor de hoje; a distribuição do
Onde aportar soma o valor digitado.

## Fatia 8 — Entrada em lote

- Importar extrato do PicPay (RF05): o PDF é lido **no navegador** (pdf.js), nunca sai
  do celular; o Worker recebe só as linhas revisadas. Validação pelo saldo diário,
  deduplicação, regras.
- Colar notificação (ideia 11) com regra para os formatos do PicPay e da Unicred.
- Categoria sugerida por regra e histórico (ideia 13).
- Atalho de lançamento rápido na tela inicial (ideia 10, `shortcuts` do manifesto).

**Aceite:** um extrato sintético em `tests/fixtures/` importa e fecha pelo saldo.

## Fatia 9 — IA

- Migration 010 (`ai_calls`, com RLS).
- Chat por contexto (Mês, categoria, investimentos) com o plano de consultas, a
  conferência dos números e o mascaramento; leitura de notificação e categoria como
  reserva das regras (`prompts/ia/`).
- Ajustes → IA com os interruptores.

**Aceite:** um teste com 20 perguntas reais registra o acerto; demo nunca chama o
binding; número inventado pela IA é descartado.

## Fatia 10 — Ajustes, acesso e RF23

- Ajustes completo (contas, cartões, categorias e previsto, recorrentes, investimentos,
  regras); Acesso (RF19) com a função `SECURITY DEFINER` e o log.
- RF23: importar posição por print com OCR, revisão e conferência pelo total.

👤 Prints de exemplo do Inter e do PicPay, com os números trocados por fictícios.

## Fatia 11 — Corte e entrega (Etapa 10)

- Migrations em `production`; Worker de produção; README para portfólio.
- `/web-design-guidelines` sobre todas as telas e correções.
- Medição final contra a seção 4 no app publicado.
- 👤 Desligar o app no Community Cloud.
