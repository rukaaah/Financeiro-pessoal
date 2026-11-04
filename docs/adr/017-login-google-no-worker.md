# ADR-017 — Login Google por OIDC no Worker, com sessão em cookie assinado

- **Status:** Proposto (Portão 3 do replanejamento v3)
- **Data:** 2026-11-04
- **Substitui, se aceito:** o mecanismo `st.login` do [ADR-003](003-login-google-app-users.md).
  A regra do ADR-003 **não muda**: e-mail verificado e ativo em `app_users` → modo real;
  qualquer outro → demo.

## Decisão

- O Worker faz o fluxo de código do OIDC com o Google (com PKCE e `state`), valida o
  `id_token` (assinatura pelas chaves públicas do Google, `aud`, `iss`, expiração) e
  exige `email_verified = true`.
- Com o e-mail, consulta `app_users` pela função já existente, como papel `app`. Ativo
  → sessão do usuário; senão → sessão do usuário demo.
- A sessão é um cookie `HttpOnly`, `Secure`, `SameSite=Lax`, assinado com HMAC
  (`SESSION_SECRET`), com o id do usuário e a validade. Sem cookie → demo.
- Revogar acesso continua sendo `active = false`; a sessão é revalidada contra
  `app_users` a cada 10 minutos.

## Consequências

O teste de segurança obrigatório (conta fora da allowlist cai no demo e não vê dado
real) passa a ser automatizado contra o Worker, com `id_token` falso assinado por uma
chave de teste.

## Passo a passo para o Pedro (quando aprovado)

1. Em console.cloud.google.com → **Credenciais** → o OAuth client já existente →
   **URIs de redirecionamento**: acrescentar `https://<nome>.workers.dev/auth/callback`.
2. No GitHub, secrets `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` (os mesmos valores do
   secrets do Streamlit). `SESSION_SECRET` é gerado pelo workflow na primeira vez; não
   precisa ser digitado.
3. Conferir: entrar com a sua conta tira a tarja; entrar com outra conta mantém a
   tarja.
