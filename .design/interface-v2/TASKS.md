# Build Tasks: Financeiro pessoal — interface v2

Generated from: `.design/interface-v2/DESIGN_BRIEF.md` e `INFORMATION_ARCHITECTURE.md`
Date: 2026-10-28 · revisado 2026-10-29 com RF20–RF23 (marcados abaixo)

> **Filosofia (vale para toda tarefa):** Swiss/International aplicado a dado
> financeiro. Hierarquia por tamanho, peso e espaço; régua fina no lugar de caixa
> com borda; número em fonte tabular; cor **só** para dentro · perto · fora, sempre
> com rótulo escrito. Tokens em `app/estilo/tokens.css`, espelhados em
> `.streamlit/config.toml` e conferidos por `tests/unit/test_tokens_espelham_tema.py`.
>
> **Regra de verificação:** uma tarefa só é marcada depois de **vista rodando** no
> Streamlit (desktop 1280 e celular 375, claro e escuro). Ruff, mypy e pytest são
> necessários, não suficientes. Se não der para abrir o app, a tarefa fica aberta e
> isso é dito — não substituído por checagem parcial.

## Pendências da fase de tokens (bloqueiam a Fundação)

- [x] **Validar chaves de tema no Streamlit 1.65.0** (2026-10-28: 60 chaves usadas, 0 inexistentes): rodar `_validar_tema.command`
  e remover do `config.toml` toda chave listada em `USADAS_INEXISTENTES`. Pronto quando
  a lista vier vazia. _Modifica: `.streamlit/config.toml`._

## Foundation

- [x] **CSS de componentes nos tokens v2** (2026-10-29, visto no app: 375 e 1280 px, claro e
  escuro; selo 11px, campo 16px no celular, foco com anel grafite, toque 44px): reescrever `app/estilo/componentes.css`
  só com os nomes novos (`--fin-dentro`, `--fin-e-*`, `--fin-texto-2`…); hoje ele usa
  14 tokens da v1 que não existem mais. Inclui coluna de leitura (máx.
  `--fin-largura-leitura`, centralizada), foco visível com `--fin-sombra-foco` e alvo
  de toque ≥ 44 px. Pronto quando `grep -o 'var(--fin-[a-z0-9-]*' componentes.css`
  só retornar tokens definidos — vira assert no teste de tokens. _Modifica._
- [x] **Casca: navegação no topo, tarja e lateral de contexto** (2026-10-29, visto no app em
  375, 768 e 1280 px; barra própria no lugar de `position="top"` — adendo do ADR-011.
  Sem rota até suas tarefas: Importar, A receber, Acesso) (risco alto, primeiro
  a validar no celular): `streamlit_app.py` com `st.navigation(position="top")`, 7
  `st.Page` com `url_path` explícito; tarja de dados fictícios como primeiro elemento
  do DOM (demonstração vs. pré-visualização); lateral com mês global → Lançar → quem
  está na sessão → entrar/sair. Remove `app/entrada.py`, `escolher_demonstracao()` e
  `visitante_escolheu_demo()`. Páginas antigas viram stub até sua tarefa. Pronto quando
  as 7 rotas abrem, a barra cabe em 375 px (rolando na horizontal se preciso) e
  visitante cai direto no Resumo. _Modifica: `streamlit_app.py`, `app/layout.py`,
  `app/composicao.py`; remove `app/entrada.py`; atualiza `test_app_esqueleto`._
- [x] **Mês global e fim da lateral** (2026-10-29, visto no app: 375 e 1280 px, mês
  centralizado, estado único entre páginas, setas com nome acessível) (revisada em 2026-10-29): um controle em
  `st.session_state`, substituindo as 4 chaves (`mes_visao_geral`, `mes_orcamento`…).
  Uma linha centralizada ‹ Outubro de 2026 › logo abaixo do título, botões compactos de
  44 px, em toda largura; ausente em Investimentos e Ajustes. A lateral sai: "Entrar com
  Google" vai para a tarja da demonstração, nome e "Sair" para o topo de Ajustes. Pronto
  quando trocar o mês numa tela muda todas e o celular mostra o seletor numa linha só.
  _Modifica: `componentes.seletor_de_mes`, `layout`, `streamlit_app.py`._
