# ADR-018 — IA no Cloudflare Workers AI, chamada pelo binding do Worker

- **Status:** Aceito (Portão 3 do replanejamento v3, aprovado pelo Pedro em 2026-11-04)
- **Data:** 2026-11-04
- **Detalhes:** `docs/v3/04-ia.md` e `prompts/ia/`.

## Decisão

- Provedor: **Cloudflare Workers AI**, o único com plano gratuito confirmado em fonte
  (10.000 neurons/dia) **e** compromisso de não treinar nem guardar o conteúdo.
- Chamada pelo binding `env.AI` do Worker. Não há chave de IA separada: o acesso vem da
  conta, e a credencial que existe é o `CLOUDFLARE_API_TOKEN`, guardado como secret do
  GitHub e usado só no deploy.
- Se um dia o provedor mudar (Groq é o plano B), a chave vira o secret `AI_API_KEY` do
  GitHub e chega ao Worker pelo `secrets:` do `cloudflare/wrangler-action` no deploy,
  que roda `wrangler secret put`
  ([wrangler-action](https://github.com/cloudflare/wrangler-action)).
- **Modo demonstração nunca chama a IA**: a rota `/api/chat` devolve as respostas fixas
  quando a sessão é demo, antes de tocar no binding. Teste automatizado.
- Sem binding configurado (ambiente local sem conta), a IA fica desligada e as telas
  dizem "IA desligada".
- Contagem diária por usuário; perto do limite gratuito, "limite de hoje atingido".

## Alternativas consideradas

Gemini gratuito (usa o conteúdo para melhorar produtos); Groq (limites do Free não
confirmados); GitHub Models (encerrado em 30/07/2026).
