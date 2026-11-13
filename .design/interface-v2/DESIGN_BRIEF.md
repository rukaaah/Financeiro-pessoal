# Design Brief: Interface v2 — reestruturação de fluxos e telas

> **Fonte das decisões:** grill-me de 2026-10-08 (24 decisões), `CLAUDE.md`, ADR-001 a
> ADR-009 e o planejamento privado (RF01–RF19).
> **Revisado em 2026-10-29** com RF20–RF23 do planejamento (backlog vivo) e duas decisões
> do Pedro: a aba Mês mantém os blocos de estouro e de contas a pagar resumidos, e a
> gravidade da aba Atenção reusa âmbar e vermelho.
> **Substitui** `.design/app-completo/DESIGN_BRIEF.md`, que ficou vencido no mesmo dia.
> **Escopo:** só a interface. `src/financeiro/`, as migrations 001–004, RLS e o trigger de
> `invoice_month` não mudam. O que exigir banco entra como ADR (ver *Out of Scope*).
> Texto voltado ao usuário em português do Brasil.

## Problem

A v1 da interface foi construída e, lida de fora, não responde o que promete.

Ela diz "celular primeiro" e põe **dez páginas numa barra lateral** que o celular
esconde atrás de um ícone. A tela inicial não dá uma resposta: dá **nove blocos**
competindo — sobra, gasto, guardado, renda, taxa de poupança, fatura, atenção, saldo por
conta e um gráfico — e nenhum número manda. **Cada página tem o seu próprio mês**, então
trocar para setembro no orçamento e abrir os cartões mostra outubro, sem nada avisar. A
mesma informação aparece em três telas com três formatos. **Cinco gráficos padrão** do
Streamlit dão à tela a cara de "dashboard de template" que o próprio brief da v1 listava
como anti-referência. E as colunas de dinheiro são texto já formatado, então clicar em
"Valor" ordena alfabeticamente: num extrato de 200 linhas, "qual foi meu maior gasto"
não tem resposta.

Para quem usa, o efeito é um só: o app tem tudo, e ainda assim a pergunta das 19h —
*"posso pedir esse delivery?"* — exige abrir três telas e fazer a conta de cabeça.

## Solution

Uma interface que responde essa pergunta na primeira linha da primeira tela, e organiza
tudo o mais como detalhe dela.

O app abre em **Resumo**, com um número grande — *quanto ainda posso gastar neste mês* —
e, embaixo, de cima para baixo: os quatro números que o compõem, onde o orçamento vai
estourar, o que há para pagar e quanto há em conta. Um **mês só, válido para todo o app**,
fica no topo do conteúdo, logo abaixo do título e do Lançar. Não há barra lateral. **Sete destinos** no topo, visíveis sem abrir
nada, no celular inclusive.

Lançar deixa de pedir classificação contábil e passa a perguntar o que aconteceu:
**Gastei, Recebi, Guardei, Paguei a fatura**. A transferência de soma zero, a perna de
pagamento e a finalidade do resgate continuam existindo no banco, derivadas da intenção
e mostradas como confirmação — nunca como pergunta.

As telas abandonam as caixas com borda e passam a se organizar como um extrato bem
diagramado: hierarquia por tamanho, peso e espaço, réguas finas separando seções, números
em fonte tabular alinhados pelo decimal. Cor aparece em três situações e só nelas: dentro,
perto e fora do previsto.

## Experience Principles

1. **Um número decide, o resto explica** — cada tela tem exatamente um número principal, e
   todo o resto da tela existe para explicar como ele se formou ou o que fazer com ele. Se
   dois números disputam o topo, um dos dois está na tela errada.
2. **A intenção é do usuário, a contabilidade é do sistema** — quem lança diz o que
   aconteceu na própria língua; traduzir isso em duas pernas de transferência, mês de
   fatura e finalidade de resgate é trabalho do app. O que o sistema derivou aparece como
   confirmação antes de salvar, nunca como campo a preencher.
3. **Cor é significado, não decoração** — verde, âmbar e vermelho querem dizer dentro,
   perto e fora do previsto; na aba Atenção, vermelho é *crítico* e âmbar é *atenção*, o
   mesmo sentido de "fora" e "perto". A interface inteira é neutra para que, quando uma cor
   aparecer, ela seja a informação. Estado nunca vem só por cor: tem rótulo escrito.

## Aesthetic Direction

