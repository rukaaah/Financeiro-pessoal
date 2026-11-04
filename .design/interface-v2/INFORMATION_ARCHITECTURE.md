# Information Architecture: Financeiro pessoal — interface v2

> Deriva de `.design/interface-v2/DESIGN_BRIEF.md` (grill-me de 2026-10-08).
> Estrutura existente que esta IA **estende, não substitui**: `streamlit_app.py` na raiz
> como ponto de entrada (exigência do Community Cloud), uma página por arquivo em
> `app/paginas/`, `st.navigation` montando as rotas, `app/composicao.py` resolvendo a
> sessão e `app/dados.py` como costura de dados.

## Site Map

Sete destinos. No Streamlit a rota vem de `st.Page(url_path=...)`, então os caminhos
abaixo são explícitos — sem acento e sem maiúscula, para não depender do que o framework
derivaria do título.

- **Resumo** `/` — padrão (`default=True`)
  - aba **Mês** (padrão)
  - aba **Atenção (n)** — RF20
  - *Conta recorrente* / *Copiar resumo do mês* — diálogos
- **Orçamento** `/orcamento`
- **Lançamentos** `/lancamentos`
  - *Importar extrato* — diálogo sobre a página, não rota
- **Cartões** `/cartoes`
  - *Pagar fatura* — diálogo
- **Cofrinhos** `/cofrinhos`
  - aba **Cofrinhos** (padrão)
  - aba **A receber**
  - *Aportar* / *Resgatar* / *Novo cofrinho* / *Registrar recebimento* / *Perdoar dívida* — diálogos
- **Investimentos** `/investimentos`
  - aba **Resumo** (padrão) — patrimônio, renda passiva, rentabilidade × CDI e IFIX
  - aba **Carteira** — ativos agrupados por classe, alocação × meta
  - aba **Proventos** — recebidos, agenda, yield on cost
  - aba **Onde aportar** — distribuição do aporte pelas regras do usuário
  - aba **Projeção**
  (revisado em 2026-10-29: "Patrimônio" virou "Resumo", e "Onde aportar" entrou)
- **Ajustes** `/ajustes`
  - aba **Contas**
  - aba **Cartões** — fechamento, vencimento, vigência
  - aba **Categorias** — inclui o previsto padrão que se repete todo mês
  - aba **Regras** — classificação por texto do extrato
  - aba **Contas recorrentes** — RF20, com os prazos dos alertas
  - aba **Acesso** — só com `is_admin`; a regra vale no banco, não na tela

Fora da hierarquia, presente em toda rota:

- **Lançar** — diálogo, chamado do cabeçalho de cada página
- **Tarja de dados fictícios** — primeira coisa do conteúdo, acima da navegação
- **Mês global** — linha logo abaixo do título, nas telas que dependem do mês

**Profundidade máxima: dois níveis** (destino → aba). Nada de terceiro nível: o que não
cabe em aba vira diálogo, e diálogo não é lugar de navegar, é de concluir uma ação.

### O que saiu, e para onde

| Era destino na v1 | Virou |
|---|---|
| Visão geral | **Resumo**, com 5 blocos em vez de 9 |
| Importar | Diálogo em **Lançamentos** |
| A receber | Aba de **Cofrinhos** |
| Configurações | **Ajustes** |
| Acesso | Aba de **Ajustes** |
| Tela de entrada (`app/entrada.py`) | Removida: visitante cai na demonstração, "Entrar com Google" fica na tarja |

## Navigation Model

- **Primary navigation** — barra própria (`layout.navegacao`: `st.page_link` numa linha rolável, com `st.navigation(position="hidden")` dono das rotas) com os 7 destinos, sem seções.
  O link ativo ganha peso e traço do acento, e a aba do navegador leva o nome da página.
  Sete é o teto: o oitavo item obriga a repensar o agrupamento, não a esticar a barra.
  Ícone Material + rótulo em cada item.
- **Secondary navigation** — `st.tabs` dentro de Cofrinhos, Investimentos e Ajustes. Aba é
  para **faces do mesmo assunto**, nunca para esconder etapa de um fluxo. Resumo,
  Lançamentos e Cartões não têm aba nenhuma. Resumo (Mês · Atenção) e Orçamento
  (Mês · Evolução) ganharam abas em 2026-10-29 com RF20 e RF22: são faces do mesmo
  assunto, não etapas.
