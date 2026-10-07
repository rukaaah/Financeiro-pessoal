# ADR-002 — Hospedagem no Streamlit Community Cloud com jobs no GitHub Actions

- **Status:** Aceito
- **Data:** 2026-10-07

## Contexto

O app precisa estar no ar, acessível de qualquer lugar, a **custo zero** — restrição
dura do projeto, não preferência. Além do app, há três tarefas periódicas:

- cotações de ativos, diária;
- proventos de FII, mensal;
- reset dos dados do modo demo, noturno.

Como é portfólio em repositório público, o app precisa abrir para qualquer visitante
sem expor dado financeiro real.

## Decisão

**App:** Streamlit Community Cloud, conectado ao repositório público. Deploy por push
na `main`. Segredos em `.streamlit/secrets.toml` pelo painel do Community Cloud,
nunca no repositório.

**Jobs:** GitHub Actions com `schedule` (cron). Três workflows separados — cotações,
proventos, reset do demo — cada um conectando ao Postgres com o papel `jobs`, que só
enxerga as tabelas de que precisa (ADR-004).

**Monitoramento:** ping externo (UptimeRobot, plano gratuito) contra a URL do app,
para que o container não fique indefinidamente hibernado e para avisar de queda.

O app é público; a proteção dos dados é por **login + allowlist** (ADR-003) e **RLS**
no banco (ADR-004). Visitante sem conta cai no modo demo, com dados fictícios.

## Consequências

**A favor:**

- Custo zero real, sem cartão de crédito e sem período de teste que expira.
- Deploy é `git push`. Não há Dockerfile, nem servidor, nem pipeline de release.
- Os jobs ficam versionados junto com o código, com log e re-execução manual pela
  interface do GitHub.

**Contra:**

- O container hiberna quando ocioso. A primeira visita depois da hibernação é lenta,
  somada ao tempo de acordar do próprio Neon — a T9 mede esses dois tempos antes de
  considerarmos a combinação aceitável.
- O `schedule` do GitHub Actions não é pontual: atrasa em horário de pico e é
  desativado automaticamente após 60 dias sem atividade no repositório. Os jobs
  precisam ser idempotentes e tolerar execução fora de hora.
- Recursos fixos e não ajustáveis (CPU, memória, versão de Python do runtime).
- O código-fonte é público por construção. Nenhuma regra de segurança pode depender
  de alguém não ler o repositório.

## Alternativas consideradas

- **Fly.io / Render free tier.** Mais controle e sem hibernação agressiva. Recusados:
  ambos pedem cartão ou degradaram o plano gratuito, e nenhum ganho justifica o risco
  de custo.
- **VPS barata.** Controle total. Recusada: custo recorrente e trabalho de
  administração (TLS, atualizações, backup) que não é o ponto deste projeto.
- **`pg_cron` no Neon para os jobs.** Mantém tudo no banco. Recusado: o scraping de
  cotações e proventos é código Python com dependências de rede, que não roda dentro
  do Postgres.
- **Vercel / Cloudflare Workers.** Recusados: Streamlit precisa de processo Python
  de longa duração com WebSocket; não encaixa em runtime serverless.