- **Philosophy**: *Swiss/International* aplicado a dado financeiro — grade, tipografia e
  espaço fazem a hierarquia; nenhum enfeite carrega significado. Densidade alta, sem
  aperto.
- **Tone**: sério, factual e calmo. O app informa; não parabeniza, não alarma, não
  aconselha. Nenhuma exclamação, nenhum emoji, nenhum adjetivo onde cabe um número.
- **Reference points** (revistos em 2026-10-29, depois de ver a v1 rodando): a lista de
  movimentações de um app de banco digital — cada linha com nome e detalhe à esquerda e
  valor à direita, agrupada por dia ou por seção; a tela de carteira de um rastreador de
  investimentos (Investidor10, Kinvo): patrimônio, rentabilidade contra referência,
  proventos e alocação, cada um com o seu gráfico. Do demonstrativo fica só o alinhamento
  do valor e o total separado por régua.
- **Anti-references**: gradiente; cartão decorativo com sombra; ícone grande como
  ornamento; gráfico de pizza; dashboard de template com quatro KPIs iguais em fila;
  **grade de cartões de mesmo peso**; **tabela com cara de planilha** (linhas de grade,
  cabeçalho cinza, coluna para tudo) onde uma lista resolve; linguagem de aplicativo de
  banco de varejo ("Seus objetivos estão incríveis!").

## Existing Patterns

Levantamento do código (sem Tailwind, sem MUI/Chakra/shadcn, sem Storybook, sem token
JSON, sem fonte externa; `package.json` só tem a CLI do Neon):

- **Typography**: a sans-serif do tema do Streamlit, sem customização. Existe o token
  `--fin-font-numeric` (ui-monospace/SF Mono/Menlo) e `font-variant-numeric: tabular-nums`
  na classe `.fin-valor`. **Mantém e amplia:** todo número monetário passa a ser tabular.
- **Colors**: `.streamlit/config.toml` com `primaryColor = #1f6f54` (claro) e `#5fc9a0`
  (escuro); `app/estilo/tokens.css` com neutros, três cores de estado em dois modos e
  fundos de selo. **Muda:** a primária vira grafite neutra, porque hoje verde é ao mesmo
  tempo "botão" e "dentro do orçamento" — duplo sentido na mesma cor. As três cores de
  estado ficam, reservadas.
- **Spacing**: escala de 4 px (`--fin-space-1` a `--fin-space-5`) já declarada e usada.
  **Mantém**, acrescentando os passos que faltam para a nova densidade.
- **Components**: `app/componentes.py` (`selo`, `barra`, `linha_de_orcamento`, `metrica`,
  `seletor_de_mes`, `tabela`, `botao_lancar`, `dialogo_lancar`), `app/layout.py`
  (`cabecalho`, `titulo`), `app/estilo/__init__.py` (injeção de CSS via `st.html`).
  **Mantém a costura, troca a implementação.**
- **Costura de dados**: `app/dados.py` devolve os modelos de `app/modelos.py` com
  `DADOS_DE_EXEMPLO = True` e 47 marcas `TODO(claude-code)`. **Mantém como está** — é o
  que permite redesenhar tudo sem banco. Assinaturas mudam só onde a tela nova exige
  número que não existia.
- **Fixo por decisão**: `app/composicao.py` (pool, unidade de trabalho, resolução de
  sessão), `streamlit_app.py` como ponto de entrada na raiz, `PROVEDOR_OIDC = "google"`,
  `st.login`/`st.logout`, e os módulos de `src/financeiro/`.

## Component Inventory

