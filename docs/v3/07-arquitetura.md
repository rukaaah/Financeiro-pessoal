# Etapa 7 — Arquitetura técnica

Data: 2026-11-04. Reavalia a stack contra as metas da seção 4 do pedido e contra o
design aprovado no Portão 2 (`06b-telas.md` e o esboço navegável). As decisões estão
nos ADRs 015 a 019, todos com status **Proposto** até o Portão 3.

## Resumo

**Recomendação: trocar a interface e a hospedagem do app; manter banco, regras e
jobs.**

| Peça | Hoje | Proposta | Muda? |
|---|---|---|---|
| Interface | Streamlit, renderizado no servidor | **PWA** (TypeScript + Preact, construída com Vite), servida como arquivos estáticos e guardada no celular | **sim** (ADR-015) |
| API | não existe (o Streamlit chama o banco) | **Cloudflare Worker** em TypeScript (Hono), uma rota por tela | **sim** (ADR-015, 016) |
| Hospedagem do app | Streamlit Community Cloud | **Cloudflare Workers**, plano gratuito, com Smart Placement | **sim** (ADR-015) |
| Login | `st.login` (OIDC do Streamlit) | OIDC do Google feito no Worker, sessão em cookie assinado; **mesma** allowlist em `app_users` | mecanismo sim, regra não (ADR-017) |
| Banco | Neon, `sa-east-1`, RLS por `SET LOCAL` | **o mesmo**, pelo driver serverless do Neon, com `set_config(..., true)` no início de cada transação | não |
| Migrations | yoyo, Python | **as mesmas** | não |
| Jobs | GitHub Actions, Python | **os mesmos** (cotações, proventos, reset do demo) | não |
| IA | — | **Cloudflare Workers AI**, pelo binding do Worker | novo (ADR-018) |
| Previsto recorrente | ADR-013 pendente | padrão por categoria com vigência, ajuste do mês como exceção | decisão (ADR-019) |

Custo mensal estimado: **R$ 0**. Nenhum serviço pago entra.

## Por que o Streamlit não fecha as metas

Medido na Etapa 1, no app publicado, com páginas **vazias** e conexão fixa:

| Meta | Medido | Por que não melhora o bastante |
|---|---|---|
| Primeira tela ≤ 1,5 s | **2,3 a 2,7 s** | O navegador baixa o cliente do Streamlit, abre o websocket e espera uma execução completa do script antes de desenhar qualquer coisa |
| Troca de tela ≤ 300 ms | **211 a 278 ms** sem nenhuma consulta | Cada troca é uma ida ao servidor nos EUA (~157 ms de conexão daqui) mais a execução da página; as consultas ao banco somam em cima |
| Toque ≤ 200 ms de feedback | abrir o Lançar: 147 a 173 ms **local**, sem rede | No Streamlit o diálogo é desenhado pelo servidor: o feedback visual depende da ida e volta |
| Cold start sem tela branca | "Your app is waking up!" do Streamlit | A tela de sono é do Community Cloud; o app não controla o que aparece |

