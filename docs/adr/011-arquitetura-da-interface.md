# ADR-011 — Arquitetura da interface: sete destinos, mês global e intenção antes de contabilidade

- **Status:** Navegação (decisões 1 e 3 e o adendo da barra) substituída pelo [ADR-015](015-pwa-e-api-no-cloudflare-workers.md) e por `docs/v3/05-arquitetura-de-informacao.md` em 2026-11-04
- **Data:** 2026-10-08
- **Decidido em:** grill-me de 2026-10-08; detalhes em
  `.design/interface-v2/DESIGN_BRIEF.md` e
  `.design/interface-v2/INFORMATION_ARCHITECTURE.md`.

## Contexto

A primeira versão da interface (T8 em diante) foi construída inteira, sobre dados
de exemplo, e nunca chegou a `main`. Lida de fora, ela não entregava o que o
próprio design brief prometia. Os problemas, medidos no código e não por
impressão:

1. **"Celular primeiro" com dez páginas em barra lateral**, que o celular
   esconde atrás de um ícone. A navegação contradizia o princípio declarado.
2. **A tela inicial tinha nove blocos** — sobra, gasto, guardado, renda, taxa de
   poupança, fatura aberta, atenção, saldo por conta e gráfico de patrimônio — e
   nenhum número com precedência. O brief dizia "resposta antes de detalhe"; a
   tela entregava um painel.
3. **Quatro seletores de mês independentes** (`mes_visao_geral`, `mes_orcamento`,
   `mes_lancamentos`, `mes_cofrinhos`): trocar o mês numa tela não levava para as
   outras, sem nada avisar.
4. **Informação repetida em três telas** com três formatos diferentes: `resumo_do_mes`
   em Visão geral e Orçamento, saldo por conta em Visão geral e Configurações,
   fatura aberta em Visão geral e Cartões.
5. **Cinco gráficos padrão do Streamlit**, quando o brief listava "dashboards de
   template com gráficos" como anti-referência.
6. **O diálogo de lançamento falava contabilidade** — Despesa / Receita /
   Transferência, "Finalidade do resgate" — e tinha cerca de dez campos
   condicionais. Aportar em cofrinho exigia entender que aporte é transferência.
7. **Dinheiro em tabela era texto pré-formatado**, então ordenar por "Valor"
   ordenava alfabeticamente. Num extrato de 200 linhas, "qual foi meu maior
   gasto" não tinha resposta.
8. **A cor primária era verde (`#1f6f54`) e verde também significava "dentro do
   orçamento"**: a mesma cor para "isto é um botão" e para "isto está sob
   controle".
9. `visao_geral.py:72` tinha `"Unicred"` **escrito à mão** — a tela quebra com
   qualquer outro nome de cartão.

Nada disso é defeito de implementação: é defeito de estrutura. Repolir as telas
uma a uma não resolveria os itens 1 a 4, que são da arquitetura da interface.

## Decisão

Sete decisões estruturais, todas de interface. **Nenhum módulo de
`src/financeiro/` muda**, e a costura com os dados (`app/dados.py` devolvendo os
modelos de `app/modelos.py`) é preservada.

### 1. Sete destinos, navegação no topo

`st.navigation(position="top")` com: **Resumo, Orçamento, Lançamentos, Cartões,
Cofrinhos, Investimentos, Ajustes**. Rota explícita por `st.Page(url_path=...)`,
para que mudar um rótulo não mude a URL.

Os três destinos que saíram foram absorvidos onde já pertenciam: *Importar* virou
diálogo de Lançamentos, *A receber* virou aba de Cofrinhos, *Acesso* virou aba de
Ajustes. Sete é o teto: o oitavo item obriga a repensar o agrupamento, não a
esticar a barra.

Profundidade máxima de dois níveis (destino → aba). O que não cabe em aba vira
diálogo, e diálogo é lugar de concluir ação, não de navegar.

### 2. Um mês para todo o app

Um seletor só, na barra lateral, com estado único em `st.session_state`. Trocar o
mês vale para todas as telas que dependem dele. **Investimentos e Ajustes não
mostram o controle**, porque não o usam — exibir um controle sem efeito é mentira
de interface.

### 3. A barra lateral deixa de navegar

