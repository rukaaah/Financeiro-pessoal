# ADR-014 — Natureza da categoria e a categoria com cofrinho

- **Status:** Aceito
- **Data:** 2026-10-30
- **Relaciona:** [ADR-005](005-orcamento-pelo-mes-da-fatura.md) (mês do orçamento),
  [ADR-013](013-modelo-recorrente-de-previsto.md) (previsto recorrente, ainda pendente)

## Contexto

O bloco "Onde ainda cabe" do Resumo responde *"em que eu ainda posso gastar este
mês?"*. Na revisão de 2026-10-29 ele mostrava categorias que não respondem essa
pergunta:

- **gasto fixo** (Muay thai): o valor é o mesmo todo mês, e o que "sobra" nela não
  é dinheiro livre, é a mensalidade que ainda não caiu;
- **categoria com cofrinho** (Jogos): todo mês R$ 150 do salário vão para o cofrinho
  Jogos, e o jogo é comprado com o dinheiro do cofrinho. A categoria parecia estourada
  ou folgada conforme a data da compra, sem que nada de errado tivesse acontecido.

O Pedro fechou a regra no grill de 2026-10-29:

1. a categoria tem uma **natureza**, escolhida ao criá-la: variável, fixa ou com
   cofrinho;
2. a categoria com cofrinho tem **três modalidades** de lançamento:
   - **para o cofrinho**: tirei do salário e pus no cofrinho;
   - **do cofrinho**: tirei do cofrinho para gastar;
   - **do salário**: gastei direto do salário;
3. o cofrinho tem uma **inserção mensal prevista**, definida ao criá-lo;
4. a categoria com cofrinho **só aparece no Resumo** quando o salário foi usado para
   algo além da inserção prevista. Pôr a inserção prevista no cofrinho e gastar do
   cofrinho não a fazem aparecer.

Nada disso existe no banco. A tabela `categories` não tem natureza nem vínculo com
conta, e nenhum lançamento diz de onde saiu o dinheiro.

## Decisão

### 1. Natureza da categoria

`categories.nature`, enum `category_nature` com `variable`, `fixed` e
`goal_backed`. O padrão é `variable`, o que deixa toda categoria existente como
estava.

- Só despesa tem natureza diferente de `variable`. Receita fixa ou com cofrinho não
  significa nada na regra acima.
- `goal_backed` exige `categories.goal_account_id`, e só ela o tem. A conta apontada
  precisa ser do tipo `goal` (verificado por trigger, porque FK não olha o tipo).
- Um cofrinho atende **no máximo uma** categoria. É o que permite atribuir uma
  inserção no cofrinho à categoria sem ambiguidade.

### 2. Inserção mensal prevista, com vigência

Tabela `goal_contributions` (conta, vigência, valor), no mesmo molde de
`account_terms`: vigências da mesma conta não se sobrepõem.

A vigência é pelo motivo que o ADR-005 deu para fechamento e vencimento, e que o
ADR-013 registrou como inclinação para o previsto: se a inserção sobe de R$ 150 para
R$ 200 em novembro, outubro tem de continuar medindo contra R$ 150. Sem vigência,
mudar o valor hoje reescreveria quais meses passados "usaram o salário".

### 3. A modalidade é derivada, com uma coluna só

O dinheiro anda como já anda no razão. A única informação nova é **qual despesa um
resgate do cofrinho pagou**.

| Modalidade | Como fica no banco |
|---|---|
| Para o cofrinho | Transferência comum para a conta `goal` (como hoje) |
| Do cofrinho | Despesa na conta que pagou (cartão, corrente) **+** transferência que sai do cofrinho, com a perna de saída apontando a despesa em `transactions.funds_expense_id` |
| Do salário | Despesa sem resgate apontando para ela |

A despesa continua na conta que pagou, então a fatura do cartão continua certa
(ADR-005) e o saldo do cofrinho continua sendo `sum(amount)`. Resgate parcial cabe
sem caso especial: jogo de R$ 200 com R$ 150 do cofrinho é uma despesa de 200 e um
resgate de 150 apontando para ela; os R$ 50 restantes são do salário.

Invariantes, verificados no banco por trigger diferido (as duas pernas e a despesa
entram em comandos separados):

| Código | Regra |
|---|---|
| 23F20 | O cofrinho da categoria, ou da inserção prevista, é conta `goal`, e continua sendo |
| 23F21 | Só a perna de **saída** de uma transferência, numa conta `goal`, aponta despesa |
| 23F22 | A despesa apontada é de categoria com cofrinho, e o cofrinho é esta conta |
| 23F23 | O que os resgates pagam não passa do valor da despesa |
| 23F24 | A categoria não perde a natureza nem troca de cofrinho enquanto há despesa paga pelo cofrinho dela |

### 4. A regra do Resumo

Para uma categoria com cofrinho `G` e um mês `M` (mês de orçamento pelo ADR-005:
`invoice_month` no cartão, mês da data nas outras contas):

```
gasto        = Σ |despesas da categoria em M|
do_cofrinho  = Σ |pernas de resgate que apontam essas despesas|
do_salario   = gasto − do_cofrinho
para         = Σ pernas de entrada em G com data em M
previsto     = valor de goal_contributions vigente em M (0 se não houver)
fora_do_previsto = do_salario + max(para − previsto, 0)
```

A categoria aparece no Resumo, como alerta "usou dinheiro do mês", se e somente se
`fora_do_previsto > 0`. "Onde ainda cabe" mostra só `variable` com folga positiva. A
conta é da aplicação (`budgeting`), não do banco: é leitura, e precisa do previsto do
ADR-013 para as outras naturezas.

## Consequências

**A favor:**

- Migration aditiva. O app no ar continua funcionando: toda categoria nasce
  `variable` e nenhum lançamento existente aponta despesa.
- O razão não ganha tipo de lançamento novo. "Do cofrinho" é uma despesa e uma
  transferência que já existiam, ligadas por uma coluna.
- A regra do Resumo sai de dados que o banco garante, não de convenção de nome
  ("Cofrinho Jogos" × "Jogos" já causou um bug na interface).

**Contra:**

- Pagar com o cofrinho são três linhas (despesa e duas pernas). O diálogo Lançar
  esconde isso, mas o importador de extrato e o seed precisam escrever as três.
- Apagar uma despesa paga pelo cofrinho exige apagar o resgate antes (FK com
  `RESTRICT`). É de propósito: apagar só a despesa deixaria dinheiro saído do
  cofrinho sem destino.
- A inserção prevista tem vigência e o previsto das categorias ainda não (ADR-013).
  Quando o ADR-013 for decidido, o previsto de uma categoria com cofrinho deve ler
  `goal_contributions`, e não ganhar um segundo número.

## Alternativas consideradas

- **Lançar a despesa direto na conta do cofrinho.** Dispensa coluna nova, mas a
  compra feita no cartão sumiria da fatura, e o total da fatura deixaria de bater
  com o app do banco — o erro que o ADR-008 custou caro para corrigir.
- **Coluna `funding` (enum) na despesa.** Diz a modalidade, mas não move dinheiro:
  o saldo do cofrinho ficaria errado, ou dependeria de a aplicação lembrar de criar
  a transferência. E não representa resgate parcial.
- **Inserção prevista como coluna em `accounts`.** Mais simples, mas sem vigência:
  descartada pelo mesmo motivo que o ADR-005 descartou fechamento sem vigência.
- **Natureza como texto livre ou marca na interface.** Descartado: a regra do
  Resumo depende dela, então ela tem de estar no banco.
