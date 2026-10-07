# ADR-008 — O dia de fechamento é o do app do banco, e é inclusivo

- **Status:** Aceito
- **Data:** 2026-10-07
- **Substitui:** a parte do [ADR-007](007-ciclo-de-fatura-e-pagamento.md) sobre
  `cycle_start_day`. A outra decisão daquele ADR — pagamento de fatura não é
  compra e não tem `invoice_month` — continua valendo.

## Contexto

O ADR-007 trocou `closing_day` por `cycle_start_day` por não conseguir decidir
se o número informado era o último dia do ciclo velho ou o primeiro do novo.
Aceitou, como custo, que o dono teria de cadastrar `28` para um cartão que o
banco anuncia como "fecha dia 27".

Esse custo era alto e desnecessário. O funcionamento do cartão de crédito não é
ambíguo:

- a **data de fechamento** é o dia em que o banco para de somar compras naquela
  fatura. Gasto **até** o fechamento, inclusive, entra na fatura atual; gasto
  **depois** dele vai para a seguinte;
- a **data de vencimento** é o dia limite de pagamento, de 7 a 10 dias após o
  fechamento.

Ou seja, o dia do fechamento é **inclusivo**, e ambos os números são exatamente
os que aparecem no aplicativo do banco. Não há nada a derivar.

A descrição informal que originou o ADR-007 ("gasto do dia 04/09 até 03/10")
colocava o dia 04 no início do ciclo seguinte. Confrontada com a regra geral
acima, ela era uma imprecisão de um dia, não uma segunda convenção.

## Decisão

**A coluna volta a se chamar `closing_day`, e guarda o número que o banco
mostra.** O vencimento idem. O usuário não converte nada.

A regra passa a ser:

- a compra pertence à fatura que fecha no primeiro `closing_day` que **não é
  anterior** a ela. Em outras palavras: `dia da compra <= closing_day` entra na
  fatura que fecha neste mês; depois disso, na do mês seguinte;
- essa fatura vence no `due_day`, no mesmo mês do fechamento se
  `due_day > closing_day`, e no mês seguinte caso contrário.

Conferida contra os dois cartões reais, com os números que os bancos anunciam:

| Cartão | Fecha | Vence | Compra | Fatura vence em |
|---|---|---|---|---|
| Unicred | 04 | 11 | 04/09 | 11/09 |
| Unicred | 04 | 11 | 05/09 | 11/10 |
| Nubank | 27 | 05 | 27/09 | 05/10 |
| Nubank | 27 | 05 | 28/09 | 05/11 |

O segundo critério é o que separa os dois: no Unicred `11 > 4`, então a fatura
vence no mesmo mês em que fecha; no Nubank `5 < 27`, então vence no mês
seguinte — o que também explica por que o vencimento do Nubank "pula" de mês.

## Consequências

**A favor:**

- O cadastro passa a ser transcrição: dois números, lidos do app do banco. Some
  a classe inteira de erro em que o dono converte mal e o orçamento fica um mês
  deslocado, sem nada indicar isso.
- A interface pode perguntar "qual o dia de fechamento?" e "qual o dia de
  vencimento?", que é como a pessoa pensa e como o banco informa.
- A regra dos 7 a 10 dias entre fechamento e vencimento vira uma validação
  possível na interface: um par muito fora disso provavelmente é erro de
  digitação.

**Contra:**

- É a segunda migration seguida a mexer na mesma coluna. O custo é só de
  histórico, porque ainda não existe dado real; mas registra que o ADR-007 foi
  decidido cedo demais, a partir de uma descrição informal, em vez de ir atrás
  de como o produto funciona.
- Quem leu o ADR-007 precisa saber que a parte do `cycle_start_day` não vale
  mais. Daí este ADR nomear explicitamente o que substitui e o que preserva.

## Alternativas consideradas

- **Manter `cycle_start_day` e documentar a conversão.** Recusada: transferir
  para o usuário uma conversão de ±1 dia, toda vez que cadastrar um cartão, para
  conveniência do banco de dados. É o tipo de atrito que a planilha não tinha.
- **Guardar os dois, fechamento e início do ciclo.** Recusada: são o mesmo fato
  escrito de duas formas, e dados redundantes divergem.