Ela passa a ser contexto e ação: mês global, botão **Lançar**, quem está na
sessão, entrar/sair. Como no celular ela vem recolhida, o que ela carrega aparece
replicado no corpo da página (Lançar no cabeçalho, mês na primeira linha).

### 4. Um número decide por tela

Cada tela tem exatamente um número principal. No Resumo é **"quanto ainda posso
gastar"** — previsto do mês menos gasto realizado, com os dias restantes e quanto
cabe por dia. É a pergunta que a planilha original respondia, e é prospectiva: a
"sobra do mês" da v1 (renda − gasto − guardado) mede o mês que já passou e não
diz se dá para pedir o delivery hoje. A sobra continua na tela, um nível abaixo,
como resultado.

Se dois números disputam o topo de uma tela, um dos dois está na tela errada.

### 5. A intenção é do usuário; a contabilidade é do sistema

O diálogo de lançamento pergunta **o que aconteceu**: *Gastei, Recebi, Guardei,
Paguei a fatura*. A dupla perna de transferência, o `invoice_month`, a perna de
pagamento com `settles_invoice_month` (ADR-010) e a finalidade do resgate
continuam existindo no banco, **derivados da intenção** e exibidos como
confirmação antes de salvar — nunca como campo a preencher.

Isto não relaxa nenhum invariante: a soma zero, o mês da fatura e a finalidade do
resgate continuam obrigatórios e verificados no Postgres (ADR-004). Muda quem
responde a pergunta, não se ela é respondida.

### 6. Régua e tipografia no lugar de caixa com borda; cor só para estado

Hierarquia por tamanho, peso e espaço, com linhas finas separando seção e total,
como demonstrativo financeiro. Número monetário em fonte tabular, alinhado pelo
decimal.

A cor primária passa a ser **grafite neutro**, e verde, âmbar e vermelho ficam
**reservados** ao estado do orçamento — dentro, perto, fora. Quando a tela tem
cor, a cor é a informação. Estado nunca vem só por cor: tem rótulo escrito.

Dos cinco gráficos, sobram **dois**: patrimônio no tempo e compromisso das
próximas faturas. Os outros três viraram tabela ordenada, porque ler
"FNOF11 R$ 4.288,20" é mais preciso que medir uma barra.

### 7. Sem tela de entrada

O visitante cai direto na demonstração, com "Entrar com Google" na lateral — que
era o comportamento da Fase 0, antes da v1. `app/entrada.py`,
`escolher_demonstracao()` e `visitante_escolheu_demo()` são removidos.

**Consequência que isso impõe:** quem cai na demonstração nunca a *escolheu*.
Então a faixa de dados fictícios deixa de ser preferência de design e passa a ser
obrigação do ADR-003 — ela é a primeira coisa na ordem do DOM, antes da
navegação, e é permanente. Se fosse dispensável, não seria aviso.

## Consequências

**A favor:**

- A navegação no topo torna o "celular primeiro" verdadeiro em vez de declarado.
- Um mês global elimina a classe de erro em que duas telas mostram meses
  diferentes sem avisar.
- A informação deixa de ser repetida: cada número tem um dono. O Resumo não
  reimplementa o Orçamento; Ajustes não reimplementa o saldo por conta.
- Colunas de dinheiro numéricas trazem ordenação por valor, alinhamento pelo
  decimal e negativo entre parênteses — num sistema financeiro isso era defeito,
  não estilo.
- A primária neutra devolve significado às três cores de estado.
- O lançamento por intenção remove a exigência de o usuário saber contabilidade
  para registrar que guardou dinheiro.

**Contra:**

- É uma reescrita da camada `app/`, não um refinamento. O trabalho da v1 fica no
  histórico (commit de snapshot na branch) e não em `main`.
- ~~`st.navigation(position="top")` exige Streamlit ≥ 1.49~~ — substituído pela barra
  própria; ver o adendo de 2026-10-29 sobre navegação.
- O mês global em `st.session_state` **não** vai para a URL. Recarregar a página
  volta ao mês corrente, e não há como compartilhar o link "do orçamento de
  março". Aceito: não há com quem compartilhar, e `st.query_params` resolve
  depois sem migração.
- Dois níveis de profundidade significam que abas vão ficar cheias antes de
  virarem destino. Investimentos já tem quatro.
- `NumberColumn(format="accounting")` converte `Decimal` para `float` na borda de
  renderização. Decisão registrada à parte, no [ADR-012](012-decimal-e-a-borda-de-renderizacao.md).

