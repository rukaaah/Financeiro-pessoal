# ADR-015 — PWA com API num Cloudflare Worker, no lugar do Streamlit

- **Status:** Aceito (Portão 3 do replanejamento v3, aprovado pelo Pedro em 2026-11-04)
- **Data:** 2026-11-04
- **Substitui:** a hospedagem do app no [ADR-002](002-hospedagem-community-cloud.md)
  (os jobs no GitHub Actions continuam), o [ADR-009](009-aceitar-a-hibernacao-do-app.md)
  e as decisões de navegação do [ADR-011](011-arquitetura-da-interface.md) (1, 3 e o
  adendo da barra própria). Detalhes e medições em `docs/v3/07-arquitetura.md`.

## Contexto

O requisito principal do v3 é não ter atraso no celular: primeira tela em até 1,5 s,
troca de tela em até 300 ms, feedback de toque em até 200 ms e nunca tela branca.
Medido no app publicado, com páginas vazias: primeira tela de 2,3 a 2,7 s, troca de
211 a 278 ms, e a tela de sono do Streamlit no cold start. No Streamlit toda
interação é uma ida ao servidor, que daqui leva ~157 ms só de conexão. O design
aprovado no Portão 2 (barra inferior, folhas, Desfazer, atalho de lançamento) também
exige controle do cliente que o Streamlit não dá.

## Decisão

1. A interface vira uma **PWA** em TypeScript com Preact, construída com Vite. A casca
   fica no celular pelo service worker; tudo o que é toque, troca de aba e abertura de
   folha acontece no navegador.
2. Uma **API num Cloudflare Worker** (TypeScript, Hono) serve a PWA e os dados, com uma
   rota por tela que devolve JSON já agregado. Smart Placement põe o Worker perto do
   banco.
3. O banco, as migrations, o RLS e os jobs **não mudam**.
4. Plano gratuito da Cloudflare. Custo: R$ 0.

## Consequências

**A favor:** o toque responde sem rede; a primeira tela desenha do cache; o cold start
mostra o esqueleto do app, não uma tela de terceiro; deploy por GitHub Actions com os
secrets do GitHub (o que o requisito 4 pede).

**Contra:** a UI é reescrita; entra uma conta de terceiro (Cloudflare); o limite de
10 ms de CPU por pedido no Free obriga a manter o Worker magro (agregação no SQL, não
no JS); `set_config` dentro do `transaction()` do driver do Neon precisa ser provado
(fatia 0).

**Critério de reversão:** se a fatia 0 não atingir p50 ≤ 300 ms em `/api/mes` no 4G e o
teste de isolamento pelo Worker, este ADR é rejeitado antes de qualquer tela.

## Alternativas consideradas

Manter e otimizar o Streamlit; FastAPI no Render Free (hiberna em 15 min e leva cerca
de um minuto para voltar); Python Workers (status e suporte a `psycopg` não
confirmados); Supabase no lugar do Neon. Ver `docs/v3/07-arquitetura.md`.

## Passo a passo para o Pedro (quando aprovado)

1. Em dash.cloudflare.com, criar a conta gratuita (e-mail e senha seus; **não** colar a
   senha no chat).
2. **My Profile → API Tokens → Create Token → modelo "Edit Cloudflare Workers"**. Copiar
   o token uma vez.
3. No GitHub, **Settings → Secrets and variables → Actions → New repository secret**:
   `CLOUDFLARE_API_TOKEN` (o token), `CLOUDFLARE_ACCOUNT_ID` (aparece na barra lateral
   do painel da Cloudflare).
4. Conferir: a aba **Actions** do repositório mostra o workflow de deploy verde, e o
   endereço `*.workers.dev` abre o app em modo demonstração.
5. Não colar no chat: token, senha, nem a URL de conexão do banco.
