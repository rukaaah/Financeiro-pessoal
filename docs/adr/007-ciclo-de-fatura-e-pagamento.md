# ADR-007 — O ciclo da fatura é definido pelo dia em que ela começa, e pagamento não é compra

- **Status:** Aceito
- **Data:** 2026-10-07
- **Refina:** [ADR-005](005-orcamento-pelo-mes-da-fatura.md)

## Contexto

A migration 002 implementou o ADR-005 com uma coluna `closing_day` e tratou toda
linha numa conta de cartão com a mesma regra. Ao montar os dados do modo demo,
dois problemas apareceram.

**1. "Fecha dia X" é ambíguo.** Descrevendo os cartões reais:

| Cartão | Como o dono descreve | Ciclo real | Vencimento |
|---|---|---|---|
| Unicred | "fecha dia 04, vence dia 11" | 04/09 → 03/10 | 11/10 |
| Nubank | "fecha dia 27, vence dia 5" | 28/09 → 27/10 | 05/11 |

No Unicred, o **04** é o primeiro dia do ciclo novo. No Nubank, o **27** é o
último dia do ciclo velho. A mesma palavra, dois significados, com um mês de
diferença no orçamento conforme a leitura. Uma coluna chamada `closing_day` não
diz qual das duas vale, e a compra feita exatamente no dia do fechamento cai na
fatura errada metade das vezes.

**2. O pagamento da fatura recebia `invoice_month` de compra.** O pagamento é
uma perna de transferência na conta do cartão, e o trigger aplicava a ele a
regra de compra. Um pagamento feito em 30/08 — que quita a fatura de agosto —
era marcado como fatura de setembro. Além do mês errado, somar um
`invoice_month` passava a misturar compras com pagamento: no demo, uma fatura
aparecia com total **positivo**.

Os testes da migration 002 não pegaram nada disso porque só inseriam despesas
no cartão: nenhum exercitava uma perna de transferência numa conta de cartão,
que é exatamente o pagamento.

## Decisão

**1. A coluna passa a ser `cycle_start_day`: o dia em que a fatura nova começa
a acumular.** O nome responde à pergunta que `closing_day` deixava aberta. Para
os cartões acima, cadastra-se `4` no Unicred e `28` no Nubank.

A regra fica, então:

- a compra pertence ao ciclo que **começou** no último `cycle_start_day` que
  não é posterior a ela;
- esse ciclo termina no dia `cycle_start_day - 1` do mês seguinte;
- a fatura vence no `due_day`, no mês em que o ciclo terminou se
  `due_day >= cycle_start_day`, e no mês seguinte caso contrário.

O último item é o que distingue os dois cartões: no Unicred, `11 >= 4`, então
vence no mesmo mês em que o ciclo fecha; no Nubank, `5 < 28`, então vence no mês
seguinte.

**2. Pagamento de fatura não recebe `invoice_month`.** Só receita e despesa
numa conta de cartão têm mês de fatura. Perna de transferência fica `NULL`.

A justificativa é a própria frase do ADR-005: "a **despesa** entra no orçamento
do mês de vencimento da fatura". O pagamento não é despesa — é a transferência
que move o dinheiro da conta corrente para o cartão. Contá-lo na fatura seria
contar o mesmo gasto duas vezes, que é precisamente o que o ADR-005 já dizia
sobre pagamento de fatura.

Isso casa com o modelo mental do dono, herdado da planilha: **o cartão é uma aba
à parte**. As compras vivem na aba do cartão, agrupadas por fatura; o dinheiro só
aparece no lado do débito quando a fatura é paga.

## Consequências

**A favor:**

- `sum(amount) WHERE invoice_month = X` passa a ser exatamente o total de
  compras daquela fatura. Antes era um número sem significado.
- O saldo do cartão continua sendo `sum(amount)` de tudo, inclusive pagamentos:
  as duas perguntas têm respostas diferentes e agora ambas são obtíveis.
- Um nome de coluna que não se pode ler errado. A compra feita exatamente no dia
  de virada tem destino definido, e há teste para ela nos dois cartões.
- Pagar com atraso continua funcionando sem caso especial: o pagamento é uma
  transferência com a data que tiver, e não interfere no agrupamento das compras.

**Contra:**

- `cycle_start_day` não é o número que o banco imprime na fatura. Quem lê "fecha
  dia 27" no app do Nubank precisa cadastrar 28. A interface (T8 em diante) deve
  perguntar "a partir de que dia começa uma nova fatura?", e não "qual o dia de
  fechamento".
- Saber se uma fatura foi paga, e quanto ainda falta, deixa de ser uma leitura
  direta de `invoice_month` e passa a exigir casar as compras do ciclo com os
  pagamentos feitos. É trabalho da Fase 1, e o modelo tem os dados para isso.
- Renomear coluna de migration já aplicada exige migration nova. Barato agora,
  sem dado real; seria caro depois.

## Alternativas consideradas

- **Manter `closing_day` e documentar o significado.** Mais barato. Recusada:
  a ambiguidade já custou uma rodada de confusão com o dono do sistema, que
  descreveu os próprios cartões por duas convenções diferentes na mesma frase.
  Comentário em migration não aparece na tela de cadastro.
- **Guardar o último dia do ciclo em vez do primeiro.** Igualmente preciso.
  Recusada por um motivo pequeno e prático: o dono descreveu espontaneamente os
  dois cartões pelo dia de início ("gasto do dia 04/09", "após o dia 28/09").
- **Dar ao pagamento uma regra própria de `invoice_month`,** apontando a fatura
  que ele quita. Recusada por ora: exigiria distinguir pagamento de outras
  transferências na conta do cartão (estorno, por exemplo), e a pergunta que ela
  responderia — "esta fatura foi paga?" — é da Fase 1, quando haverá contexto
  para desenhá-la direito.