## Alternativas consideradas

- **Repolir as dez páginas, mantendo a estrutura.** Mais barato e menos
  arriscado. Recusada: não resolve navegação no celular, mês por tela nem
  informação repetida, que são os quatro problemas mais graves. Seria pintar a
  parede torta.
- **Quatro destinos, com abas internas** (Mês, Cartões, Patrimônio, Ajustes).
  Recusada: empurra a complexidade para dentro das páginas e cria um terceiro
  nível de navegação disfarçado de aba.
- **Barra lateral com os sete agrupados.** Recusada pelo motivo que originou a
  reestruturação: no celular ela fica escondida.
- **Manter "sobra do mês" como número principal.** Honesto contabilmente.
  Recusada: responde sobre o mês que passou, e a pergunta do sistema é sobre o
  que ainda cabe.
- **Mês global com trava por tela** (botão para desgrudar). Recusada: mais
  estado para o usuário acompanhar do que benefício, num app de uma pessoa.
- **Tabela HTML própria,** para controle total de tipografia sem `float`.
  Recusada: perde ordenação, busca e rolagem que o `st.dataframe` entrega de
  graça, e viraria código a manter.
- **Manter o verde como primária.** Recusada: o duplo sentido da cor é
  justamente o que impede a cor de significar algo.

## Adendo — 2026-10-29: RF20 e RF22

Dois requisitos novos do planejamento mexem em decisões deste ADR. O resto continua.

**RF20 (aba Atenção).** O Resumo ganha duas abas, *Mês* e *Atenção (n)*. Não é um oitavo
destino: é outra face do mesmo assunto, que é o que a regra de abas permite. Os blocos
"onde vai estourar" e "a pagar neste mês" continuam na aba Mês, resumidos — duplicação
**aceita** por decisão do Pedro, para a pergunta das 19h não exigir troca de aba. A
condição é que os dois lugares leiam os mesmos itens de alerta (módulo `alerts`); nenhuma
tela calcula alerta por conta própria, que era a raiz do item 4 do contexto. A gravidade
reusa as cores de estado: crítico = vermelho (fora), atenção = âmbar (perto),
informativo = neutro. Nenhuma cor nova.

**RF22 (gráficos de análise).** Revoga o limite de **dois** gráficos da decisão 6. O limite
cortou gráficos decorativos; os do RF22 são analíticos, cada um responde uma pergunta
escrita no próprio título, e ficam em abas próprias (Orçamento → Evolução, abas de
Investimentos) ou abaixo da tabela, nunca disputando o número principal. Ficam de pé:
pizza proibida, cor neutra (categoria por posição e rótulo, rampa
`--fin-grafico-cat-1..7`), tabela equivalente, um módulo só (`app/graficos.py`).

## Adendo — 2026-10-29: a navegação do topo é nossa

Ao rodar a casca, o `st.navigation(position="top")` mostrou um comportamento que
derruba a decisão 1: **abaixo de ~640 px o Streamlit tira os destinos do topo e
os põe na lateral recolhida**. Medido no app: 7 links no topo em 1280 px; parte
num botão "3 more" em 768 px; nenhum em 375 px. É o defeito da v1 que motivou o
ADR.

Decisão do Pedro: barra própria. `st.navigation(position="hidden")` continua dono
das rotas (`url_path` explícito) e devolve a página escolhida; `layout.navegacao`
desenha os 7 `st.page_link` numa linha que rola na horizontal no celular. Efeitos:

- **A tarja passa a vir antes da navegação no DOM**, como o ADR pedia — a barra
  agora está no corpo da página, não no cabeçalho do Streamlit.
- **Página ativa** marcada por chave de contêiner (`st-key-fin-nav-ativo`), porque
  o Streamlit só a distingue por classe gerada; o link ativo é centralizado ao
  abrir por 3 linhas de JavaScript fixo (`st.html(..., unsafe_allow_javascript=True)`,
  sem entrada do usuário).
- **Sem `aria-current`** no link ativo (o `st.page_link` não expõe). Compensação: o
  título da aba vira "<Página> · Financeiro pessoal", que o leitor de tela anuncia.
- Custo: ~40 linhas entre `layout.py` e `componentes.css`, e dependência dos
  `data-testid` `stPageLink`/`stPageLink-NavLink`.