O Streamlit tem `st.fragment`, que reexecuta só um trecho, mas a interação continua
indo ao servidor: os widgets do fragmento são "immediately processed by your app's
Python backend and your fragment code is rerun"
([Streamlit, fragments](https://docs.streamlit.io/develop/concepts/architecture/fragments)).
Reduz o trabalho de cada execução; não remove a viagem.

O design aprovado também pede o que o Streamlit faz mal: barra inferior fixa, folhas
que sobem de baixo, aviso com Desfazer, atalho na tela inicial do celular. Na v2 cada
um desses virou CSS sobre `data-testid` internos (adendo do ADR-011), que quebram
quando o Streamlit muda.

## A arquitetura proposta

```
Celular (PWA instalada)
  casca do app guardada pelo service worker → desenha na hora, mesmo com o servidor dormindo
  toque → resposta visual local (CSS/JS), sem esperar a rede
        │  HTTPS, uma chamada por tela (JSON agregado)
        ▼
Cloudflare Worker (TypeScript, Hono) ─ Smart Placement perto do banco
  /auth/*     login Google (OIDC), cookie de sessão assinado
  /api/mes    posicao_do_mes, atenção, projeção, categorias, guardado
  /api/...    lançamentos, cartão, patrimônio, investimentos, ajustes
  /api/chat   Workers AI (binding), só no modo real
        │  driver serverless do Neon: 1 transação por pedido,
        │  1ª instrução: set_config('app.user_id', <id>, true)
        ▼
Neon Postgres (sa-east-1)   papéis owner / app / jobs, RLS, triggers, views — sem mudança
        ▲
GitHub Actions (Python): migrations (yoyo), cotações, proventos, reset do demo, testes de RLS
```

### Limites do plano gratuito, com fonte

| Serviço | Limite | Uso esperado | Fonte |
|---|---|---|---|
| Workers Free | 100.000 pedidos/dia; **10 ms de CPU** por pedido; 50 subpedidos; 128 MB | Uma pessoa: centenas de pedidos/dia. Os 10 ms são de CPU, não de espera pela rede; montar um JSON agregado cabe, mas é o limite a vigiar | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Smart Placement | "available on all Workers plans"; reduz a latência entre o Worker e o backend | Coloca o Worker perto do Neon em São Paulo | [Placement](https://developers.cloudflare.com/workers/configuration/placement/) |
| Pages (alternativa para os estáticos) | 500 builds/mês; 20.000 arquivos; Functions contam na cota do Workers | Só se os estáticos não forem servidos pelo próprio Worker | [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) |
| Neon Free | compute suspende após 5 min, fixo no Free; acorda em ~0,4 s (medido) | Igual a hoje | [Neon, scale to zero](https://neon.com/docs/introduction/scale-to-zero), `docs/validacoes.md` |
| Workers AI | 10.000 neurons/dia grátis | Chat e leituras, poucas dezenas por dia | [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) |

### Como o RLS continua igual

O driver serverless do Neon funciona em edge runtimes como o Workers e oferece
`transaction()`, que roda várias consultas "within a single, non-interactive
transaction"; conexões por WebSocket "can't outlive a single request"
([Neon, serverless driver](https://neon.com/docs/serverless/serverless-driver)).
Cada pedido abre **uma** transação cuja primeira instrução é
`select set_config('app.user_id', $1, true)` (o `true` faz valer só na transação, como
o `SET LOCAL` de hoje), seguida das consultas da tela. O papel continua sendo `app`,
sem `BYPASSRLS`. A página do Neon não documenta `set_config` dentro do `transaction()`,
então isso é **a primeira coisa a provar** na fatia 0, com o teste de isolamento entre
dois usuários rodando pelo próprio Worker.

### Metas, e como cada uma passa a ser atingida

| Meta | Como | Ainda não medido |
|---|---|---|
| Primeira tela ≤ 1,5 s | A casca vem do cache do service worker: desenho imediato com o esqueleto da tela; os números chegam de uma chamada só | Tempo da chamada `/api/mes` no 4G |
| Troca ≤ 300 ms | A troca de tela é local; o dado da tela seguinte é pedido em paralelo e, se já foi carregado, aparece na hora | Idem, por tela |
| Toque ≤ 200 ms | Abrir folha, trocar intenção, filtrar e alternar abas acontecem no navegador. Salvar mostra "Salvando…" no toque e o aviso com Desfazer quando volta | Tempo de gravação de um lançamento |
| Cold start | Nunca tela branca: a casca está no celular. Se o banco estiver suspenso, o esqueleto aparece e "Acordando o banco…" depois de 1 s | Tempo real do Worker + Neon acordando |

**Critério de saída da fatia 0:** `/api/mes` com p50 ≤ 300 ms e p95 ≤ 800 ms medidos
num celular em 4G (ou emulado com o perfil "Fast 4G" do Chrome), banco acordado; e o
teste de isolamento passando pelo Worker. Se falhar, volta-se para a alternativa C
abaixo antes de construir qualquer tela.

## Alternativas consideradas

| | Alternativa | Por que não |
|---|---|---|
| A | **Manter o Streamlit** e otimizar (cache, `st.fragment`, uma consulta por tela) | Melhora a troca de tela, mas o toque e a primeira tela dependem do servidor nos EUA. Não fecha 200 ms nem 1,5 s, e a tela de sono continua |
| B | **API em Python (FastAPI) no Render Free** + PWA | O Render Free "spins down" após 15 min sem tráfego e leva "about one minute" para voltar ([Render, free](https://render.com/docs/free)): pior que o Streamlit no cold start |
| C | **PWA + API em Python em outro provedor gratuito sem hibernação** | Não encontrei, em fonte lida, um provedor gratuito para Python sem hibernação. **Não confirmado** para Fly.io, Vercel e Koyeb (não consultados) |
| D | **Python Workers** na Cloudflare (manter a linguagem) | A página da Cloudflare não diz se é beta ou estável, nem se `psycopg` roda lá ([Python Workers](https://developers.cloudflare.com/workers/languages/python/)). Não confirmado; não dá para basear a stack nisso |
| E | **Supabase** no lugar do Neon | Troca o que já está em produção e testado (RLS, triggers, papéis) sem ganho de latência medido. O banco não é o gargalo (0,4 s ao acordar) |

## O que isso custa

- **Troca de linguagem na camada de aplicação.** O pouco que existe em Python de
  domínio (`identity`, 459 linhas com `shared`) é reescrito em TypeScript. As regras
  críticas já moram no Postgres (soma zero, mês da fatura, RLS) e não mudam. Python
  continua nos jobs, nas migrations e nos testes de banco (ADR-016).
- **`app/` (Streamlit, ~6.200 linhas) deixa de ser o produto.** Fica no histórico; a UI
  nova é escrita a partir do esboço navegável, que já é HTML e JS com os mesmos dados.
- **Mais uma conta de terceiro**: Cloudflare, gratuita. O Pedro cria (passo a passo no
  ADR-015).
- **O Community Cloud sai** quando a v3 tiver o demo e o login funcionando no ar; o app
  antigo fica até lá, para nada ficar sem endereço.

## Plano de migração

1. **Banco**: nada muda de lugar. Aplicar 005 e 006 em `dev` e depois em `production`
   (já escritas). Novas migrations, na ordem das fatias: 007 previsto recorrente
   (ADR-019), 008 contas recorrentes e entradas previstas (com USD e desconto do
   PayPal), 009 conciliação, 010 registro de chamadas à IA.
2. **Papéis**: o Worker usa o papel `app` (a string de conexão vira secret do Worker);
   os jobs continuam com `jobs`; migrations com `owner`, só no CI.
3. **Testes**: os testes de RLS em Python continuam no CI contra o Postgres do Docker. Na
   fatia 0 entra um teste de isolamento que chama o Worker local (`wrangler dev`) com
   dois usuários.
4. **Corte**: quando a v3 tiver Mês, Lançar, demo e login, o domínio do Worker passa a
   ser o endereço do app, o README aponta para ele e o app do Community Cloud é
   desligado pelo Pedro.

## O que precisa do Pedro (passo a passo no ADR-015 e no ADR-018)

- Criar a conta gratuita da Cloudflare e um token de API com permissão só de Workers.
- Cadastrar no GitHub os secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  `DATABASE_URL_APP`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `SESSION_SECRET` (gerado por ele com `openssl rand -base64 48`).
- Acrescentar o endereço novo nos redirecionamentos do OAuth client do Google.