- [x] **Componentes de leitura: `destaque` e `regua`** (2026-10-29, `app/blocos.py`): número principal (rótulo em
  caixa alta `--fin-t-xs`, valor `--fin-t-2xl`/`3xl` tabular, linha de contexto) e
  régua rótulo-à-esquerda/valor-à-direita com variante de total por régua dupla.
  Substituem `metrica`. Pronto quando renderizam nos dois modos e o valor alinha pelo
  decimal. _Novos; remove `componentes.metrica`._
- [x] **Lista de valores** (2026-10-29, `app/blocos.py`; vista em 375 e 1440 px) (nova em 2026-10-29: "parece planilha"): componente de linhas
  com título e detalhe à esquerda, valor tabular à direita, selo opcional, régua fina entre
  linhas e cabeçalho de grupo com total. É o padrão para saldo nas contas, faturas,
  cofrinhos, carteira e lançamentos. Pronto quando renderiza nos dois modos, com 375 e 1280
  px, sem linha de grade nem cabeçalho cinza. _Novo._
- [ ] **Tabela com dinheiro numérico** (só para a visão "tabela" opcional de Lançamentos e a
  revisão de importação): `componentes.tabela` passa `Decimal` como
  número e usa `NumberColumn(format="accounting")`. **Verificar primeiro** como o
  `accounting` do 1.65 mostra moeda e separador pt-BR; se não servir, usar `printf`
  com `R$ %.2f` e registrar a escolha. Pronto quando ordenar por "Valor" ordena por
  valor. _Modifica._
- [ ] **`selo` e `barra` nos tokens novos**: selo com rótulo escrito sempre, com variantes
  de gravidade (crítico · atenção · informativo → `--fin-critico`/`--fin-atencao`/
  `--fin-informativo`); barra com `role="img"` e `aria-label` (valor e previsto). _Modifica._
- [x] **[RF22] Módulo de gráficos** (2026-10-29, `app/graficos.py`): `app/graficos.py` com tema Altair lido dos tokens
  (rampa `--fin-grafico-cat-1..7`, previsto em `--fin-grafico-previsto`, separador de 1px),
  título-conclusão, tooltip com valor exato, tabela equivalente, frase quando há menos de 2
  meses, e regra do celular (≤ 6 meses, barras horizontais). `Decimal` → `float` só aqui
  (ADR-012). Pronto com um gráfico de amostra visto nos dois modos. _Novo._
- [ ] **[RF20–RF23] Dados de exemplo**: em `app/dados.py`, contas recorrentes, itens de
  atenção com gravidade, série de 12 meses por grupo, prévia de leitura de print, cada um
  com `TODO(claude-code)` e listado em `docs/pendencias-da-ui.md`. Regras de alerta ficam
  para o domínio; aqui só exemplos fixos. Inclui o modo demo (RF20 pede alertas fictícios
  no portfólio). _Modifica._

### Achados ao rodar a primeira tarefa (2026-10-29)

- Tema do Streamlit nunca tinha sido aplicado: `metricValueFontSize = 32` (int num campo
  texto do protocolo) derrubava o tema inteiro, sem erro. Corrigido; teste de tipos contra o
  protocolo.
- `baseFontSize = 15` muda o `<html>`: 1rem = 15px. Escala em rem recalculada; teste amarra
  cada passo ao px.
- Um `<` num comentário do CSS fazia o `st.html` descartar o estilo inteiro. Teste proíbe `<`.
- `_css()` com `@cache` simples não via edição de CSS; cache agora segue o mtime dos arquivos.
- Fontes: `font = "sans-serif"` do Streamlit é a Source Sans embutida (servida pelo app, sem
  CDN). Os tokens `--fin-fonte*` ainda dizem pilha do sistema: alinhar na tarefa de
  `destaque`/`regua`.
- [ ] **Bug v1, cifrão como LaTeX**: texto com dois `R$` passa por markdown e o trecho entre
  os `$` vira fórmula ("Renda R 4.850,00 − gasto R…"). Toda saída de `brl()` em markdown
  precisa escapar o `$`; teste com `AppTest` procurando `stMarkdownContainer` com `katex`.

