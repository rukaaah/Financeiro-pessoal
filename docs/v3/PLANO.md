# Replanejamento v3 — checklist de execução

Fonte do pedido: `docs/prompts/replanejamento-v3.md`. Branch: `replanejamento/v3`.
Marque cada item ao concluir, para que a execução possa ser retomada numa sessão nova.

## Preparação

- [x] Commit `wip:` do trabalho sem commit em `design/reestruturacao-da-interface` e push (11d8c4a)
- [x] Branch `replanejamento/v3` criada a partir dela
- [x] Skills de design conferidas: `/design-md-library`, `/design-taste-frontend` e `/web-design-guidelines` estão instaladas

## Etapas

- [x] **Etapa 1** — Diagnóstico do sistema atual → `01-diagnostico.md`
  - [x] Medição no app publicado (Fase 0, 2026-11-04)
- [x] **Etapa 2** — Produtos de referência → `02-referencias.md`
- [x] **Etapa 3** — Praticidade no Reddit → `03-ideias.md`
  - [x] Facilitações vindas da Etapa 2 e do diagnóstico
  - [x] Reddit dispensado pelo Pedro em 2026-11-04 (nenhum caminho de leitura funcionou)
- [x] 🔒 **Portão 1** — respondido em 2026-11-04 (ver `03-ideias.md`)
- [ ] **Etapa 4** — Onde a IA ajuda → `04-ia.md` + `prompts/ia/<funcionalidade>.md`
- [ ] **Etapa 5** — Representação e arquitetura de informação → `05-arquitetura-de-informacao.md`
- [ ] **Etapa 6a** — Estilo (`/design-md-library`) → `06a-estilo.md`
- [ ] **Etapa 6b** — Telas (`/design-taste-frontend`) → `06b-telas.md`
- [ ] 🔒 **Portão 2** — design aprovado
- [ ] **Etapa 7** — Arquitetura técnica → `07-arquitetura.md` + ADRs
- [ ] 🔒 **Portão 3** — stack aprovada
- [ ] **Etapa 8** — Plano de construção → `08-plano-de-construcao.md`
- [ ] **Etapa 9** — Construção, uma fatia por PR
- [ ] **Etapa 10** — Auditoria (`/web-design-guidelines`) e entrega → `10-auditoria.md`

## Pendências abertas que precisam ir a um portão

- ADR-013 (modelo recorrente de previsto) — levar ao Portão 1 como item de decisão
- RF20: nomes de urgência e prazos padrão (3 dias, 5 para fatura, 80% de orçamento)
- RF23: prints de exemplo das telas de investimento do Inter e do PicPay
