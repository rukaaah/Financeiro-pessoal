# ADR-022 — Medidor diário de momento de compra de FII

Status: proposto (2026-11-11)

## Contexto

O Pedro pediu um agente que leia, todo dia, o que o app já junta (cotações, P/VP, DY,
notícias dos fundos) e o mercado, diga se é um bom dia para comprar algum FII, por quê,
com previsão e quantidade de cotas. Regras do projeto: nada de dado inventado, custo
zero, nenhuma fonte cujos termos proíbam robôs.

## Decisão

1. **Conta antes da IA.** `domain/oportunidade.py` dá a cada FII uma nota de 0 a 100,
   determinística e testada: P/VP contra o próprio último ano (35 %), desconto sobre o
   VP (25 %), DY 12m contra o próprio ano (20 %), preço contra a média de 21 pregões
   (20 %). Veredito: `grande_dia` (nota no topo de 5 % do ano, nota ≥ 65, P/VP ≤ 1,
   ≥ 120 pregões), `bom_preco` (nota ≥ 60, P/VP ≤ 1,05), `esperar`, `sem_dados`.
   Liquidez média abaixo de R$ 500 mil/dia rebaixa para `esperar`.
2. **IA só escreve e só rebaixa.** Para `grande_dia` e `bom_preco`, a Workers AI recebe
   o papel de analista sênior de FII, as métricas de referência do mercado, a ordem de
   ler tudo antes de concluir, ser brutalmente honesta e nunca concordar por concordar
   (nem com o veredito calculado). A resposta é descartada se citar número que não está
   nos fatos ou se subir o veredito; aí fica o texto montado pela conta.
3. **"Previsão" é cenário.** Preço se o P/VP voltar à mediana do ano e renda de 12 meses
   por cota. Nenhuma previsão numérica de preço sem base.
4. **Cotas na tela, não no job.** O job é dado de mercado (sem `user_id`); as cotas saem
   do aporte e das regras de cada usuário (P/VP máximo, peso máximo), em
   `cotasSugeridas()`.
5. **Fontes.** Só o que já está no banco (ADR-020, ADR-021) e a meta Selic da API de
   dados abertos do Banco Central (SGS 432). Tendência é só dos fundos acompanhados,
   não do IFIX: não há fonte oficial gratuita do IFIX com termos que permitam robô.

## Consequências

- O histórico de preço começou a ser guardado em 2026-11 (31 dias de carga inicial).
  Até ter 120 pregões (por volta de maio de 2027), o medidor não diz "um dos melhores
  dias do ano" e avisa que o histórico é curto.
- **Ponto aberto:** a página de cotações históricas da B3 diz que é "expressamente
  vedada a coleta automatizada". O job de cotações (ADR-020) baixa o COTAHIST todo dia.
  Este ADR não aumenta esse uso, mas a decisão do ADR-020 precisa ser revista.
- Workflow `oportunidade-fii.yml` (23h30, terça a sábado) precisa estar também no
  `main` para o `schedule` disparar, como os outros jobs.