### Revisão visual de 2026-10-29 (depois do retorno "nada mudou")

- Acento azul `#2b55d0`/`#8eabff` no lugar do grafite; paleta de gráfico com seis matizes.
- Base 16px (era 15) e coluna de 1.200px (era 1.040): "a tela parece diminuída".
- Valores na fonte do app com algarismos tabulares (a mono pesava).
- `data-theme` sincronizado com o tema real do Streamlit (os tokens seguiam o sistema e
  deixavam texto claro sobre fundo claro nos alertas).

## Core UI

- [x] **Resumo → aba Mês** (2026-10-29; falta Copiar resumo, RF21) (agora com abas Mês · Atenção (n)): *Quanto ainda posso gastar* (destaque, com dias restantes e quanto
  cabe por dia) → régua gasto/guardado/renda/sobra → até 3 categorias perto/fora →
  a pagar no mês → saldo nas contas. Sem gráfico, sem patrimônio. Sem cartão
  hardcoded (o `"Unicred"` de `visao_geral.py:72` some). Blocos de estouro e a pagar leem os
  mesmos itens da Atenção e terminam em "ver tudo em Atenção (n)"; contas recorrentes
  pendentes entram no a pagar e reduzem o número principal. _Substitui
  `visao_geral.py`; usa destaque, regua, selo, barra. `dados.resumo_do_mes` pode
  precisar de "previsto total" e "dias restantes"._
- [x] **[RF20] Resumo → aba Atenção** (2026-10-30: a pagar até o fim do mês com folga/falta, "Em risco" com o cofrinho que cobre, itens com ação direta, "lembrar amanhã" e "resolvido" (crítico volta no dia seguinte), "+ Conta recorrente", vazio com o próximo vencimento; regras em `app/alertas.py` com `tests/unit/test_atencao.py`; tela em `app/atencao.py`. Adiar, resolver e pagar vivem na sessão até `alert_snoozes` e `recurring_bills`) (risco alto: muita regra, pouco espaço no celular):
  número *a pagar até o fim do mês* com folga/falta, bloco "Em risco" em ordem Essencial →
  Importante → Adiável com o cofrinho como opção de empréstimo, itens por gravidade e data
  com ação direta, "lembrar amanhã" e "resolvido", contagem na aba, vazio com "Nada
  pendente" e o próximo vencimento. _Novo; usa destaque, regua, selo._
- [ ] **[RF21] Copiar resumo do mês**: botão no fim da aba Mês; diálogo com `st.code` e
  instrução editável. Texto montado por função pura com teste garantindo que nenhuma
  descrição, pessoa, banco, conta ou e-mail aparece. _Novo._
- [x] **Orçamento → aba Mês** (2026-10-29: destaque + régua, grupos recolhíveis com `<details>`; gráficos do RF22 ainda não) (revisada: "extensa demais"): categorias agrupadas por grupo,
  cada grupo recolhido mostrando só total e selo, detalhe ao abrir; previsto editável (só o mês),
  total separado por régua, seção "Guardado no mês", linha de renda acima do previsto
  e nota apontando Ajustes → Categorias. Abaixo da tabela, "quem está comendo o dinheiro" e o ritmo do mês (RF22). _Modifica
  `orcamento.py`; depende de Tabela e Módulo de gráficos._
- [ ] **[RF22] Orçamento → aba Evolução**: gasto por grupo mês a mês (empilhado, 6–12
  meses, "Outros" além de 6), categorias que mais cresceram (barras divergentes contra a
  média dos 3 anteriores) e uma categoria no tempo com seletor. Período próprio, sem mês
  global. _Novo; depende de Módulo de gráficos._
- [x] **Diálogo Lançar por intenção** (2026-10-29, `app/lancar.py`; visto no app: as quatro intenções, prévia da fatura, fatura já paga trava o Salvar, devolução a cofrinho, categoria paga por cofrinho): Gastei · Recebi · Guardei · Paguei a fatura
  antes de qualquer campo; tipo contábil derivado e mostrado como confirmação; prévia
  "entra na fatura que vence em MM/AAAA"; toast ao salvar; erro sem fechar nem perder
  o digitado. _Modifica `componentes.dialogo_lancar` (risco alto: ~10 campos
  condicionais hoje)._