- **Utility navigation** — **sem barra lateral** (decisão de 2026-10-29). Lançar fica no
  cabeçalho de cada página; o mês, logo abaixo; "Entrar com Google" na tarja da
  demonstração; nome de quem está na sessão e "Sair" no topo de Ajustes.
- **Mobile navigation** — a mesma barra, rolando na horizontal; o link ativo é centralizado
  ao abrir a página. É o motivo de a barra ser nossa: a `position="top"` do Streamlit
  some no celular. Nada de menu sanduíche e nada de barra inferior — a do topo já resolve.

## Content Hierarchy

### Resumo → aba Mês
1. **Quanto ainda posso gastar** — previsto do mês menos gasto realizado, com dias
   restantes e quanto cabe por dia. É a pergunta das 19h; vem antes de tudo e é o único
   número grande da tela.
2. **Os quatro números que o compõem** — gasto, guardado, renda, sobra, em régua. Explicam
   como o número de cima se formou; ninguém precisa deles para decidir, só para conferir.
3. **Onde vai estourar** — até 3 categorias fora ou perto do previsto, com previsto,
   realizado e selo. É o detalhe que muda a decisão: "não o delivery, então".
4. **A pagar neste mês** — contas recorrentes pendentes e faturas com vencimento no mês,
   valor e dia. Dinheiro já comprometido que ainda não saiu da conta.

   Os blocos 3 e 4 são um **resumo da aba Atenção**: leem os mesmos itens e terminam em
   "ver tudo em Atenção (n)". Duplicação aceita em 2026-10-29 para a pergunta das 19h
   não exigir troca de aba.
5. **Saldo nas contas** — uma linha por conta, com total. Último porque responde "tenho
   como pagar", que é pergunta de conferência, não de decisão.

6. **Copiar resumo do mês** — botão discreto no fim (RF21).

Fora daqui, de propósito: patrimônio e taxa de poupança (foram para Investimentos → aba
Patrimônio) e o gráfico de patrimônio. Nenhum dos dois muda a decisão de hoje.

### Resumo → aba Atenção (RF20)
1. **A pagar até o fim do mês** — número principal, com a folga ou a falta embaixo.
2. **Em risco** — saídas que o saldo projetado não cobre, por data, com quanto falta e a
   ordem sugerida (Essencial → Importante → Adiável).
3. **Itens** — por gravidade (crítico → atenção → informativo) e data, cada um com a ação
   direta, "lembrar amanhã" e "resolvido".
4. **+ Conta recorrente** — atalho para o diálogo.
5. **Vazio** — "Nada pendente" e o próximo vencimento.

### Orçamento → aba Mês
1. **Tabela única por categoria** — previsto, gasto, diferença, estado. É a tela inteira; a
   coluna "previsto" é editável e vale só para o mês selecionado.
2. **Total** — separado da tabela por régua, como em demonstrativo.
3. **Guardado no mês** — seção abaixo, não aba: transferido para cofrinhos e
   investimentos, com o planejado ao lado. Separado porque guardar não é gastar.
4. **Renda acima do previsto** — quando houver, uma linha dizendo quanto veio além da base.
5. **Onde mexer no padrão** — uma linha apontando Ajustes → Categorias.
6. **Quem está comendo o dinheiro** e **ritmo do mês** — gráficos abaixo da tabela (RF22).

### Orçamento → aba Evolução (RF22)
Gasto por grupo mês a mês (6 a 12 meses), categorias que mais cresceram contra a média dos 3
anteriores, e uma categoria no tempo (seletor). Mês global não manda aqui: o período é da aba.

### Lançamentos
1. **Período e contagem** — qual período está na tela e quantas linhas. Antes da tabela,
   porque a tabela mente se não se sabe o recorte.
2. **Filtros** — em `st.popover`: período (este mês · 3 meses · 12 meses · tudo), tipo,
   conta, categoria, texto.
3. **Tabela** — data, descrição, categoria, conta, fatura, cofrinho, valor. Ordenável por
   valor de verdade.
4. **Importar extrato** — botão que abre o fluxo de importação.
5. **Nota de regra** — compra no cartão entra no mês da fatura; transferência fica fora do
   gasto.

