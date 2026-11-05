# Financeiro pessoal

App de finanças pessoais que substitui uma planilha de orçamento. Mostra quanto
ainda dá para gastar no mês, o que vence, a fatura do cartão, os cofrinhos, o que
os outros te devem e a carteira de investimentos.

O app é aberto: quem entra sem login cai num **modo demonstração** com dados
fictícios. Os dados reais ficam atrás do login Google e de uma allowlist, e quem
garante o isolamento é o Postgres, não a tela.

<p>
  <img src="docs/imagens/mes-celular.png" alt="Tela Mês no celular: livre para gastar, previsto, gasto e a pagar, e a lista de atenção" width="260">
  &nbsp;
  <img src="docs/imagens/mes-desktop.png" alt="Tela Mês no desktop, em duas colunas: resumo e atenção à esquerda, categorias à direita" width="560">
</p>

## O que ele faz

- **Mês**: livre para gastar até o fim do mês, por dia; previsto, gasto e a pagar
  por categoria, comparados à média de 3 meses; saldo projetado até o fim do mês.
- **Atenção**: contas que vencem, categorias perto do limite, fatura a pagar,
  freela em dólar a receber. Cada item tem a ação na mesma linha.
- **Lançar em 3 toques**: valor, categoria, salvar. Parcelado no cartão, "vou
  receber" e importação de extrato (PDF do PicPay, lido no próprio navegador).
- **Cartão**: a compra vive na fatura em que cai, e o gasto entra no orçamento do
  mês em que a fatura vence. Fechamento inclusivo e prazos com vigência.
- **Patrimônio**: contas, cofrinhos, investimentos, cartão e valores a receber de
  pessoas. Recebimento em dólar convertido pela taxa do PayPal, com o quanto ele
  ficou contra a PTAX do dia.
- **Investimentos**: posição, preço médio, onde aportar segundo as metas e regras
  de cada um, projeção de renda.
- **Perguntar**: chat sobre os próprios números. O modelo só planeja; quem consulta
  é o servidor, sob RLS, e todo número da resposta é conferido contra o resultado.
  No modo demonstração as respostas são fixas e o modelo nunca é chamado.

## Números

Medido num Chrome com o perfil "4G lento" do Lighthouse (150 ms de RTT,
1,6 Mbps, CPU 4× mais lenta), contra o app publicado ([detalhes](docs/v3/medicoes.md)):

| | Meta | Medido |
|---|---|---|
| Primeira visita até o número aparecer | ≤ 1,5 s | ~0,84 s |
| Visitas seguintes (do cache) | ≤ 1,5 s | ~0,32 s |
| Troca de tela | ≤ 300 ms | 20 ms |
| Resposta ao toque | ≤ 200 ms | 16 a 49 ms |
| API, p95 | ≤ 800 ms | 166 ms |

A versão anterior, em Streamlit, levava 2,3 a 2,7 s em banda larga para abrir, e
ainda sem número nenhum ([diagnóstico](docs/v3/01-diagnostico.md)).

## Arquitetura

```
celular / navegador
  └─ PWA (Preact + Vite, ~30 KB gzip, service worker)
       └─ Cloudflare Worker (Hono): login, API, IA
            ├─ Neon Postgres (São Paulo), papel `app`, RLS em toda tabela
            └─ Workers AI (só no modo real)
GitHub Actions: CI, deploy, migrations, cotações, reset do demo
```

- **Isolamento no banco.** Cada pedido é uma transação que começa com
  `set_config('app.user_id', …, true)`; as policies comparam `user_id` com
  `current_app_user()`. O papel do app não tem `BYPASSRLS`. Quem não está na
  allowlist, ou está com a conta desativada, cai no usuário demo
  ([ADR-004](docs/adr/004-neon-psycopg-rls.md), [ADR-017](docs/adr/017-login-google-no-worker.md)).
- **Dinheiro sem float.** `numeric(14,2)` no banco, centavos em `bigint` no
  TypeScript, `Decimal` no Python. Float só na borda que desenha um gráfico
  ([ADR-012](docs/adr/012-decimal-e-a-borda-de-renderizacao.md)).
- **Regras no domínio.** Fatura, orçamento, conversão de dólar, carteira e leitura
  de extrato são funções puras em `packages/dominio`, testadas sem banco.
- **Primeira tela rápida.** Um script de cinco linhas no `<head>` dispara os pedidos
  do Mês enquanto o JavaScript baixa; o resto dos dados vem depois.
- **Custo zero.** Planos gratuitos do Cloudflare, Neon e GitHub Actions.

As decisões e os porquês estão em [`docs/adr/`](docs/adr/); o replanejamento que
levou a esta versão, em [`docs/v3/`](docs/v3/PLANO.md).

```
packages/dominio/   regras puras (TypeScript), sem dependência
worker/             API, login e IA no Cloudflare Worker
web/                PWA: telas, estilo, service worker
migrations/         SQL puro (yoyo), cada uma com rollback
src/financeiro/     Python: cotações e o que roda nos jobs
jobs/, scripts/     tarefas agendadas, seed do demo, medições, teste de segurança
tests/              testes Python (unitários e de banco)
app/, streamlit_app.py   versão anterior em Streamlit, no ar até a troca para esta
```

## Segurança

- Repositório público: nenhum segredo, extrato ou dado real. Testes usam só dados
  sintéticos, e hooks de pre-commit barram `*.pdf`, `*.ofx` e arquivos de segredo.
- Isolamento testado como o papel de menor privilégio, nunca como dono: o CI
  popula todas as tabelas com dois usuários e confere que um não vê nada do outro,
  direto no banco e pelo Worker.
- A cada deploy, [`scripts/teste_seguranca_v3.mjs`](scripts/teste_seguranca_v3.mjs)
  testa o app publicado de fora: sem login e com cookie forjado cai no demo, o demo
  não cita o dono, não chama a IA, não mexe na allowlist, e o HTML e o JS não têm
  segredo.
- Segredos só nos GitHub Secrets e nos secrets do Worker.

## Desenvolvimento

Requer Node 22+, [uv](https://docs.astral.sh/uv/) e Docker (para os testes de banco).

```bash
npm install
npm run tipos          # TypeScript nos três pacotes
npm run teste          # domínio e Worker
npm run build          # PWA em web/dist
```

Testes de banco, contra o Postgres local:

```bash
docker compose up -d
export DATABASE_URL="postgresql+psycopg://owner:dev@localhost:5433/financeiro"
uv sync --group dev
uv run --group dev yoyo apply --database "$DATABASE_URL"
npm run teste:integracao
uv run --group dev pytest
```

Dados do modo demonstração (apaga e recria o usuário demo; idempotente):

```bash
uv run python scripts/seed_demo.py
```

## Convenções

- GitHub Flow, um PR por fatia, CI verde antes do merge.
- [Conventional Commits](https://www.conventionalcommits.org/).
- TDD no domínio; integração contra Postgres de verdade.
- Texto voltado ao usuário em português do Brasil.
