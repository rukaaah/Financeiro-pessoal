# Deploy no Streamlit Community Cloud

O que está no código já funciona; o que falta são passos em painéis externos,
que não dá para automatizar e nem versionar. Esta lista é para ser seguida uma
vez, na ordem.

## 1. OAuth client no Google Cloud

1. Em console.cloud.google.com, crie (ou reutilize) um projeto.
2. **APIs e serviços → Tela de permissão OAuth**: tipo **Externo**, nome do app
   e e-mail de contato. Pode ficar em "Teste"; não precisa de verificação,
   porque os escopos são apenas `openid`, `email` e `profile`.
3. **Credenciais → Criar credenciais → ID do cliente OAuth**, tipo
   **Aplicativo da Web**. Em *URIs de redirecionamento autorizados*, registre
   os **dois** endereços:

   ```
   http://localhost:8501/oauth2callback
   https://<seu-app>.streamlit.app/oauth2callback
   ```

   O de produção só existe depois do passo 2, então volte aqui para
   acrescentá-lo. Faltando ele, o login funciona local e quebra em produção —
   com uma mensagem do Google que não explica a causa.

4. Guarde o **Client ID** e o **Client secret**. Eles não entram no
   repositório, em nenhuma circunstância.

## 2. Deploy do app

1. Em share.streamlit.io, **Create app → Deploy a public app from GitHub**.
2. Repositório `rukaaah/Financeiro-pessoal`, branch `main`, arquivo principal
   `streamlit_app.py`.
3. Em **Advanced settings**, escolha Python **3.12** — a mesma versão que o
   `pyproject.toml` fixa.
4. Deploy. A URL que sair é o `<seu-app>.streamlit.app` do passo anterior.

O Community Cloud instala a partir do `pyproject.toml`; não é preciso
`requirements.txt`.

## 3. Secrets de produção

No painel do app, **Settings → Secrets**, cole:

```toml
[database]
# Papel `app`, nunca `owner`: o app não aplica migrations (ADR-004).
url = "postgresql://app:SENHA@HOST.neon.tech/DATABASE?sslmode=require"

[auth]
redirect_uri = "https://<seu-app>.streamlit.app/oauth2callback"
cookie_secret = "<32+ bytes aleatórios>"

# Formato de **provedor nomeado**: as credenciais ficam numa subseção
# `[auth.google]`, e o app chama `st.login("google")`. O outro formato possível
# é pôr client_id, client_secret e server_metadata_url soltos em `[auth]`, e aí
# a chamada é `st.login()` sem argumento.
#
# Misturar os dois é a armadilha: um secrets.toml local no formato sem nome faz
# `st.login()` funcionar na máquina e falhar em produção, onde a configuração é
# nomeada. Há teste (tests/unit/test_coerencia_do_deploy.py) conferindo que o
# código e este arquivo não se separem.
[auth.google]
client_id = "<do passo 1>"
client_secret = "<do passo 1>"
server_metadata_url = "https://accounts.google.com/.well-known/openid-configuration"
```

Para o `cookie_secret`:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

A senha do papel `app` precisa ser definida à mão — a migration 001 cria o
papel **sem senha** de propósito, porque o repositório é público:

```sql
ALTER ROLE app PASSWORD '<senha forte>';
```

## 3b. Secrets locais

Para o login funcionar na máquina de desenvolvimento, o
`.streamlit/secrets.toml` precisa do **mesmo formato nomeado** — com
`[auth.google]`, e não as credenciais soltas em `[auth]`. Caso contrário o
`st.login("google")` do app não encontra as credenciais localmente.

O `redirect_uri` local é `http://localhost:8501/oauth2callback`. Esse arquivo
nunca entra no Git.

## 4. Allowlist

Sem uma linha em `app_users` com o seu e-mail, **você** também cai no modo
demonstração. Rodando contra o banco de produção, com o papel `owner`:

```sql
INSERT INTO app_users (email, display_name)
VALUES ('seu-email@gmail.com', 'Seu nome');
```

O e-mail tem de estar em minúsculas (há CHECK para isso) e ser o mesmo que o
Google devolve como verificado.

## 5. Secret do reset do demo

Em **Settings → Secrets and variables → Actions** do repositório no GitHub,
crie `DATABASE_URL_OWNER` com a conexão do papel **`owner`** — o reset escreve
em `app_users`, que o papel `app` não pode alterar. Opcionalmente,
`DATABASE_URL_OWNER_DEV` apontando para o branch `dev` do Neon, para testar o
workflow sem tocar em produção.

Sem esse secret, o workflow falha de propósito, em vez de rodar contra nada.

## 6. Monitoramento

Em uptimerobot.com, crie um monitor HTTP(s) para
`https://<seu-app>.streamlit.app/_stcore/health` a cada 5 minutos. Serve para
dois fins: avisar de queda e reduzir a hibernação do container (ADR-002).

## Checklist

Estado em 2026-10-07, verificado consultando o Neon e o GitHub — não por memória:

- [x] App publicado — confirmado por ele ter chegado a erros de aplicação em produção
- [x] Secrets do banco preenchidos — a conexão funciona (o app chegou a consultar `app_users`)
- [x] Senha do papel `app` definida no Neon — o app autentica como `app`
- [x] Migrations 001 a 004 aplicadas em `production` — conferido em `_yoyo_migration`
- [x] Seu e-mail em `app_users` — 1 usuário dono ativo
- [x] Usuário demo criado — 1 demo ativo, com 38 lançamentos
- [x] `DATABASE_URL_OWNER` nos secrets do GitHub Actions — e o workflow de reset já rodou com sucesso
- [ ] **OAuth client com os dois redirect URIs** — ainda não comprovado. O
      `StreamlitMissingAuthlibError` acontecia *antes* do redirecionamento, então
      o fluxo OIDC nunca chegou a ser exercitado. Com a Authlib instalada (PR #13),
      o próximo login é o primeiro teste real disso.
- [ ] **Monitor do UptimeRobot ativo** — depende da URL do app

Os papéis `app` e `jobs` existem em produção, ambos sem `BYPASSRLS`, o que a
guarda da migration 001 confirma a cada apply.

## O que a T9 verifica depois disso

Ver [`validacoes.md`](validacoes.md), onde o primeiro item já tem resposta: o
Neon acorda em ~0,4s, dez vezes abaixo do limite. Falta:

- quanto tempo o **container do Community Cloud** leva para acordar — é ele que
  domina a primeira visita, não o banco;
- se o ping do UptimeRobot mantém o app acordado;
- se uma conta Google fora da allowlist realmente cai no demo — o teste mais
  importante, porque falhar nele significa expor dado real.