### Cartões
1. **Fatura aberta** — valor e quando vence. O número que decide se dá para gastar mais.
2. **Ação: pagar fatura** — logo abaixo do número que ela resolve.
3. **Já comprometido nas próximas** — soma das parcelas que ainda vão cair.
4. **Faturas por mês de vencimento** — tabela com situação e quanto falta.
5. **Compromisso por fatura** — gráfico de barra horizontal.
6. **Detalhe da fatura escolhida** — compras linha a linha.
7. **Fechamento e vencimento vigentes** — rodapé, com link para Ajustes. É configuração,
   não notícia.

### Cofrinhos → aba Cofrinhos
1. **Total guardado** e **total a devolver**.
2. **Tabela de cofrinhos** — saldo, meta, "deveria ter", adiantado/atrasado, a devolver.
3. **Ações por cofrinho** — aportar, resgatar.
4. **Novo cofrinho** — só o nome é obrigatório.

### Cofrinhos → aba A receber
1. **Total a receber** — com a nota de que entra no patrimônio, não no gasto.
2. **Uma seção por pessoa** — saldo e itens em aberto com dias.
3. **Ações** — registrar recebimento, perdoar dívida.
4. **Histórico de quitações** — em expansor.

### Investimentos → aba Resumo (revista em 2026-10-29)
1. **Patrimônio hoje** — número principal; abaixo, a variação no mês em R$ e %.
2. **Renda passiva** — proventos do mês e média de 12 meses: é o número que o objetivo do
   Pedro mede (renda mensal).
3. **Rentabilidade × referência** — no mês, em 12 meses e desde o início, contra CDI e
   IFIX. Gráfico de linha do acumulado, com o valor escrito no fim de cada linha.
4. **Próxima marca** — quanto falta para o próximo marco de patrimônio (ex.: R$ 100 mil) no
   ritmo de aporte atual.
5. **Patrimônio no tempo** — área empilhada por classe; aporte × rendimento × proventos.
6. **Taxa de poupança** — indicador de trajetória, no rodapé.

### Investimentos → Carteira
1. **Alocação × meta** — barra por classe (papel, tijolo, logística, FI-Infra, renda fixa)
   com a meta marcada; diferença escrita.
2. **Ativos** — lista de valores agrupada por classe: ticker e nome à esquerda; valor,
   variação contra o preço médio e peso à direita; P/VP e DY 12m como detalhe.
3. **Importar posição por print** (RF23, Fase 2).
4. Rodapé com a data da leitura e a fonte.

### Investimentos → Proventos
1. **Recebido no mês** e **previsto**, com o anunciado separado do estimado.
2. **Por mês** — barras de 12 meses, o mês atual destacado.
3. **Agenda** — data-com e pagamento dos próximos 30 dias.
4. **Yield on cost** por ativo.

### Investimentos → Onde aportar
1. **Valor do aporte** — campo, com o padrão de R$ 500.
2. **Distribuição sugerida** — por classe primeiro (o que está abaixo da meta recebe), depois
   por ativo, respeitando os critérios do usuário (P/VP máximo, peso máximo por ativo,
   liquidez mínima). Cada linha diz por que entrou; ativos barrados dizem por que saíram.
3. **Linha fixa**: "Sugestão pelas suas regras de Ajustes → Investimentos. Não é
   recomendação de um analista."

### Investimentos → Projeção
Premissas editáveis em cima (aporte, DY, valorização), resultado embaixo com faixa baixo–alto,
e a frase de que é uma conta com premissas visíveis, não previsão de mercado.

### Ajustes
No topo, fora das abas: nome de quem está na sessão e **Sair** (a lateral saiu em 2026-10-29).
Ordem das abas pela frequência de uso: **Contas → Cartões → Categorias → Contas recorrentes →
Investimentos (metas e critérios do "Onde aportar") → Regras → Acesso**. Acesso é a última e
só existe para quem administra.

## User Flows

### Fluxo 1 — Visitante chega sem login
1. Abre o app. **Não há tela de entrada** (decisão do grill).
2. `composicao.sessao_atual()` resolve a sessão; sem e-mail verificado na allowlist, o modo
   é `DEMO` (ADR-003).
