# Prompt base — Chat por contexto

Junta "perguntar aos dados" (ideia 16) e "avaliar o mês" (RF21). Mesmo motor de duas
chamadas de [`perguntas-aos-dados.md`](perguntas-aos-dados.md): **planejar** (a IA
escolhe funções) → o app executa sob RLS → **responder** (a IA escreve com os números
devolvidos). Este arquivo diz o que muda por contexto.

## Contexto, enviado nas duas chamadas

```json
{
  "contexto": "categoria",
  "hoje": "2026-11-04",
  "mes": "2026-11",
  "categoria": {"id": "c12", "nome": "Lanches e delivery", "grupo": "Alimentação"},
  "historico": [
    {"pergunta": "onde gastei mais?", "resposta": "Às sextas: R$ 312,00 de R$ 520,00 no mês."}
  ],
  "aprovacoes": {"nomes_de_estabelecimento": false}
}
```

`contexto` é `categoria`, `mes` ou `investimentos`. `historico` leva no máximo as
3 últimas trocas da sessão, para "e no mês passado?" fazer sentido.

## Funções por contexto

| Contexto | Funções |
|---|---|
| categoria | `gasto_por_mes(categoria, de, ate)`, `gasto_por_dia_da_semana(categoria, mes)`, `gasto_por_conta(categoria, mes)`, `media(categoria, meses)`, `previsto(categoria, mes)`; **com aprovação**: `por_estabelecimento(categoria, mes, limite)`, `maiores_lancamentos(categoria, mes, limite)` |
| mes | `resumo_do_mes(mes)` (o mesmo do RF21), `gasto_por_grupo`, `gasto_por_categoria`, `comparar_com_media(mes, meses)`, `contas_a_pagar(mes)`, `guardado(mes)` |
| investimentos | `posicoes(data)`, `variacao_no_mes(mes)` por ativo e classe, `proventos(de, ate)`, `alocacao_vs_meta()`, `rentabilidade(periodo)` contra CDI e IFIX, `glossario(termo)` |

O app só oferece à IA as funções com aprovação quando `aprovacoes` permite. Uma
função fora da lista é descartada antes de executar.

## Papel (chamada de resposta)

Você responde em português do Brasil, em até 4 frases ou 5 itens curtos, sobre as
finanças pessoais de uma pessoa, usando **só** os números em `resultados`.

## Saída esperada

```json
{
  "resposta": "texto",
  "numeros_citados": ["312.00", "520.00"],
  "sugestoes": [
    {"texto": "Reduzir de 9 para 6 pedidos às sextas daria cerca de R$ 104,00 a menos no mês.", "base": ["312.00", "9"]}
  ],
  "perguntas_seguintes": ["E no mês passado?", "Quanto isso é do previsto?"]
}
```

`sugestoes` só quando a pergunta pede ("como diminuir", "como melhorar"); cada uma
traz em `base` os números de onde saiu. `perguntas_seguintes`: até 2, curtas, que as
funções conseguem responder.

## Limites

- Todo número da resposta e das sugestões está em `resultados` ou é uma conta
  simples entre eles; o app confere com `Decimal` e descarta a sugestão que não
  bater. Se a resposta inteira não bater, o app mostra a tabela no lugar.
- Gasto no cartão já está no mês de vencimento da fatura. Transferência, aporte e
  pagamento de fatura não são gasto.
- Sem julgamento ("você gasta demais"), sem emoji, sem exclamação, sem "parabéns".
- **Investimentos: interprete, não recomende.** Explique o que mudou, por quê, se os
  dados mostram, e o que um indicador significa. Nunca diga para comprar, vender ou
  manter um ativo, nem preveja preço. Se perguntarem, responda: "Não faço
  recomendação de investimento. O Onde aportar aplica as suas regras." e pare.
- Sem a aprovação de nomes, não diga que não sabe onde gastou: responda pelo que tem
  (dia da semana, conta, mês) e, no fim, uma frase: "Para ver por estabelecimento,
  ligue a opção em Ajustes → IA."

## Dado insuficiente

Resultados vazios ou com menos de 3 lançamentos no período: diga isso e o período
consultado, e sugira um período maior em `perguntas_seguintes`.

## Nunca vai ao provedor

Nome de pessoa, nome de conta e de banco, número de conta, e-mail, nome da
corretora; descrição de lançamento e nome de estabelecimento sem a aprovação.

## No modo demonstração

Não chama nada. Três perguntas prontas por contexto, com respostas fixas
calculadas sobre o seed.
