# ADR-003 — Login Google via `st.login` com allowlist em `app_users`

- **Status:** Aceito
- **Data:** 2026-10-07

## Contexto

O app fica numa URL pública (ADR-002) e dois públicos chegam nela:

- **o dono**, que precisa ver e editar os próprios dados financeiros reais;
- **qualquer visitante** (recrutador, colega, curioso), que precisa entender o que o
  sistema faz sem nunca ver um número real.

Precisamos de autenticação a custo zero, sem armazenar senha, sem rodar servidor de
identidade e sem construir cadastro, recuperação de senha e verificação de e-mail.

## Decisão

**Autenticação:** `st.login` do Streamlit (OIDC) com o Google como provedor. O
Streamlit cuida do fluxo OAuth; nós recebemos as claims já validadas. `client_id`,
`client_secret` e `cookie_secret` vão nos secrets do Community Cloud.

**Autorização:** tabela `app_users` (`id`, `email`, `display_name`, `is_demo`,
`active`) é a allowlist. Depois do login:

1. Exigir `email_verified = true` nas claims. Sem isso, não se confia no e-mail.
2. Procurar esse e-mail em `app_users` com `active = true`.
3. **Achou** → sessão real, `app.user_id` = o `id` dessa linha.
   **Não achou** (ou não logou) → **modo demo**: `app.user_id` = o usuário demo, com
   dados fictícios e uma faixa visível "Dados fictícios" no topo de toda página.

A decisão dono/demo acontece **uma vez, na borda**, e resulta só num `user_id`. Da
camada `application` para dentro ninguém sabe se a sessão é real ou demo — é apenas
um `user_id` diferente, e o isolamento é o mesmo mecanismo de RLS do ADR-004.

O `user_id` vive em `st.session_state`, nunca em variável de módulo: o pool de
conexões é compartilhado entre sessões (`st.cache_resource`), mas o usuário não.

## Consequências

**A favor:**

- Nenhuma senha armazenada, nenhum fluxo de recuperação para escrever e manter.
- Negar acesso é `UPDATE app_users SET active = false`, sem deploy.
- O modo demo não é um caminho de código paralelo, é outro `user_id` — então o mesmo
  teste de isolamento do CI (T5) cobre o demo de graça, e um bug de vazamento
  apareceria igual nos dois.
- Admitir uma segunda pessoa de verdade é inserir uma linha.

**Contra:**

- Dependência do Google: quem não tem conta Google não entra como usuário real.
  Aceitável, já que hoje o único usuário real é o dono.
- Exige um OAuth client configurado no Google Cloud, com os redirect URIs de
  desenvolvimento **e** de produção (T8).
- `st.login` é funcionalidade relativamente nova do Streamlit; mudanças de API podem
  exigir ajuste. O impacto fica contido no módulo `identity`.
- Uma falha em "cair no demo" vira exposição de dado real. Por isso a T9 testa
  explicitamente uma conta Google fora da allowlist e confirma que ela cai no demo.

## Alternativas consideradas

- **Senha única em `st.secrets`.** Trivial de implementar. Recusada: segredo
  compartilhado, sem identidade, sem como revogar parcialmente, e nada natural para
  um segundo usuário.
- **`streamlit-authenticator` com hash local.** Recusada: coloca-nos no negócio de
  guardar senha, num repositório público, sem necessidade.
- **Neon Auth / Supabase Auth.** Mais completos. Recusados: trazem um serviço e um
  modelo de usuário a mais para gerenciar, quando `st.login` + uma tabela já resolve.
- **Allowlist de e-mails em `secrets.toml`.** Recusada: `app_users` precisa existir de
  qualquer forma, para ser o alvo das FKs de `user_id` em todas as tabelas.
