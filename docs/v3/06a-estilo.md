# Etapa 6a — Estilo visual

Data: 2026-11-04. Feito com a skill `/design-md-library`, que dá a referência de
marcas reais para adaptar, nunca copiar (nada de logo, texto ou identidade delas).

## Referências escolhidas, e por quê

O ponto de partida é a regra que já está nos tokens da v2 e que o diagnóstico
confirmou: **interface neutra; verde, âmbar e vermelho só para estado** (dentro,
perto, fora). Isso elimina as marcas de finanças da biblioteca que usam verde como
cor de marca, que são justamente as mais parecidas no assunto:

| Marca na biblioteca | Usa | Fica de fora porque |
|---|---|---|
| NerdWallet | verde *spruce* `#008254` como marca e botão | verde de botão colidiria com "dentro do previsto" |
| Wise | verde-limão `#9fe870` como única cor de ação | idem, e cartões de 24 px, macios demais para tabela |

Escolhidas:

1. **Oracle** (principal) — "warm neutral ladder", uma única cor escura para toda
   ação, raio pequeno, hierarquia por peso (corpo 400, título 800) e cor só em faixa
   inteira. É a gramática de um demonstrativo: o que muda de seção é um degrau de
   cinza, não uma caixa.
2. **Wise** (só a parte semântica) — cada estado tem três tons: fundo pálido, cor
   do sinal e tinta escura para texto sobre o fundo (`positive` / `positive-deep`,
   `warning` / `warning-content`, `negative` / `negative-deep`). É o que faz um
   selo "fora" legível sem gritar.
3. **NerdWallet** (só tabela) — régua fina entre linhas (`hairline`), borda em vez
   de sombra, cantos quase retos. É a marca da biblioteca mais próxima de tabela de
   comparação de dinheiro.

**Diferença em relação à Oracle:** a Oracle usa grafite para ação. Aqui a ação é
**azul** (`#2b55d0`), por decisão do Pedro em 2026-10-29 ("o app sem cor"). O azul
não colide com os três estados e mantém o princípio: uma só cor de ação.

## Princípios

1. **A cor é a informação.** Se uma área tem verde, âmbar ou vermelho, é estado de
   orçamento ou gravidade de alerta, sempre com o rótulo escrito ao lado (dentro,
   perto, fora; crítico, atenção). Azul é só "isto se toca".
2. **O número manda.** Valor monetário em algarismo tabular, alinhado à direita,
   centavos sempre, sinal de menos real (−) ou parênteses em tabela. Nunca animar
   número.
3. **Degrau de cinza no lugar de caixa.** Seção nova é um degrau na escala neutra ou
   uma régua; borda com sombra só em diálogo e na barra inferior, que de fato
   flutuam.
4. **Celular primeiro, polegar primeiro.** Alvo de toque com 44 px no mínimo; ação
   principal na metade de baixo da tela; nada de informação só no `hover`.
5. **Sem enfeite.** Sem emoji, sem ilustração, sem gradiente, sem gráfico de pizza.

## Paleta

Os valores e contrastes abaixo são os **medidos** em `app/estilo/tokens.css`
(WCAG 2.1; alvo 4,5:1 em texto e 3:1 em elemento de interface). A v3 os mantém; o
que muda está marcado.

### Neutros (claro)

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `--fin-fundo` | `#fbfbf9` | Página | — |
| `--fin-superficie` | `#f4f4f1` | Degrau 1: cabeçalho de tabela, seção recuada | — |
| `--fin-poco` | `#ecece9` | Degrau 2: campo de entrada | — |
| `--fin-texto` | `#181b1a` | Texto e números | 16,74:1 |
| `--fin-texto-2` | `#585f5c` | Rótulo, legenda | 6,32:1 |
| `--fin-texto-3` | `#636a66` | Placeholder, desabilitado | 5,36:1 (4,69:1 sobre campo) |
| `--fin-regua` | `#cdd0ca` | Linha entre itens | 1,50:1 (decorativa) |
| `--fin-regua-forte` | `#b8bcb5` | Fecha seção, separa total | 1,86:1 (decorativa) |
| `--fin-borda-campo` | `#7f857f` | Contorno de campo | 3,19:1 sobre o campo |

### Ação

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `--fin-acento` | `#2b55d0` | Botão principal, link, aba ativa, Lançar | 6,12:1 |
| `--fin-acento-hover` / `-ativo` | `#2347b3` / `#1c3a94` | Toque e pressionado | — |
| `--fin-acento-suave` | `#e6ecfb` | Item selecionado | acento sobre ele 5,36:1 |