| Component | Status | Notes |
| --- | --- | --- |
| Navegação no topo | Modify | Barra própria: `st.page_link` dos 7 destinos numa linha rolável, `st.navigation(position="hidden")` por baixo. O `position="top"` do Streamlit foi descartado em 2026-10-29: abaixo de ~640 px ele manda os destinos para a lateral recolhida |
| Tarja de dados fictícios | Modify | Uma linha permanente acima da navegação, em HTML próprio. Hoje é `st.warning` de largura cheia repetido por página. Funde o aviso de demonstração e o de pré-visualização |
| Lateral de contexto | Remove | Decisão de 2026-10-29: sem mês e com Lançar em toda página, ela só teria Sair. Entrar com Google vai para a tarja da demonstração; nome e Sair, para Ajustes |
| Seletor de mês global | Modify | Uma linha, centralizada: ‹ Outubro de 2026 ›, botões compactos de 44 px, logo abaixo do título. Estado único em `st.session_state`. Hoje são 4 instâncias e, no celular, os botões viram faixas de largura cheia empilhadas |
| Coluna de leitura | New | CSS: largura máxima ~1.040 px, centralizada, com `layout="wide"` por baixo |
| Número principal (`destaque`) | New | Rótulo em caixa alta pequena, valor grande em fonte tabular, linha de contexto embaixo. Um por tela |
| Régua de números (`regua`) | New | Rótulo à esquerda, valor à direita, alinhado pelo decimal, com linha fina entre itens e total separado. Substitui as filas de `st.metric` em caixa |
| Selo de estado | Exists | `.fin-selo` com rótulo escrito. Mantido; passa a ser a única fonte de cor |
| Barra previsto × realizado | Modify | Mantém a forma; passa a ser usada só no Orçamento e no Resumo, não em toda tela |
| Lista de valores | New | Componente padrão para dado em linhas: título e detalhe à esquerda, valor tabular à direita, selo opcional, régua fina entre linhas, cabeçalho de grupo (dia, seção). Substitui a tabela em Saldo nas contas, Faturas, Cofrinhos, Carteira e Lançamentos |
| Tabela de valores | Modify | `st.dataframe` com `NumberColumn(format="accounting")` fica só onde ordenar e filtrar muitas linhas é o trabalho: a visão "tabela" opcional de Lançamentos e a revisão de importação |
| Diálogo Lançar por intenção | Modify | Quatro intenções antes de qualquer campo; o tipo contábil é derivado e confirmado |
| Prévia do mês da fatura | Exists | Já existe no diálogo; passa a ser a única sinalização de "esta compra não é deste mês" (decisão do grill) |
| Confirmação de fatura paga | New | Lançamento retroativo que cai em fatura quitada exige caixa de confirmação, com o efeito no orçamento daquele mês |
| Alargador de período | New | Em Lançamentos: este mês · 3 meses · 12 meses · tudo, dentro dos filtros |
| Linha de fatura | Modify | Item da lista de valores: mês de vencimento e situação à esquerda, total e "falta R$ X" à direita, selo de situação. A situação "paga" passa a vir da coluna nova (ADR-010) |
| Linha de cofrinho | Modify | Item da lista de valores: nome e "deveria ter" à esquerda, saldo e barra da meta à direita, "a devolver" como selo |
| Gráfico de patrimônio | Modify | Vira área empilhada por classe (cofrinhos, renda fixa, FIIs), na aba Patrimônio de Investimentos (RF22, Fase 2) |
| Gráfico de compromisso por fatura | Modify | Barra **horizontal** (compara valores melhor que coluna), em Cartões |
| Fluxo de importação | Modify | Deixa de ser destino; vira um `st.dialog` ou seção aberta de Lançamentos |
| Aba de Acesso | Modify | Deixa de ser destino; vira aba de Ajustes, ainda condicionada a `is_admin` |
| Abas do Resumo | New | `st.tabs`: **Mês** (padrão) e **Atenção (n)**, n = itens críticos + de atenção (RF20) |
| Item de atenção | New | Linha com selo de gravidade (crítico · atenção · informativo), texto curto com valor, ação direta e "lembrar amanhã" / "resolvido" |
| Bloco "Em risco" | New | Saídas que o saldo projetado não cobre, por data, ordem Essencial → Importante → Adiável, com quanto falta e o cofrinho que cobriria como opção de empréstimo |
| Diálogo conta recorrente | New | Nome, valor fixo ou "varia", vencimento, frequência, categoria, conta, urgência, lembrete, vigência; aberto de "+ Conta recorrente" e editável em Ajustes |
| Copiar resumo do mês | New | Botão na aba Mês; diálogo com `st.code` (ícone de copiar nativo) e instrução final editável. Nada sai do app (RF21) |
| Módulo de gráficos | New | `app/graficos.py`, Altair com o tema dos tokens; nenhuma página monta gráfico por conta própria (RF22) |
| Gráficos de análise | New | Um por pergunta, título que é a conclusão, tooltip com valor exato e tabela equivalente; sem dado suficiente, a frase do porquê (RF22) |
| Importar posição por print | New | Na aba Carteira: upload de prints, revisão editável, soma conferida com o total do print, diferenças propostas como movimentos (RF23, Fase 2) |
| Tela de entrada | Remove | `app/entrada.py`, `escolher_demonstracao()` e `visitante_escolheu_demo()` saem. Visitante cai na demonstração com "Entrar com Google" na tarja |

