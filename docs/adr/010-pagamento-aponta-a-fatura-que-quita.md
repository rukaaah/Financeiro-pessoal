# ADR-010 — A perna de pagamento aponta a fatura que quita

- **Status:** Aceito
- **Data:** 2026-10-08
- **Refina:** [ADR-007](007-ciclo-de-fatura-e-pagamento.md), que decidiu que
  pagamento de fatura não recebe `invoice_month` de compra. Isso continua valendo.

## Contexto

O ADR-007 resolveu um bug e deixou uma pergunta em aberto, por escrito:

> Saber se uma fatura foi paga, e quanto ainda falta, deixa de ser uma leitura
> direta de `invoice_month` e passa a exigir casar as compras do ciclo com os
> pagamentos feitos. É trabalho da Fase 1, e o modelo tem os dados para isso.

Ao desenhar a tela de Cartões (grill de 2026-10-08), a conta de "casar as compras
com os pagamentos" se mostrou impossível de fazer certo com os dados atuais.

O que existe hoje é: compras com `invoice_month` preenchido, e pernas de
transferência na conta do cartão com `invoice_month` nulo. Para dizer "a fatura
de outubro está paga", a única saída seria heurística — somar os pagamentos feitos
numa janela de datas em volta do vencimento e comparar com o total das compras.
Essa heurística erra em casos que não são exóticos:

| Caso | Por que a heurística erra |
|---|---|
| Pagamento com atraso | Um pagamento feito em 20/10 pode quitar a fatura que venceu em 11/10 ou adiantar a de 11/11. A data não diz qual |
| Pagamento parcial | Dois pagamentos de R$ 600 podem ser metade de uma fatura de R$ 1.200 ou pagamentos cheios de duas faturas de R$ 600 |
| Pagamento adiantado | Quem paga a fatura de novembro em 02/11, antes do vencimento, cai na janela de outubro |
| Estorno na conta do cartão | Também é perna de transferência, e não quita nada |

Em todos, a informação que falta é a mesma, e é uma informação que **o usuário
tem**: ele sabe qual fatura está pagando, porque é isso que o app do banco lhe
mostra na hora de pagar.

## Decisão

**A perna de pagamento guarda, numa coluna nova, o mês de vencimento da fatura
que ela quita.**

```sql
alter table transactions
  add column settles_invoice_month date;
```

Regras:

- só perna de transferência **numa conta de cartão** e **de entrada** (o lado que
  reduz a dívida) pode ter `settles_invoice_month`;
- o valor é o **primeiro dia do mês de vencimento** da fatura quitada — a mesma
  convenção de `invoice_month`, para que as duas colunas sejam comparáveis;
- `invoice_month` continua **nulo** nessa linha (ADR-007): pagamento não é compra
  e não entra no orçamento como despesa;
- a coluna é **anulável**. Pagamento sem fatura apontada é um pagamento genérico,
  e estorno é justamente isso. Exigir a referência transformaria todo crédito no
  cartão em pagamento de fatura, que é o erro oposto;
- a interface **pergunta**: ao pagar, a pessoa escolhe a fatura na lista, com mês
  de vencimento e total ao lado. Não é dedução do sistema.

Com isso, as duas perguntas passam a ter resposta direta em SQL:

```sql
-- total de compras da fatura
select sum(amount) from transactions where invoice_month = :mes;
-- quanto já foi pago dela
select sum(amount) from transactions where settles_invoice_month = :mes;
```

E a situação da fatura — aberta, parcial, paga — é a comparação entre as duas,
não uma heurística de calendário.

## Consequências

**A favor:**

- "Esta fatura foi paga?" e "quanto falta?" viram consulta exata, inclusive com
  pagamento parcial, atrasado ou adiantado. Nenhum dos quatro casos da tabela
  acima precisa de caso especial.
- A informação vem de quem a tem. O usuário já escolhe a fatura no app do banco;
  repetir a escolha aqui não acrescenta trabalho cognitivo.
- Estorno continua representável: é perna de transferência sem
  `settles_invoice_month`, e não contamina o cálculo de nenhuma fatura.
- Pagar uma fatura com dois pagamentos (parcial duas vezes) soma naturalmente.
- Não mexe em `invoice_month`, no trigger de alocação nem na regra do ADR-008.
  A migration é **aditiva**: o app atual continua funcionando sem a coluna.

**Contra:**

- Mais um campo a preencher no fluxo de pagamento. Mitigado por a interface
  sugerir a fatura em aberto mais antiga, que é o caso quase sempre.
- Um dado que pode ficar errado se a pessoa escolher a fatura errada. É um erro
  corrigível e visível (a fatura certa continua aparecendo como não paga),
  diferente de um erro de heurística, que é invisível.
- Abre a porta para inconsistência que o banco precisa barrar: um pagamento
  apontando uma fatura que não existe, ou `settles_invoice_month` numa linha de
  despesa. Resolvido com `check` e com a mesma disciplina do trigger de
  `invoice_month` — a verificação mora no Postgres, não só no Python (ADR-004).
- Uma coluna que só a Fase 1 vai popular de verdade. Entra agora porque é
  aditiva e porque desenhar a tela de Cartões sem ela produziria uma tela que
  mente.

## Alternativas consideradas

- **Heurística por janela de datas.** Zero mudança de schema. Recusada pelos
  quatro casos acima: erraria em silêncio, e saldo de fatura errado é o tipo de
  número que faz a pessoa deixar de confiar no sistema inteiro.
- **Uma tabela `invoices` de verdade,** com id, total fechado e pagamentos
  referenciando-a por FK. Mais ortodoxo. Recusada por ora: fatura hoje é uma
  *visão* derivada das compras (`invoice_month`), não uma entidade gravada, e
  materializá-la exigiria decidir quando ela é criada, quem fecha, o que fazer
  com lançamento retroativo numa fatura já materializada — e nada disso é
  necessário para responder "foi paga?". Se um dia a fatura precisar de dado
  próprio (total impresso pelo banco, juros, multa), esta é a saída, e a coluna
  de agora vira a FK.
- **Marcar a fatura como paga num campo separado** (uma tabela
  `invoice_status`). Recusada: cria um segundo lugar que pode discordar dos
  lançamentos, e o lançamento é o fato.
- **Deduzir pelo valor exato.** "O pagamento de R$ 1.284,90 bate com a fatura de
  R$ 1.284,90." Recusada: falha em pagamento parcial, em pagamento de duas
  faturas iguais e em qualquer centavo de diferença.
