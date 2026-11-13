# ADR-013 — Modelo recorrente de previsto

- **Status:** Substituído pelo [ADR-019](019-previsto-padrao-com-vigencia.md) em 2026-11-04.
  problema, o que já foi descartado e as perguntas que precisam de resposta antes
  de existir migration. Nenhuma coluna ou tabela foi criada.
- **Data:** 2026-10-08
- **Bloqueia:** `budgeting.application.salvar_previsto` e
  `budgeting.application.modelo_de_previsto`, ambos da Fase 1.

## Por que este ADR existe sem decisão

O grill de 2026-10-08 descartou o RF06 original — *"copiar o orçamento do mês
anterior"* — e decidiu que o previsto é **um modelo que se repete todo mês**, com
ajuste só nos meses que fogem do padrão. A tela de Orçamento foi desenhada em
cima disso: a coluna "previsto" é editável na linha e vale só para o mês
selecionado; o padrão que se repete mora em Ajustes → Categorias.

Ao decidir o escopo da reestruturação, a opção escolhida foi aplicar a migration
005 com as duas mudanças maduras (ADR-010 e `is_admin`) e **deixar esta de fora**,
porque ela não está desenhada. A justificativa é o próprio
[ADR-008](008-fechamento-inclusivo.md), que registrou o custo de decidir cedo:

> É a segunda migration seguida a mexer na mesma coluna. [...] registra que o
> ADR-007 foi decidido cedo demais, a partir de uma descrição informal, em vez de
> ir atrás de como o produto funciona.

Aplicar uma tabela meio pensada aqui produziria exatamente a terceira migration
sobre a mesma coluna. A interface não precisa dela para existir: `app/dados.py`
devolve o modelo de previsto como dado de exemplo, com a marca
`TODO(claude-code)`.

## O problema, em uma frase

O orçamento de uma categoria tem **dois valores**: o que ela custa em um mês
típico, e o que ela custou de previsto num mês específico. Hoje o banco só tem o
segundo (`budgets`, por mês e categoria). Falta onde guardar o primeiro, e falta
decidir como os dois se combinam.

## Perguntas abertas

**1. Onde mora o padrão: coluna em `categories` ou tabela própria?**

Coluna em `categories` é mais simples e trata "quanto esta categoria custa por
mês" como atributo da categoria — que é como a tela de Ajustes a apresenta.
Tabela própria (`budget_templates`) separa a configuração de orçamento do
cadastro da categoria, e abre espaço para padrão por período.

*Inclinação atual:* coluna, pela simplicidade — mas ela depende da pergunta 3.

**2. Como o padrão e o ajuste do mês se combinam?**

Duas leituras:

- **`budgets` como exceção**: o previsto do mês é `coalesce(budgets.amount,
  padrão)`. Linha em `budgets` só existe nos meses que fogem. Economiza
  escrita e mantém o padrão como fonte única.
- **`budgets` materializado**: ao abrir um mês, o padrão é copiado para
  `budgets` e tudo é lido de lá. Histórico explícito, ao custo de precisar
  decidir *quando* a cópia acontece (primeiro acesso? job? gravação?) e do risco
  de um mês nunca visitado não ter linha.

*Inclinação atual:* exceção. Mas isso define o que "quanto eu havia previsto em
março?" responde, e a resposta muda com a pergunta 3.

**3. O padrão tem vigência histórica?**

Se eu aumentar o padrão de "Mercado" de R$ 700 para R$ 800 hoje, o orçamento de
**março** deve continuar mostrando R$ 700 ou passar a mostrar R$ 800?

- "Continua R$ 700" exige vigência por período, como `account_terms` já faz para
  fechamento e vencimento (ADR-005), e empurra para a tabela própria da pergunta
  1.
- "Passa a R$ 800" é mais simples e corrompe meses fechados — o erro que o
  ADR-005 recusou explicitamente para `account_terms`.

*Inclinação atual:* vigência, por coerência com `account_terms`. É a pergunta que
mais pesa, porque ela decide as outras duas.

**4. Categoria de receita tem previsto?**

A tela de Orçamento mostra "renda base" e destaca o que veio "acima do
previsto", o que pressupõe uma renda prevista. Ela é o padrão de uma categoria de
receita, um valor único do mês, ou a soma dos padrões das categorias de receita?

*Inclinação atual:* mesmo mecanismo das despesas, sem caso especial — mas
confirmar que "renda base" é a soma dos padrões de receita, e não um campo à
parte.

## O que já está descartado

- **"Copiar o mês anterior"** (RF06 original). Descartado no grill: propaga erro
  de um mês atípico para frente, e exige uma ação manual todo mês que o sistema
  deveria dispensar.
- **Previsto só por mês, sem padrão** (o que existe hoje). Descartado: obriga a
  preencher doze vezes o que é o mesmo número.
- **Padrão fixo no código.** Descartado pelo mesmo motivo do ADR-008 sobre
  fechamento e vencimento: o usuário muda isso, e não vai abrir um PR para mudar.

## Como decidir

Quando a Fase 1 chegar em `budgeting`, antes de escrever a migration:

1. responder a pergunta 3 primeiro — ela determina 1 e 2;
2. conferir contra a planilha original: o que acontecia lá quando o orçamento de
   uma categoria mudava? O histórico da planilha é a evidência de como o dono
   espera que o sistema se comporte, e foi ignorá-la que custou o ADR-007;
3. escrever a migration e **substituir este ADR** por um com decisão, não editar
   este.

## Consequências de deixar pendente

**A favor:**

- Nenhuma migration a renomear depois. A terceira mudança consecutiva na mesma
  estrutura deixa de acontecer.
- A interface fica pronta e exercitada com dado de exemplo, então quando a
  decisão vier já se sabe que formato a tela consome
  (`dados.modelo_de_previsto(mes)` devolvendo padrão e ajuste do mês).

**Contra:**

- `budgeting.application.salvar_previsto` fica bloqueado, e com ele o botão de
  salvar o previsto na tela de Orçamento — que hoje mostra um `st.toast` dizendo
  que nada foi gravado.
- Um ADR sem decisão no índice pode ser lido como indecisão em vez de
  contenção. Daí este texto nomear as quatro perguntas e a inclinação de cada
  uma: é trabalho preparado, não trabalho evitado.