## Revisão de 2026-10-29 — depois de ver a v1 rodando

O Pedro abriu cada tela da v1 no celular e no desktop. O que ele viu, e o que muda:

| O que ele viu | Causa | O que a v2 faz |
|---|---|---|
| Cartões iguais (sobra, gasto, guardado, renda, taxa, fatura) puxando o olho ao mesmo tempo; tamanhos diferentes no desktop | Grade de `st.metric` com borda, todos com o mesmo peso | Um `destaque` por tela; o resto em `regua` sem borda. Nenhuma grade de cartões |
| Faturas, saldo em conta e Lançamentos parecem planilha | `st.dataframe` para tudo, cabeçalho cinza e linhas de grade | **Lista de valores** (ver inventário). Tabela só como visão opcional em Lançamentos |
| Orçamento extenso, informação diferente demais junta | Linha de orçamento com barra, selo e legenda para cada categoria, sem agrupar | Lista por grupo de categoria, com o grupo recolhido mostrando só o total; detalhe ao abrir |
| Lançamentos repetitivo | Uma tabela de 7 colunas, todas iguais | Lista agrupada por dia, com o total do dia; ícone da categoria; ordenar por data ou valor |
| Botões de mês estranhos no celular; texto do mês descentralizado | `st.columns` empilhando três blocos em largura cheia | Seletor numa linha, centralizado, botões compactos |
| Lateral sem motivo | Só Lançar (repetido) e Sair | Removida (ver inventário) |
| Gráfico de investimento antiintuitivo no celular | Gráfico de linha padrão com eixo de datas apertado | Regras do RF22 para o celular e gráficos com o valor escrito no fim da série |
| Investimentos pouco específico | Uma tabela de FIIs e um gráfico | Ver *Investimentos como rastreador*, abaixo |

### Investimentos como rastreador

Referência: o que Investidor10 e Kinvo põem na tela de carteira — patrimônio consolidado,
rentabilidade contra CDI e índices, proventos recebidos e agenda, distribuição por classe,
metas. Adaptado ao que o Pedro faz (FIIs + Tesouro Selic + CDB, renda mensal, aportes de
R$ 500/mês com extras):

- **Resumo** (aba padrão): patrimônio, renda passiva do mês e média de 12 meses (o número
  que o objetivo dele mede), rentabilidade no mês, em 12 meses e desde o início contra CDI e
  IFIX, e a distância para a próxima marca de patrimônio (ex.: R$ 100 mil).
- **Carteira**: lista por ativo (cotas, preço médio, preço, variação contra o preço médio,
  P/VP, DY 12m, peso), agrupada por classe (papel, tijolo, logística, FI-Infra, renda fixa),
  com a alocação atual contra a meta de cada classe.
- **Proventos**: recebidos por mês (barras, previsto do mês destacado), agenda com data-com
  e data de pagamento, yield on cost por ativo.
- **Onde aportar**: o usuário informa o valor do aporte; o app distribui pelas metas de
  alocação dele e filtra pelos critérios dele (P/VP máximo, peso máximo por ativo,
  liquidez mínima), mostrando por que cada ativo entrou ou saiu. Critérios e metas ficam
  em Ajustes, editáveis.
- **Projeção**: patrimônio e renda mensal com premissas visíveis (aporte, DY, valorização),
  com faixa baixo–alto.

## Key Interactions

**Navegar no tempo.** O mês vive numa linha logo abaixo do título, em um controle só. Trocar o mês recarrega
todas as telas que dependem dele; Investimentos e Ajustes o ignoram, de propósito, e não
mostram o controle como se ele fizesse efeito.

**Lançar.** O botão abre um diálogo que começa com quatro intenções e nenhum campo:

- **Gastei** → valor, categoria, conta, data (hoje). Se a conta é cartão: parcelas e a
  frase *"entra na fatura que vence em MM/AAAA"* antes de salvar. Caixas opcionais para
  "paguei por outra pessoa" (vira valor a receber, não gasto) e "usei dinheiro de um
  cofrinho" (consome a categoria, não a renda do mês).
- **Recebi** → valor, categoria de receita, conta, data.
- **Guardei** → cofrinho, valor; e, se for saída, a finalidade do resgate (usado no
  objetivo, empréstimo que fica "a devolver", retirada definitiva). Aporte só abate dívida
  quando marcado como devolução.
- **Paguei a fatura** → cartão, qual fatura este pagamento quita, conta de origem, valor
  (parcial permitido).

