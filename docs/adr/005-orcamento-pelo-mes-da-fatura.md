# ADR-005 — Despesa de cartão entra no orçamento do mês de vencimento da fatura

- **Status:** Aceito
- **Data:** 2026-10-07

## Contexto

Há duas leituras possíveis para "em que mês essa despesa de cartão entra?":

- **Regime de competência** — no mês da compra. Reflete quando o consumo aconteceu.
- **Regime de caixa, pela fatura** — no mês em que a fatura vence. Reflete quando o
  dinheiro sai da conta.

O cartão de referência é o Unicred: **fecha dia 23, vence dia 30**. Uma compra em
20 de março e outra em 26 de março são, na competência, o mesmo mês; na prática, a
primeira é paga em 30 de março e a segunda em 30 de abril.

O propósito do sistema é substituir uma planilha de orçamento pessoal, cuja pergunta
é "quanto posso gastar este mês sem estourar?". Essa pergunta é sobre dinheiro
saindo da conta.

## Decisão

A despesa de cartão entra no orçamento do **mês de vencimento da fatura em que ela
caiu**.

Regra de alocação:

- compra **antes** do fechamento → fatura que fecha neste ciclo → vence neste mês;
- compra **a partir do dia do fechamento** (inclusive) → próxima fatura → vence no
  mês seguinte;
- **cada parcela** entra na fatura em que ela cai, não todas na fatura da compra.

Cada lançamento de cartão carrega um `invoice_month` calculado e verificado **no
Postgres** (ADR-004), não só no Python: é um invariante, e todo caminho de escrita —
app, importador, script de seed — precisa obedecê-lo.

Fechamento e vencimento **não** são constantes. Moram em `account_terms`, com
vigência por período, porque o banco muda essas datas e o histórico precisa
continuar sendo calculado com as regras que valiam na época.

O **pagamento da fatura** é uma transferência (conta corrente → conta do cartão), não
uma despesa. Contabilizar a compra e o pagamento como despesas contaria o mesmo gasto
duas vezes.

## Consequências

**A favor:**

- O orçamento do mês corresponde ao que realmente sai da conta: é a pergunta que a
  planilha original respondia.
- Compras parceladas aparecem distribuídas pelos meses em que serão pagas, que é
  como o comprometimento futuro de renda de fato funciona.
- `account_terms` com vigência mantém o histórico correto quando o banco muda o
  fechamento.
- A verificação no banco impede que o importador de extrato (Fase 2) crie lançamentos
  inconsistentes com os criados pela interface.

**Contra:**

- Uma compra feita dia 24 "some" do mês corrente para quem espera competência. É
  contraintuitivo na primeira vez; a interface precisa mostrar o mês da fatura ao
  lançar, não escondê-lo.
- Análise por competência ("quanto gastei em mercado em março?") exige consultar pela
  data da compra, não pelo `invoice_month`. As duas datas ficam guardadas, então
  ambas as visões são possíveis — mas o orçamento usa uma só.
- A alocação depende de `account_terms` estar correto para a data da compra. Período
  de vigência faltando é erro de dado que precisa falhar alto, não silenciosamente.
- Lançamento retroativo pode cair numa fatura já paga; a interface precisa avisar.

## Alternativas consideradas

- **Competência (mês da compra).** Correto contabilmente e mais intuitivo.
  Recusado: não responde "quanto posso gastar este mês", que é o propósito do
  sistema, e descasa do saldo da conta corrente.
- **As duas visões, lado a lado, desde o MVP.** Recusado por ora: dobra a
  complexidade de toda tela de orçamento antes de haver evidência de que a segunda
  visão é usada. Os dados permitem adicioná-la depois sem migração.
- **Fechamento e vencimento fixos no código.** Mais simples. Recusado: o banco muda
  essas datas, e recalcular o histórico com a regra nova corromperia meses fechados.
- **Parcelamento inteiro na fatura da primeira parcela.** Recusado: superestima o mês
  da compra e esconde o comprometimento dos meses seguintes, que é justamente o que
  se quer enxergar.
