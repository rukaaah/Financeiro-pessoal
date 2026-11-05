# Handoff da v3 (2026-11-05)

Para continuar o replanejamento numa conversa nova. Fonte da verdade do plano:
[`PLANO.md`](PLANO.md).

## Estado

- Etapas 1 a 10 concluídas na branch `replanejamento/v3` (PRs 15 a 35, todos com CI verde).
- No ar em https://financeiro-pessoal.pedrolucas-cremonini.workers.dev, apontando para o
  branch `dev` do Neon (migrations 001 a 012 aplicadas lá). Cada push na
  `replanejamento/v3` publica o Worker (`deploy-v3.yml`) e roda o teste de segurança de fora.
- `main` e o branch `production` do Neon **não foram tocados**: o Streamlit antigo
  (https://personal-finance-port.streamlit.app) continua no ar.

## Pendências

1. **Ajustes no celular** pedidos pelo Pedro em 2026-11-05. O PR 35 corrigiu, mas falta o
   Pedro conferir num iPhone de verdade:
   - data estourando a largura no Lançar (campo de data do iOS: `appearance:none`, `min-width:0`);
   - laterais cortadas: `overflow-x:clip` na página, e chips e abas rolando até a borda do aparelho;
   - barra inferior alta demais no app instalado na tela de início: regra
     `@media (display-mode:standalone)` em `web/src/estilo.css` (60 px mais o indicador menos 14 px);
   - responsividade em qualquer aparelho: varrido de 320 a 430 px e 1440 px sem rolagem lateral.
     Detalhe menor visto a 320 px: o título "Já comprometido" quebra ao lado do valor no Cartão.
2. **Categorias base** (aprovadas pelo Pedro em 2026-11-05): Essenciais (Mercado, Moradia,
   Contas da casa, Transporte, Saúde, Educação), Pessoal (Restaurantes, Lazer, Assinaturas,
   Vestuário, Cuidados pessoais, Presentes), Financeiro (Tarifas bancárias) e Renda (Salário,
   Freelance). O demo usa esse conjunto (`scripts/seed_demo.py`), e uma conta real sem nenhuma
   categoria ganha o mesmo no login (`/auth/callback`) e ao abrir o app (`/api/sessao`), pelo
   `worker/src/categorias-base.ts`, como papel `app`. A lista em TypeScript fica em
   `packages/dominio/src/categorias-base.ts`; `tests/unit/test_categorias_base.py` confere que
   ela é igual à do Python. Falta o Pedro sair e entrar de novo no `dev` para ver.
3. **Troca para produção (Fatia 11)**, com o Pedro acompanhando. Pelos workflows, com
   gatilho manual na `replanejamento/v3`: `migrar-banco.yml` com `ambiente: production`
   (branch de backup no Neon pelo secret `NEON_API_KEY`, migrations e checagem de
   `BYPASSRLS`, nessa ordem; sem backup não migra), `reset-demo.yml` com
   `ambiente: production` (seed) e `deploy-v3.yml` com `ambiente: production` (Worker
   `financeiro-pessoal-producao`, secret `DATABASE_URL_APP_PRODUCTION`). Passo a passo:
   1. Snapshot ou branch de backup do `production` no Neon.
   2. Aplicar as migrations 005 a 012 em `production` com o papel `owner`
      (`yoyo apply`, a URL vem do secret `DATABASE_URL_OWNER`; rodar pelo workflow
      `migrar-banco.yml`, adaptado para `production`, ou localmente pelo Pedro).
   3. Conferir que `app` e `jobs` continuam sem `BYPASSRLS` e rodar o seed do demo em produção.
   4. Criar o secret `DATABASE_URL` de produção (papel `app`) e publicar o Worker de produção.
      Atualizar o redirect do cliente OAuth do Google para o domínio novo.
   5. Mergear `replanejamento/v3` na `main` (PR com CI verde). Só depois disso os agendamentos
      de `cotacoes.yml` e `reset-demo.yml` passam a rodar.
   6. Rodar `node scripts/teste_seguranca_v3.mjs <url de produção>` e entrar como dono.
   7. Desligar o app no Streamlit Community Cloud.
4. Do Pedro: um extrato PDF do PicPay de exemplo (só para ler localmente, nunca commitar);
   prints de investimentos com números fictícios (RF23); confirmar que o login funciona no `dev`
   (o e-mail dele precisa estar em `app_users` do branch `dev`).

## Decisões-chave e onde estão

| Decisão | Onde |
|---|---|
| PWA em Preact + Worker Hono no Cloudflare | ADR-015 |
| TypeScript na API, Python nos jobs e migrations | ADR-016 |
| Login Google no Worker, allowlist conferida a cada pedido | ADR-017 |
| IA no Workers AI, só no modo real, números conferidos | ADR-018, `docs/v3/04-ia.md` |
| Previsto padrão com vigência | ADR-019 |
| RLS por `set_config('app.user_id')` como papel `app` | ADR-004 |
| Dinheiro em `bigint` de centavos no TS, `numeric` no banco | ADR-012 |
| Estilo e telas aprovados (azul só em dado e Lançar) | `06a-estilo.md`, `06b-telas.md` |
| Auditoria de interface e versão desktop | `10-auditoria.md` |
| Medições (primeira visita ~0,84 s no 4G lento) | `medicoes.md` |

## Cuidados

- Nunca usar o papel `owner` no app: ele ignora a RLS.
- Docker não sobe no Mac do Pedro: os testes de integração rodam só no CI. Para
  regenerar `docs/schema.sql`, aplicar o diff que o CI mostra no log.
- Os testes de integração usam um usuário demo fixo criado em
  `worker/test/preparar-integracao.ts`. Não depender da ordem dos arquivos.
- Commits e PRs sem atribuição a IA. Os PRs levam só o bloco de atribuição do projeto.