Salvar fecha o diálogo e confirma com `st.toast`. Erro de valor aparece no diálogo, sem
fechar e sem perder o que foi digitado.

**Lançar em fatura já paga.** Quando a data escolhida joga a compra numa fatura quitada, o
diálogo diz em qual fatura ela cai, que ela foi paga e em que data, e qual passa a ser o
total do orçamento daquele mês. Uma caixa "Entendi, lançar mesmo assim" libera o salvar. O
fato aconteceu; o sistema registra fato, e apenas garante que ninguém registre sem saber.

**Ajustar o previsto.** No Orçamento, a coluna "previsto" é editável na própria linha e
vale só para o mês selecionado. O padrão que se repete todo mês é configuração e mora em
Ajustes → Categorias. A tela diz isso, em uma linha, abaixo da tabela.

**Pagar fatura.** Em Cartões, escolher a fatura que o pagamento quita (não só "pagar o
mês"), a conta de origem e o valor. Pagamento parcial deixa o resto em aberto, e a linha
da fatura passa a mostrar quanto falta.

**Ver mais lançamentos.** Lançamentos abre no mês global. Dentro dos filtros, o alargador
troca o período para 3 meses, 12 meses ou tudo — decisão explícita, com o total de linhas
e o período sempre escritos acima da tabela.

**Fonte de dado externo falhou.** Em Investimentos, nenhuma tela quebra: mostra o último
valor lido com a data da leitura e diz que a fonte falhou. Não existe botão "atualizar
agora" — quem escreve é o job agendado.

**Ver o que precisa de ação (RF20).** O Resumo abre na aba Mês. A aba Atenção tem
como número principal *a pagar até o fim do mês*, com a folga ou a falta logo abaixo;
depois o bloco "Em risco" e os demais itens por gravidade e data. Cada item tem a ação
direta (pagar, lançar, abrir), "lembrar amanhã" e "resolvido" — crítico não some por
mais de um dia. Sem itens, a aba diz "Nada pendente" e mostra o próximo vencimento.

**Mesma pendência em dois lugares, um cálculo só.** A aba Mês mantém, resumidos, até 3
categorias perto ou fora e as contas e faturas do mês. É duplicação aceita (decisão de
2026-10-29) com uma regra: os dois blocos leem os **mesmos itens** que a aba Atenção e
terminam num link para ela. Nenhuma tela calcula alerta por conta própria.

**Conta recorrente.** Conta pendente reduz "quanto ainda posso gastar" sem contar em
dobro com o previsto da categoria. Quando um lançamento parece quitar uma conta do mês,
o diálogo de lançar e a importação sugerem a ligação; o usuário confirma.

**Natureza da categoria (decisão do Pedro, 2026-10-29).** Ao criar uma categoria de
despesa, escolhe-se como ela é gasta:

| Natureza | Exemplo | No orçamento | Em "Onde ainda cabe" | No Lançar |
|---|---|---|---|---|
| Variável | Lanches, Mercado | conta normal | aparece, se ainda tem folga | gasto normal |
| Fixa | Muay thai | conta; 100% é o esperado, só alerta se passar | não aparece | gasto normal |
| Com cofrinho | Jogos → cofrinho Jogos | o previsto é a inserção mensal no cofrinho (fica em Guardado); só o gasto direto do salário pesa no gasto do mês | não aparece; o saldo do cofrinho vai no bloco "Nos cofrinhos" | pergunta a modalidade: **do cofrinho** (não pesa no mês), **do salário** (gasto do mês), **pôr no cofrinho** (transferência) |

Categoria com cofrinho só aparece em "Precisa de atenção" quando sai dinheiro do salário
além da inserção prevista: gasto direto do salário, ou inserção acima da prevista
(`LinhaDeOrcamento.fora_do_previsto`, com teste). A inserção mensal prevista é definida ao
criar o cofrinho.

"Onde ainda cabe" (Resumo, aba Mês) mostra só categoria variável com folga maior que zero,
da maior para a menor. Regra em `app.alertas.onde_ainda_cabe`, com teste.

**Copiar resumo do mês (RF21).** Diálogo com o texto pronto, sem descrição de
lançamento, nome de pessoa, banco, conta ou e-mail. O app não chama nenhuma IA.

**Gráficos de análise (RF22).** Revisam o limite de dois gráficos do ADR-011 (ver
adendo nele). Ficam em abas próprias e nunca disputam o número principal: Orçamento
ganha a aba **Evolução**; a aba Mês do Orçamento ganha "quem está comendo o dinheiro"
e o ritmo do mês abaixo da tabela. Pizza continua proibida.

## Responsive Behavior

Celular primeiro, e agora de verdade: a navegação no topo é o que torna isso possível.

- **≤ 640 px**: uma coluna. Navegação no topo, rolável na horizontal. **Lançar** no
  cabeçalho da página, junto ao título; o seletor de mês logo abaixo, numa linha só. Réguas de números
  empilham rótulo e valor na mesma linha (rótulo à esquerda, valor à direita), sem virar
  grade. Tabelas largas rolam na horizontal, com a coluna de data fixada.
- **641–1.040 px**: duas colunas onde houver par natural (previsto × realizado).
- **> 1.040 px**: o conteúdo para de crescer e centraliza. Até três colunas em grades de
  números. A tabela ganha espaço dentro da coluna de leitura, não além dela.
- **Alvos de toque** ≥ 44 px no celular, já previsto em `componentes.css`.
- **Gráficos no celular**: no máximo 6 meses no eixo e barras horizontais no lugar de
  colunas (RF22).

## Accessibility Requirements

- Contraste mínimo **4,5:1** para texto e **3:1** para elemento gráfico de interface, nos
  dois modos (claro e escuro), verificado token por token.
- **Estado nunca só por cor**: todo selo traz o rótulo escrito ("dentro", "perto", "fora"),
  e a barra de orçamento tem `role="img"` com `aria-label` dizendo o valor e o previsto.
- **Rótulo em todo campo.** Onde o rótulo é redundante na tela, usar
  `label_visibility="collapsed"`, nunca `label=""`.
- Foco visível em todo controle, com contorno que não dependa da cor primária.
- Tabela de dados navegável por teclado (o `st.dataframe` já entrega) e com cabeçalho de
  coluna legível por leitor de tela — nada de coluna chamada só "R$".
- Número grande de destaque não substitui texto: o rótulo acima dele é texto normal,
  selecionável e lido antes do valor.
- A tarja de dados fictícios é a primeira coisa do conteúdo, antes da barra de navegação
  (que é nossa, no corpo da página; só o cabeçalho do Streamlit vem antes), para
  que um leitor de tela a anuncie antes de qualquer número.

## Out of Scope

- **Ligar os casos de uso.** `app/dados.py` continua devolvendo dados de exemplo com
  `DADOS_DE_EXEMPLO = True`. Toda pendência segue marcada com `TODO(claude-code)` e
  listada em `docs/pendencias-da-ui.md`. **Nenhum número desta interface é real.**
- **`src/financeiro/`, migrations 001–004, RLS e o trigger de `invoice_month`.** Não são
  tocados. A migration 005 que acompanha esta leva (`settles_invoice_month` e
  `app_users.is_admin`) é aditiva, aplicada em local e no branch `dev` do Neon, e **não**
  em `production`.
- **O modelo recorrente de previsto.** Decisão registrada como pendente em ADR-013, com as
  perguntas abertas listadas e sem migration. A tela de Orçamento edita o ajuste do mês; o
  padrão recorrente aparece em Ajustes lendo o exemplo.
- **Parser de PDF do PicPay, OFX do Inter, OCR de fatura, scraping de cotação e
  classificador de categorias.** A interface de importação existe e revisa linha a linha,
  sobre uma prévia de exemplo.
- **Exportação em CSV e edição de lançamento existente** (Fase 3, RF13): botão presente e
  desabilitado, com o motivo no `help`.
- **Recomendação de analista.** Investimentos sugere onde aportar **pelas regras que o
  próprio usuário define** (metas de alocação, P/VP máximo, peso máximo por ativo) e mostra
  por que cada sugestão saiu. Não diz "compre X" por conta própria, não prevê preço, e a
  tela diz isso numa linha.
- **Monitor de disponibilidade e qualquer serviço pago** (ADR-002, ADR-009).
- **Banco e domínio de RF20–RF23**: `recurring_bills`, `alert_snoozes`,
  `v_bills_month`, o módulo `alerts`, o OCR com Tesseract e os parsers por layout.
  A interface mostra tudo sobre dados de exemplo em `app/dados.py`, com
  `TODO(claude-code)`. Aviso fora do app (e-mail) fica para depois.
- **Gráficos e telas de Investimentos e o OCR de prints** são Fase 2: entram como
  pré-visualização sobre exemplo, marcados como tal.