- [x] **Lançamentos** (2026-10-29: lista por dia, 8 primeiros + "Mostrar todos", transferência numa linha; falta visão tabela e importar) (revisada: "repetição e padronização de tabela"): lista de valores
  agrupada por dia com o total do dia, ordenar por data ou valor; visão "tabela" opcional;
  período e contagem acima, filtros em `st.popover`
  com alargador (este mês · 3 · 12 meses · tudo), botão Importar
  extrato abrindo diálogo, nota de regra. _Modifica `lancamentos.py`; absorve
  `importar.py` como diálogo._
- [x] **Cartões** (2026-10-29: destaque, Pagar em primeiro, faturas e compras em lista): fatura aberta (destaque) → pagar fatura → já comprometido →
  faturas por mês de vencimento como lista de valores (não tabela) com situação e quanto falta → barra horizontal de
  compromisso → detalhe → rodapé de fechamento/vencimento. `st.pills` para escolher
  cartão. _Modifica `cartoes.py`._
- [x] **Cofrinhos com aba A receber** (2026-10-29; diálogos de A receber em `app/dialogos.py`): dois destaques (guardado, a devolver), lista de
  valores de cofrinhos no lugar dos cartões com 4 métricas; aba A receber com seção por
  pessoa e histórico em expansor. _Modifica `cofrinhos.py`; absorve `a_receber.py`._
- [x] **Investimentos → Resumo** (2026-10-29) (revista em 2026-10-29: "pouco específica"; referência
  Investidor10 e Kinvo): patrimônio (destaque) com variação no mês, renda passiva do mês e
  média de 12 meses, rentabilidade no mês/12 meses/desde o início × CDI e IFIX com linha do
  acumulado rotulada no fim, próxima marca de patrimônio no ritmo de aporte, área por
  classe. Sem mês global. Gráficos seguindo a regra do celular. _Modifica
  `investimentos.py`; depende de Módulo de gráficos e Lista de valores._
- [x] **Investimentos → Carteira e Proventos** (2026-10-29): alocação × meta por classe; ativos em lista
  de valores agrupada por classe (valor, variação × preço médio, peso; P/VP e DY 12m como
  detalhe); proventos recebidos por mês, agenda de data-com e pagamento, yield on cost.
  _Modifica._
- [x] **Investimentos → Onde aportar e Projeção** (2026-10-29; regra em `app/carteira.py` com 5 testes; critérios ainda fixos, Ajustes → Investimentos falta): valor do aporte (padrão R$ 500) →
  distribuição por classe abaixo da meta e por ativo, filtrada pelos critérios do usuário
  (P/VP máximo, peso máximo, liquidez mínima), cada linha com o motivo; linha fixa "pelas
  suas regras, não é recomendação de analista". Regra como função pura com teste. Projeção
  com premissas e faixa. _Novo._
- [ ] **[RF23] Importar posição por print** (Fase 2, pré-visualização): upload na aba
  Carteira, revisão editável por linha com o tipo reconhecido (FII · Tesouro Selic · CDB ·
  não reconhecido), aviso quando a soma não bate com o total do print, diferenças
  propostas como movimentos a confirmar. Sem OCR real: prévia de exemplo. _Novo; mesmo
  esqueleto do diálogo de importação._
- [~] **Ajustes em 7 abas** (2026-10-29: listas no lugar de tabelas e cartões, aba Investimentos só leitura; faltam Contas recorrentes e Acesso, e renomear o arquivo): nome e "Sair" no topo, fora das abas; Contas → Cartões →
  Categorias (com previsto padrão) → Contas recorrentes (RF20, com os prazos dos alertas) →
  Investimentos (metas de alocação e critérios do "Onde aportar") → Regras → Acesso (só
  `is_admin`). Sem mês global. _Renomeia `configuracoes.py` para
  `ajustes.py`; absorve `acesso.py`._