3. A **tarja de dados fictícios** aparece antes da barra de navegação, permanente.
4. Cai em **Resumo**, com os dados do usuário demo.
   - Se clicar **Entrar com Google** na tarja → `st.login("google")`
     - e-mail na allowlist → modo `DONO`, tarja de demonstração sai
     - e-mail fora da allowlist → volta ao modo `DEMO`, com a tarja (ADR-003, validado na T9)

### Fluxo 2 — "Posso gastar isso?" (o caminho mais percorrido)
1. Abre em **Resumo**.
2. Lê **quanto ainda posso gastar** e o quanto cabe por dia.
   - Se o número é confortável → decide e segue para o Fluxo 3.
   - Se é apertado → bloco 3, **onde vai estourar**, mostra qual categoria estourou.
   - Se há fatura grande a pagar → bloco 4 mostra o compromisso.
3. Para o detalhe, **Orçamento** (por categoria) ou **Lançamentos** (linha a linha).

### Fluxo 3 — Lançar um gasto
1. **Lançar**, no cabeçalho da página.
2. Escolhe **Gastei**.
3. Valor, categoria, conta; data = hoje.
   - Conta é cartão → aparece **parcelas** e a frase *"entra na fatura que vence em
     MM/AAAA"*.
   - Data joga numa **fatura já paga** → aviso com o efeito no orçamento daquele mês +
     caixa "Entendi, lançar mesmo assim" para liberar o salvar.
   - "Paguei por outra pessoa" → escolhe quem e, opcionalmente, a parte dela; vira valor a
     receber, não gasto (RF17).
   - "Usei dinheiro de um cofrinho" → escolhe o cofrinho; consome a categoria, não a renda
     do mês.
4. **Salvar** → diálogo fecha, `st.toast` confirma, a tela recarrega com o número principal
   já atualizado.

### Fluxo 4 — Pagar a fatura
1. **Cartões** (ou pelo bloco "a pagar" do Resumo).
2. **Pagar fatura** → escolhe **qual fatura este pagamento quita** (ADR-010), a conta de
   origem e o valor.
   - Valor igual ao total → fatura fica **paga**.
   - Valor menor → fica **parcial**, e a linha mostra quanto falta.
3. A fatura muda de situação; o pagamento **não** entra como despesa nem recebe
   `invoice_month` de compra (ADR-007).

### Fluxo 5 — Guardar e resgatar
1. **Lançar → Guardei**, ou **Cofrinhos → Aportar/Resgatar**.
2. Saída exige **finalidade**: usado no objetivo, empréstimo (fica "a devolver") ou retirada
   definitiva (RF18).
   - Reserva de emergência + finalidade "usado" → confirmação extra.
3. Entrada pergunta se é **devolução** quando há dívida: sem marcar, conta como guardado
   novo e a dívida continua.

### Fluxo 6 — Importar extrato
1. **Lançamentos → Importar extrato**.
2. Escolhe a conta, envia o PDF.
3. Revisa linha a linha: incluir, categoria sugerida, duplicada vem desmarcada.
4. Confere o fechamento pelo saldo diário; divergência aparece antes do botão.
5. **Confirmar** → tudo numa transação só. Nada é gravado antes da confirmação.

### Fluxo 7 — Ajustar o previsto do mês
1. **Orçamento**, com o mês global no mês desejado.
2. Edita o **previsto** na linha da categoria → vale só para este mês.
3. Para mudar o padrão de todo mês: **Ajustes → Categorias**.

### Fluxo 8 — Liberar acesso a outra pessoa (admin)
1. **Ajustes → Acesso** (aba só visível com `is_admin`).
2. Informa e-mail e nome → a função `SECURITY DEFINER` do banco valida e grava (RF19).
3. Esconder a aba não protege nada: a regra vive no banco.

### Fluxo 9 — Resolver o que precisa de ação (RF20)
1. **Resumo → Atenção (n)**, ou "ver tudo" no fim dos blocos 3 e 4 da aba Mês.
2. Lê **a pagar até o fim do mês** e a folga ou falta.
   - Há bloco **Em risco** → paga na ordem sugerida; se um cofrinho cobriria, a opção
     aparece já como empréstimo (RF18). O app nunca resgata sozinho.
3. Em cada item: **ação direta** (pagar → diálogo de lançar já preenchido e ligado à conta
   do mês; lançar; abrir a tela), **lembrar amanhã** ou **resolvido**.
