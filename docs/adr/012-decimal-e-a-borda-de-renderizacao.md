# ADR-012 — `Decimal` em toda conta; `float` só na borda de renderização

- **Status:** Aceito
- **Data:** 2026-10-08
- **Precisa:** a regra "valores monetários em `Decimal` / `numeric(14,2)`, nunca
  `float`" do `CLAUDE.md`.

## Contexto

A regra do projeto é categórica: dinheiro nunca é `float`. O motivo é o de
sempre — `0.1 + 0.2 != 0.3` em binário, e num sistema de orçamento o erro
acumula até a soma das categorias não fechar com o total.

A regra foi escrita pensando em **conta**, e cumpri-la ao pé da letra na camada de
apresentação se mostrou impossível de duas formas, uma já aceita tacitamente e
outra nova:

**1. Gráfico (já acontecia na v1).** `st.line_chart` e `st.bar_chart` recebem
números e desenham pixels. Não há como passar `Decimal`. A v1 resolvia com
`float(v)` e um comentário: *"`float` só aqui, e só para desenhar: o gráfico não
faz conta nem guarda valor."* Correto, e nunca registrado como decisão.

**2. Tabela ordenável (nova).** O grill de 2026-10-08 decidiu que coluna de
dinheiro precisa ordenar por valor. A v1 formatava com `brl()` e passava texto,
então clicar em "Valor" ordenava alfabeticamente: `R$ 1.000,00` vinha antes de
`R$ 48,90`. Num extrato de 200 linhas, "qual foi meu maior gasto" não tinha
resposta.

Ordenar por valor exige que a coluna **seja** número. `st.column_config.NumberColumn`
com `format="accounting"` resolve, inclusive com negativo entre parênteses e
alinhamento pelo decimal — mas recebe número, não `Decimal`.

As três saídas possíveis eram: abandonar a ordenação, escrever uma tabela HTML
própria, ou converter na borda. A primeira sacrifica função por literalidade da
regra; a segunda troca um `float()` por centenas de linhas de código a manter,
perdendo busca e rolagem de graça.

## Decisão

**`Decimal` em toda conta. `float` existe em exatamente um lugar: no argumento de
uma chamada que desenha pixels, na última linha antes do Streamlit.**

Formalmente:

- **domínio, aplicação, adapters, banco** — `Decimal` e `numeric(14,2)`.
  Nenhum `float` em qualquer circunstância. Isto não mudou e não muda;
- **`app/dados.py` e `app/modelos.py`** — `Decimal`. A costura de dados nunca
  entrega `float`;
- **`app/formatacao.py`** — `Decimal` entra, `str` sai. Nada de `float`;
- **toda soma, subtração, divisão, comparação, arredondamento** — `Decimal`,
  mesmo em código de tela. Calcular em `float` e exibir é proibido;
- **só a conversão de exibição** pode usar `float()`, e só em dois lugares:
  1. os dados que vão para `st.line_chart` / `st.bar_chart` / `st.area_chart`;
  2. a coluna numérica de `st.dataframe` / `st.data_editor` servida por
     `NumberColumn`.

Regras que tornam isso verificável:

- a conversão fica **concentrada em helpers** de `app/componentes.py` (a função
  de tabela e as duas de gráfico). Página nenhuma escreve `float(` — e há teste
  conferindo isso;
- entrada de valor **nunca** usa `st.number_input`, que devolve `float`. Usa
  `st.text_input` lido por `app.formatacao.ler_valor`, que devolve
  `Decimal | None`. Isso já era prática na v1 e passa a ser regra escrita;
- toda `float()` de exibição é imediatamente adjacente à chamada do Streamlit que
  a consome. Não existe variável `float` viva por mais de uma expressão.

## Consequências

**A favor:**

- A regra fica cumprível e, por isso, cumprida. Uma regra absoluta que o código
  precisa violar em silêncio é pior que uma regra com uma fronteira declarada.
- Ordenação por valor, alinhamento pelo decimal e negativo entre parênteses na
  tabela — o comportamento de um demonstrativo financeiro.
- A fronteira é estreita o suficiente para caber num teste: nenhuma página chama
  `float()`, e a entrada de valor nunca é `st.number_input`.
- Erro de ponto flutuante na exibição é invisível na prática: um `float` de dupla
  precisão representa qualquer centavo até cerca de 45 bilhões de reais sem
  perda na primeira casa decimal de erro, e o valor já chega arredondado a duas
  casas. Ele desenha um pixel e é descartado.

**Contra:**

- A regra do `CLAUDE.md` deixa de ser literal e passa a ter uma exceção nomeada.
  Mitigado por a exceção ser escrita, limitada a duas chamadas e testada.
- Alguém lendo `float(` na base pode concluir que a regra não é levada a sério.
  Daí a conversão viver concentrada em helpers com comentário apontando este ADR.
- Se um dia o Streamlit aceitar `Decimal` nessas APIs, a exceção deixa de ser
  necessária e este ADR deve ser substituído, não apenas esquecido.

## Alternativas consideradas

- **Proibir `float` sem exceção e abandonar a ordenação.** Recusada: sacrifica a
  resposta a "qual foi meu maior gasto" para preservar a letra de uma regra cujo
  propósito — não errar centavo em conta — já estaria preservado.
- **Tabela HTML própria, renderizada por `st.html`.** Controle total de
  tipografia, zero `float`. Recusada: perde ordenação, busca, seleção de coluna e
  rolagem que o `st.dataframe` entrega; e ordenar em HTML exigiria reimplementar
  no Python o que já existe pronto. Trocaria um `float()` por código a manter.
- **Inteiro de centavos (`int`) na camada de tela.** Nenhuma imprecisão, e
  ordenável. Recusada: o `NumberColumn` formataria 48.900 centavos como
  "48.900,00"; seria preciso um `format` próprio por coluna, e a cada esquecimento
  um valor apareceria cem vezes maior. Erro mais perigoso do que o que se evita.
- **Deixar como estava, com o comentário solto no código.** Recusada: a prática
  já existia sem decisão registrada, e a tabela ordenável ampliava a exceção.
  Ampliar uma exceção não documentada é como ela deixa de ser exceção.