- [x] **Densidade** (2026-10-30, "espaço aberto demais"): cabeçalho numa linha (título,
  mês, Lançar); destaque com a régua e barras de ritmo dentro; painel destaque + quadro
  lateral de mesma altura (`blocos.colunas`/`quadro`) em Resumo, Orçamento, Cartões,
  Cofrinhos e Investimentos. Visto em 1280 (claro e escuro) e 375.
- [x] **Onde ainda cabe** (2026-10-29): grade no Resumo, só categoria variável com folga.
- [x] **Natureza da categoria no banco** (2026-10-30): [ADR-014](../../docs/adr/014-natureza-da-categoria-e-cofrinho.md)
  e `migrations/006-natureza-da-categoria.sql` (+ rollback e teste de integração).
  `categories.nature` + `goal_account_id`, `goal_contributions` (inserção prevista com
  vigência) e `transactions.funds_expense_id` (o resgate aponta a despesa que pagou).
  Aplicada no banco local; integração verde (141). Falta: ligar `budgeting` à regra
  do Resumo quando a Fase 1 trocar os dados de exemplo pelo banco. Atualizar o
  planejamento (modelo de dados: +1 tabela, `goal_contributions`).

## Interactions & States

- [ ] **Diálogos de ação no mesmo esqueleto**: contexto → campos → confirmação →
  `st.toast` → `st.rerun`, para pagar fatura, aportar, resgatar (com finalidade),
  novo cofrinho, registrar recebimento e perdoar dívida. Covers: parcial, erro de
  valor, confirmação extra de reserva de emergência.
- [~] **[RF20] Diálogo conta recorrente** (2026-10-30: cadastro pronto, aberto da aba Atenção; faltam editar, pausar e encerrar em Ajustes, e o aviso de nova vigência): cadastrar, editar, pausar e encerrar (encerrar
  não apaga histórico); valor fixo ou "varia"; conta-cartão avisa que entra na fatura;
  mudar valor diz que cria nova vigência. Covers: validação, pausa, encerramento.
- [~] **[RF20] Pagar conta pelo item** (2026-10-30: "Pagar" abre um diálogo próprio com valor e conta; falta usar o Lançar preenchido e a sugestão de ligação): "pagar" abre o diálogo Lançar já preenchido e
  ligado à conta do mês; lançamento manual parecido (mesma descrição ou valor próximo,
  até 5 dias) sugere a ligação para o usuário confirmar. _Depende de: Diálogo Lançar._
- [x] **Lançar em fatura já paga** (2026-10-29, dentro do diálogo): aviso com fatura, data do pagamento e novo total
  do orçamento daquele mês; caixa "Entendi, lançar mesmo assim" libera o salvar.
  _Depende de: Diálogo Lançar._
- [ ] **Estados vazios e de falha**: mês sem lançamento, cartão sem fatura, nenhum
  cofrinho, fonte de cotação falhou (último valor + data da leitura, sem botão
  "atualizar"). Covers: vazio, falha, desabilitado com motivo no `help` (exportar
  CSV, editar lançamento).

## Responsive & Polish

- [ ] **Passe responsivo**: Lançar no cabeçalho da página no celular, réguas sem
  virar grade, tabelas rolando na horizontal com data fixada, até 3 colunas acima de
  1.040 px. Breakpoints: 375, 640, 768, 1040, 1280.
- [ ] **Passe de acessibilidade**: estado nunca só por cor; `label_visibility=
  "collapsed"` em vez de `label=""`; foco visível em todo controle; nenhum cabeçalho
  de coluna chamado só "R$"; tarja anunciada antes da navegação; linguagem sem
  exclamação, emoji ou "meu/minha" em rótulo.
- [ ] **Limpeza**: `docs/pendencias-da-ui.md` atualizado com os `TODO(claude-code)`
  que mudaram de lugar; testes de integração da casca e das 7 páginas com `AppTest`.

## Review

- [ ] **Design review**: `/design-review` contra o brief, com screenshots em
  `.design/interface-v2/screenshots/` (desktop, tablet, celular, escuro). Exige o app
  rodando.