4. A contagem da aba cai; crítico adiado volta no dia seguinte.

### Fluxo 10 — Cadastrar conta recorrente (RF20)
1. **Atenção → + Conta recorrente**, ou **Ajustes → Contas recorrentes**.
2. Nome, valor (fixo ou "varia"), vencimento, categoria, conta, urgência, lembrete.
   - Conta é cartão → entra na fatura, não vira conta separada.
   - Mudar valor depois cria nova vigência; meses passados não mudam.
3. Salvar → a conta já reduz "quanto ainda posso gastar" deste mês.

## Naming Conventions

Regra do grill: **direto nos verbos, factual nos substantivos, nenhum rótulo começando com
"meu"**.

| Concept | Label in UI | Notes |
|---|---|---|
| Tela inicial | **Resumo** | "Visão geral" não diz de que mês nem de quê |
| Previsto − gasto, no mês | **Quanto ainda posso gastar** | A pergunta, não o indicador |
| Renda − gasto − guardado | **Sobra do mês** | Resultado, não disponível. Fica abaixo do principal |
| Valor planejado da categoria | **Previsto** | O padrão que se repete é o "previsto padrão", em Ajustes |
| Realizado da categoria | **Gasto** | "Realizado" é jargão; nada se perde em dizer gasto |
| Dentro / perto / fora do previsto | **dentro · perto · fora** | Rótulo escrito sempre acompanha a cor |
| Transferência para cofrinho | **Guardei** (ação) / **Aporte** (registro) | Verbo na ação, substantivo no histórico |
| Saída de cofrinho | **Resgate**, com finalidade | Palavra de produto financeiro, já usada no domínio |
| Empréstimo a si mesmo | **A devolver** | Diz o que falta fazer |
| Conta de meta | **Cofrinho** | Palavra do próprio PicPay: transcrever, não traduzir (mesmo princípio do ADR-008) |
| Dinheiro na mão de outra pessoa | **A receber** | Aba, não página |
| Dia em que o banco fecha a fatura | **Fechamento** | O número que o app do banco mostra (ADR-008) |
| Dia limite de pagamento | **Vencimento** | Idem |
| Mês em que a fatura vence | **Mês da fatura** | É o mês do orçamento da compra (ADR-005) |
| Lançamento | **Lançamento** | Nunca "transação": transação é a do banco de dados |
| Configuração | **Ajustes** | Mais curto que "Configurações" e cabe na barra do topo |
| Pendências que pedem ação | **Atenção (n)** | Aba do Resumo; n conta críticos + de atenção, não informativos |
| Gravidade | **crítico · atenção · informativo** | Vermelho, âmbar, neutro; rótulo escrito sempre |
| Conta fixa mensal | **Conta recorrente** | "Boleto" é meio de pagamento; "assinatura" é só um tipo |
| Nível da conta | **Essencial · Importante · Adiável** | Propriedade da conta, não da data |
| Situação da conta no mês | **paga · a vencer · vence em breve · vence hoje · atrasada** | |
| Saídas que o saldo não cobre | **Em risco** | Diz quanto falta, não "alerta" |
| Botão do RF21 | **Copiar resumo do mês** | Não diz "enviar para IA": nada é enviado |
| Modo sem login | **Modo demonstração** / **Dados fictícios** | Nunca "sandbox", nunca "teste" |
| Dado de exemplo com caso de uso desligado | **Pré-visualização** | Distingue "fictício porque é demo" de "fictício porque não está ligado" |

Proibidos: emoji, exclamação, "incrível/parabéns/uau", "seu dinheiro está trabalhando",
"meu/minha" em rótulo, e qualquer adjetivo onde um número responde.

## Component Reuse Map