### Estado (três tons por estado, à maneira da Wise)

| Estado | Sinal (texto, ícone) | Fundo do selo | Contraste do texto |
|---|---|---|---|
| Dentro / informativo positivo | `#1f6f54` | `#e2efe9` | 5,86:1 no fundo; 5,13:1 no selo |
| Perto / atenção | `#8a5a00` | `#f7ead1` | 5,72:1; 4,98:1 |
| Fora / crítico | `#b3261e` | `#f9e2e0` | 6,31:1; 5,29:1 |

Informativo neutro usa `--fin-texto-2` sobre `--fin-superficie`. **Nenhuma cor
nova**, nem para a v3.

### Tarja de dados fictícios

`--fin-tarja-fundo #322d1f` com texto `#f6e7c4` (11,20:1). Escura, para não ser
confundida com o âmbar de "perto".

### Gráfico

Série principal no acento; comparação (média, mês anterior, CDI) em
`--fin-grafico-2 #6b726e`; categorias pela rampa `--fin-grafico-cat-1..7` já
validada. Valor escrito no fim da linha, nunca só legenda.

### Modo escuro

Mantém o da v2 (`[data-theme="dark"]` e `prefers-color-scheme`): fundo `#111413`,
texto `#e7e9e6` (15,17:1). Os estados ganham versões claras com o mesmo critério de
contraste; conferir cada par na implementação, com teste (já existe
`test_tokens_espelham_tema.py`).

## Tipografia

| Mudança | De | Para | Por quê |
|---|---|---|---|
| Fonte de número | `ui-monospace` | **a mesma sans do sistema, com `font-variant-numeric: tabular-nums`** | Monoespaçada dá cara de código e é mais larga: na régua de quatro números do Mês, em 375 px, cada coluna tem ~80 px. SF Pro (iOS) e Roboto (Android) têm algarismos tabulares |

Continua **sem webfont**: a pilha do sistema (`system-ui`, SF Pro, Roboto, Segoe UI)
não custa download, e a primeira tela já passa da meta (Etapa 1).

| Papel | Tamanho | Peso | Altura de linha | Uso |
|---|---|---|---|---|
| Número principal | 36 px (celular), 48 px (desktop) | 700 | 1,15 | Um por tela: fatura aberta, patrimônio |
| Régua de números | 18 px | 600 | 1,15 | Os quatro números do Mês, totais |
| Título de página | 26 px | 700 | 1,15 | Nome do destino |
| Título de seção | 21 px | 700 | 1,15 | |
| Corpo | 16 px | 400 | 1,45 | Texto, valores em lista |
| Legenda | 14 px | 400 | 1,45 | Critério ("pelo mês da fatura"), data de atualização |
| Rótulo | 12 px, caixa alta, +0,08em | 600 | — | Nome do número na régua |
| Campo | 16 px absolutos | 400 | — | Abaixo disso o iOS dá zoom ao focar |

Hierarquia por peso, à Oracle: o salto entre corpo (400) e título (700) é o sinal
estrutural; não se usa cor para hierarquia.

## Forma

| Elemento | Raio | Borda e sombra |
|---|---|---|
| Botão, campo, selo retangular | 4 px | Sem sombra |
| Selo de estado | pílula | Sem borda |
| Linha de lista, tabela | 0 | Régua de 1 px embaixo |
| Diálogo e folha inferior | 6 px no topo | `--fin-sombra-dialogo` |
| Barra inferior | 0 | Régua forte em cima; fundo opaco |
| Botão Lançar (centro da barra) | 999 px (círculo de 56 px) | É a única forma redonda: é a ação mais usada |

Espaço: escala de 4 px (4, 8, 12, 16, 24, 32, 48). Margem lateral de 16 px no
celular.

## Ícones

- **Material Symbols Outlined**, que o Streamlit já embute (`:material/...:`), sem
  outro pacote. Traço de 400, tamanho 20 px em lista e 24 px na barra.
- Ícone **sempre acompanhado de rótulo** na barra e nos botões. Sozinho só em ação
  repetida e óbvia (fechar, editar), com `aria-label`.
- Ícone não carrega estado: o selo carrega. Um mesmo ícone por conceito em todo o
  app (cartão `credit_card`, cofrinho `savings`, a receber `person`, IA
  `auto_awesome` só nas telas de IA).

## O que confirmar no Portão 2

- Oracle como referência principal, com o azul no lugar do grafite.
- Números na sans do sistema com algarismo tabular, em vez de monoespaçada.
- Botão Lançar redondo no centro da barra inferior.