| Component | Used on | Behavior differences |
|---|---|---|
| `layout.tarja(sessao)` + `layout.navegacao` | todas as 7 (chamadas uma vez em `streamlit_app.main`) | Tarja muda de texto: demonstração (com "Entrar com Google") vs. pré-visualização; some para o dono com os casos de uso ligados |
| `layout.titulo(texto)` | todas as 7 | No celular acompanha o botão Lançar; no desktop não precisa, mas mantém para consistência |
| Mês global | Resumo, Orçamento, Lançamentos, Cartões, Cofrinhos | **Não aparece** em Investimentos e Ajustes — mostrar um controle sem efeito é mentira de interface |
| `componentes.destaque(...)` | Resumo, Cartões, Investimentos/Patrimônio, Cofrinhos | Um por tela. Em Cofrinhos são dois lado a lado (guardado e a devolver), porque nenhum dos dois decide sozinho |
| `componentes.regua(...)` | Resumo, Orçamento, Investimentos/Patrimônio, Cartões | Variante com total separado por régua dupla em Orçamento e Patrimônio |
| `componentes.selo(estado)` | Resumo, Orçamento, Atenção | Único portador de cor na interface; na Atenção carrega a gravidade |
| `graficos.*` (Altair) | Orçamento, Cartões, Investimentos | Um por pergunta; tema dos tokens; tabela equivalente sempre |
| `componentes.barra(...)` | Resumo, Orçamento, Cofrinhos | Em Cofrinhos mede meta, não previsto: mesma forma, rótulo diferente |
| `componentes.tabela(...)` | Lançamentos, Cartões, Cofrinhos, Investimentos, Ajustes | Colunas de dinheiro como `NumberColumn(format="accounting")`; altura fixa só em Lançamentos |
| `componentes.botao_lancar(chave)` | todas as 7 | Uma instância, no cabeçalho da página |
| `componentes.dialogo_lancar()` | global | Quatro intenções; campos conforme a intenção |
| Diálogos de ação | Cartões, Cofrinhos, Lançamentos | Mesmo esqueleto: contexto → campos → confirmação → `st.toast` → `st.rerun` |

## Content Growth Plan

| O que cresce | Como a IA aguenta |
|---|---|
| **Lançamentos** — algumas centenas por ano | Mês global como recorte padrão; alargador explícito até "tudo"; filtros por tipo, conta, categoria e texto; altura fixa com rolagem. Paginação de verdade entra no caso de uso (`listar_lancamentos`), não na tela |
| **Faturas** — 12 por ano por cartão | Tabela por mês de vencimento, do mais recente para o mais antigo; detalhe de uma fatura por vez |
| **Cofrinhos** — unidades, não dezenas | Tabela em vez de um cartão por cofrinho: 15 cofrinhos ainda cabem numa tela |
| **Cartões** — hoje 1, amanhã 2 ou 3 | `st.pills` para escolher o cartão. Acima de ~5 vira `selectbox`. **Nunca** hardcode do nome do cartão — a v1 tinha `"Unicred"` escrito em `visao_geral.py:72` |
| **Pessoas a receber** — unidades | Uma seção por pessoa, ordenada por saldo |
| **Ativos na carteira** — dezenas | Tabela ordenável; a ordenação por valor é o que faz a tabela escalar |
| **Categorias** — dezenas | Agrupadas por grupo no Orçamento; arquivar esconde dos formulários sem apagar histórico |
| **Usuários com acesso** — unidades | Tabela simples; o registro de acessos em expansor |

## URL Strategy

- **Pattern**: `/<destino>`, um nível só. Sem acento, sem maiúscula, sem plural
  inconsistente. Definido por `st.Page(url_path=...)` para não depender da derivação do
  título, que mudaria a URL se o rótulo mudasse.
- **Rotas**: `/` (Resumo), `/orcamento`, `/lancamentos`, `/cartoes`, `/cofrinhos`,
  `/investimentos`, `/ajustes`.
- **Dynamic segments**: nenhum. Não há recurso endereçável por id — é um app de um usuário,
  e abrir "a fatura de setembro" é escolher o mês, não navegar para uma URL.
- **Query parameters**: nenhum, por ora. O estado de tela (mês, aba, filtros) vive em
  `st.session_state`, não na URL. **Consequência aceita:** o link não guarda o mês nem a
  aba, então recarregar a página volta ao mês corrente. Se um dia for preciso compartilhar
  "o orçamento de março", `st.query_params` resolve com `?mes=2026-03`; não há motivo agora,
  e colocar estado na URL antes de haver quem compartilhe é complexidade sem cliente.
- **Rota removida**: a tela de entrada não tinha rota (era um ramo antes do
  `st.navigation`); desaparece junto com `app/entrada.py`.
