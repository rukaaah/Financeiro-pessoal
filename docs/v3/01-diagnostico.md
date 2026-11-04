# Etapa 1 — Diagnóstico do sistema atual

Data: 2026-11-04. Branch analisada: `design/reestruturacao-da-interface` no commit
`11d8c4a` (o `wip:` desta etapa). `main` ainda está no commit `ac0d953`, fim da Fase 0.

## Resumo em cinco linhas

1. **A leitura inicial se confirma, mas a causa principal não é de tela.** Hoje o
   sistema **não tem nenhum caso de uso de finanças**: dos dez módulos de
   `src/financeiro/`, só `identity` e `shared` têm código (459 linhas no total).
   Toda a interface roda sobre `app/dados.py` com `DADOS_DE_EXEMPLO = True` e 53
   marcas `TODO(claude-code)`. Nada que se lança é gravado.
2. O app publicado (`main`) é o esqueleto da Fase 0: sete páginas com um aviso "em
   construção". O usuário real não tem controle financeiro nenhum hoje.
3. A interface da branch é rica, mas **mostra números que deveriam bater e não batem**:
   três respostas diferentes para "quanto ainda posso gastar", dois "gastos do mês",
   dois patrimônios. É isso que faz as páginas parecerem confusas.
4. **O app publicado já passa das metas com páginas vazias**: primeira tela útil em
   2,3 a 2,7 s (meta 1,5 s) e troca de tela em 211 a 278 ms, sem nenhuma consulta de
   finanças e numa conexão fixa, não 4G. Cada toque é uma ida ao servidor do
   Streamlit (~157 ms daqui) mais as consultas ao Neon em São Paulo. A meta de
   200 ms de resposta a toque **não cabe** no modelo atual.
5. Faltam peças de um controle completo: editar e excluir lançamento, contas
   recorrentes que viram lançamento, saldo projetado por dia, conciliação, exportar,
   comparação entre meses no lugar onde se decide.

## Como foi medido

- Leitura de `CLAUDE.md`, ADRs 001 a 014, `.design/interface-v2/`,
  `docs/pendencias-da-ui.md`, `docs/validacoes.md` e o histórico do Git (35 commits).
- A UI da branch rodando localmente com `_preview_ui.py` (sessão simulada, sem
  banco), nos modos dono e demonstração, num navegador emulando um celular de
  375 × 812. O texto de cada tela e de cada aba foi extraído do DOM.
- Tempos medidos no próprio navegador: do clique até a última mudança no DOM (sem
  mudanças por 250 ms), duas rodadas, sete telas e todas as abas.
- Latência de rede medida daqui (Paranavaí, PR) com `curl` (tempo de conexão TCP,
  cinco amostras): `share.streamlit.io` e o proxy do Neon em `sa-east-1`.
- Região do banco confirmada no Neon: projeto `Financeiro pessoal`,
  `aws-sa-east-1`, Postgres 18, 0,25 a 2 CU.

- App publicado (`personal-finance-port.streamlit.app`, versão de `main`, Fase 0)
  medido em 2026-11-04 no navegador embutido, viewport de 375 × 812, conexão fixa
  de banda larga em Paranavaí (não 4G; num 4G os tempos só aumentam). Primeira tela:
  do pedido do documento do app (`/~/+/`) até o texto da tela aparecer, três
  amostras. Troca de tela: do clique no link da lateral até o título mudar, duas
  rodadas pelas seis páginas.

## O que existe por trás das telas

| Camada | Situação |
|---|---|
| Banco | Migrations 001 a 004 em produção (identidade, RLS, núcleo, ciclo de fatura, fechamento inclusivo). 005 (pagamento aponta a fatura, `is_admin`) e 006 (natureza da categoria) escritas, **não aplicadas** |
| Domínio e casos de uso | Só `identity` (resolver sessão, dono ou demo) e `shared` (unidade de trabalho com `SET LOCAL`). `ledger`, `budgeting`, `cards`, `goals`, `investments`, `market_data`, `importing`, `categorization` estão vazios |
| Interface | 7 destinos, ~6.200 linhas em `app/`, todas lendo dados de exemplo. 47 pendências listadas em `docs/pendencias-da-ui.md` |
| Jobs | Só o reset noturno do demo. Cotações e proventos não existem |
| Testes | Isolamento entre usuários, unidade de trabalho, roteamento dono/demo, ciclo de fatura, seed do demo. Bons, e todos de infraestrutura |

Conclusão: a v2 da interface foi desenhada e construída antes do modelo de dados
que ela consome. Parte das incoerências abaixo vem daí: cada tela fabrica seus
números de exemplo, e nada obriga dois números a vir da mesma conta.

## Inventário por tela

Para cada número: a pergunta que ele responde, e se responde bem. "Bem" quer dizer
que o número está certo pela própria definição, que a definição está escrita na
tela e que ele concorda com os outros números do app.

### Resumo → aba Mês

| Número | Pergunta | Responde bem? |
|---|---|---|
| **Quanto ainda posso gastar** R$ 334,99 | Posso gastar isso hoje? | Parcialmente. É previsto − gasto − contas a pagar. Mas o Orçamento diz **R$ 809,99 restam** e a lista "Onde ainda cabe" soma **R$ 588,10**. Três respostas para a mesma pergunta |
| R$ 12,41 por dia nos 27 dias | Quanto por dia? | Sim. Mas a barra ao lado diz "dia 3 de 30" num dia 4: erro de um dia |
| Gasto do previsto 70% | Estou no ritmo? | Só junto com a barra de dias; não diz se está adiantado ou atrasado em relação ao ritmo |
| Renda, Gasto, Guardado, Sobra | Como o mês se formou? | Sim, e a sobra fecha (4.200 − 1.865,01 − 1.300 = 1.034,99). Mas a sobra (R$ 1.034,99) é maior que "quanto posso gastar" (R$ 334,99) sem nada explicar a diferença |
| Precisa de atenção (8) | O que estourou? | Mostra 2 dos 4 críticos; os outros 2 só aparecem na aba |
| Onde ainda cabe (9 categorias) | Em qual categoria ainda tem espaço? | A soma não bate com nenhum dos dois "restam" |
| Onde está o dinheiro (Disponível, Cofrinhos, Investido, A receber) | Onde está meu dinheiro? | Não bate com Investimentos: aqui "Investido" é R$ 3.910,40; lá o patrimônio investido é R$ 11.969,90 (os CDBs estão em Cofrinhos aqui e em Renda fixa lá) |
| A pagar R$ 1.318,40 | Quanto já está comprometido? | Lista "Muay thai, vence 10/11" como a pagar, mas Muay thai também aparece como **já gasto além do previsto** (R$ 157,50) e, em Lançamentos, como pago em 14/11 |
| Nos cofrinhos, sem tirar do mês | O que gastei com dinheiro guardado? | Útil, mas é a terceira lista da tela |

São **sete blocos** e **mais de 30 valores** na primeira tela de um celular. O ADR-011
pediu cinco blocos e um número que decide; a tela voltou a ser um painel.

### Resumo → aba Atenção (8)

| Número | Pergunta | Responde bem? |
|---|---|---|
| A pagar até o fim do mês R$ 1.318,40 | Vou conseguir pagar tudo? | Sim, com "sobram R$ 521,95 em conta". É a melhor resposta do app |
| Em conta, Contas, Faturas | De onde vem a conta? | Sim |
| 8 pendências com ação | O que preciso resolver? | Sim, mas "2 categorias perto do limite: Tarifas bancárias (R$ 0,00)" chama de *perto* uma categoria que está *no* limite, e as ações "Lembrar amanhã" e "Resolvido" não gravam nada |

A lista "A pagar no mês" é repetida inteira, igual à da aba Mês.

### Orçamento

| Número | Pergunta | Responde bem? |
|---|---|---|
| Gasto do mês R$ 1.865,01 de R$ 2.675,00 | Quanto gastei? | Sim pela regra do mês da fatura. Mas Lançamentos, no mesmo mês, diz **Saiu R$ 1.210,80**, sem explicar que um é pelo mês da fatura e o outro pelo dia do pagamento |
| Renda, Guardado, Sobra, Restam | — | Repetem o Resumo. **Restam R$ 809,99** não desconta contas a pagar, e o Resumo desconta |
| Mais perto do limite | Onde vou estourar? | Repete os críticos da Atenção |
| Tabela por grupo, com selo dentro/perto/fora | Qual categoria está fora? | Sim. "Casa" aparece aqui, mas não está nas categorias aprovadas |
| Aba Guardado | Quanto guardei e para onde? | Sim, e explica a devolução que não conta como guardado novo |
| Aba Previsto | Quanto planejo por categoria? | Edita, mas "Salvar previsto" não grava (ADR-013 pendente) |

### Lançamentos

| Número | Pergunta | Responde bem? |
|---|---|---|
| Entrou R$ 4.850,00 / Saiu R$ 1.210,80 / Saldo do mês +R$ 3.639,20 | Quanto entrou e saiu? | Mistura critérios: "Entrou" inclui uma transferência recebida? Renda no Orçamento é R$ 4.200,00. "Saldo do mês" +R$ 3.639,20 contradiz a sobra de R$ 1.034,99 |
| Lista com 8 de 16 lançamentos | O que aconteceu? | Os lançamentos de exemplo têm datas **no futuro** (22/11, 20/11 num dia 04/11) |

Ações: filtros Tudo, Gastos, Entradas, Transferências; ordenar por data ou valor;
busca. **Não há editar, excluir, duplicar, nem exportar.**

### Cartões

| Número | Pergunta | Responde bem? |
|---|---|---|
| Fatura aberta R$ 843,40, vence 11/11, fecha dia 4 | Quanto vou pagar e quando? | Sim. Mas a fatura que fecha em 04/11 contém "Fone de ouvido, 11/11", compra posterior ao fechamento |
| Já comprometido R$ 760,00 em 5 faturas | Quanto do futuro já gastei? | Sim |
| Saldo do cartão em Ajustes −R$ 1.204,80 | — | Não bate com aberta + comprometido (R$ 1.603,40) |
| Faturas por mês, compras da fatura | — | Sim. Não há seletor de mês aqui, embora o ADR-011 diga que Cartões usa o mês global |

### Cofrinhos

| Número | Pergunta | Responde bem? |
|---|---|---|
| Guardado nos cofrinhos R$ 5.120,00 | Quanto tenho guardado? | Sim, mas inclui os dois CDBs, que Investimentos também conta |
| A devolver R$ 160,00 | Quanto devo a mim mesmo? | Sim |
| Das metas 52% / Deveria estar 55% | Estou no ritmo das metas? | Sim, uma boa ideia |
| Entrou, Saiu, Rendeu no mês | — | A tela tem seletor de mês, mas o número principal é saldo, que não depende de mês |
| Aba A receber R$ 500,00 por pessoa | Quem me deve? | Sim |

### Investimentos (5 abas)

| Número | Pergunta | Responde bem? |
|---|---|---|
| Patrimônio investido R$ 11.969,90, +3,6% no mês | Quanto tenho investido? | Não concorda com o Resumo (R$ 3.910,40 investido) |
| Até R$ 20.000,00 em ~10 meses | Quando chego na próxima marca? | Sim, com premissa escrita |
| Renda passiva R$ 82,69 / média 12m R$ 60,70 | Quanto rende por mês? | Sim |
| Rentabilidade 12m +11,0% vs CDI 9,6% e IFIX 7,4% | Estou ganhando do CDI? | O gráfico ao lado diz 11,1% |
| Carteira, Proventos, Onde aportar, Projeção | — | Bem resolvidas como conta com premissas visíveis. Erro de formatação na Projeção: "R$ 1,163,45/mês" |

### Ajustes (5 abas)

Contas (com saldo por conta, que repete o Resumo), Cartões (prazos com vigência),
Categorias (natureza "fixo" e "com cofrinho"), Investimentos (metas de alocação e
critérios), Regras de categorização. "1 categorias" sem concordância em várias linhas.

### Lançar (diálogo global)

Pergunta a intenção: Gastei, Recebi, Guardei, Paguei a fatura. "Gastei" pede
valor, categoria, conta e data, com "Mais opções". Bom desenho; nada é gravado.

## Desempenho

### Metas da seção 4 contra o medido

| Métrica | Meta | Medido local (sem rede, sem banco) | Estimativa no app publicado |
|---|---|---|---|
| Primeira tela útil, app acordado, 4G | ≤ 1,5 s | DOM pronto em 248 ms | **2.311, 2.323 e 2.672 ms medidos**, com uma página que só tem a tarja e um aviso. **Acima da meta** antes de qualquer número |
| Troca de tela | ≤ 300 ms | 110 a 400 ms (Resumo 163, Orçamento 136 a 276, Investimentos 339 a 417, Ajustes 361 a 395) | **211 a 278 ms medidos** (12 trocas) em páginas sem consulta. Com a UI da branch (local 110 a 400 ms) e as consultas, passa da meta |
| Resposta a um toque (abrir Lançar) | ≤ 200 ms | 147 a 173 ms | **acima da meta**: só a ida e volta até o servidor já é ~157 ms |
| Troca de aba | — | 11 a 17 ms na maioria; 137 a 267 ms nas abas que redesenham gráfico (Atenção, Proventos, Ajustes → Investimentos) | igual ao local nas abas puramente visuais |
| Cold start | medir, nunca tela branca | Neon acorda em ~0,4 s (`validacoes.md`) | Na primeira visita de hoje o app mostrou "Your app is waking up!" do Streamlit e acordou **sem clique**, em menos de 48 s (o tempo exato não foi capturado: a página recarrega no meio). Não é tela branca, mas é tela do Streamlit, em inglês, sem nada do app |

### Por que o modelo atual tem um teto

- O Streamlit, por padrão, "reruns your entire Python script from top to bottom"
  quando algo precisa ser atualizado, inclusive a cada interação com um widget
  ([Streamlit, Main concepts](https://docs.streamlit.io/get-started/fundamentals/main-concepts)).
  Abrir um diálogo, trocar o mês ou escolher "Gastei" é uma ida ao servidor e uma
  execução do script da página.
- O servidor do Community Cloud respondeu com ~157 ms de conexão TCP daqui
  (`share.streamlit.io` resolve para `35.203.65.95`). A região exata não é publicada:
  o fórum oficial só discute IPs de saída
  ([discuss.streamlit.io](https://discuss.streamlit.io/t/ip-addresses-of-streamlit-community-cloud-servers/122369)).
  Que os servidores ficam nos EUA é **inferência pela latência, não confirmado**.
- O banco está em São Paulo (`aws-sa-east-1`, confirmado no Neon) e respondeu com
  ~31 ms daqui. Para o app, cada consulta faz o caminho servidor do Streamlit →
  São Paulo; esse tempo **não foi medido** (não há como rodar código no servidor
  do Community Cloud a partir daqui), mas é da ordem de uma travessia EUA–Brasil.
  Uma tela com cinco consultas sequenciais multiplica isso por cinco.
- O Neon no plano gratuito "scales to zero after an inactive period of 5 minutes",
  e no plano Free isso não pode ser desligado
  ([Neon, Scale to zero](https://neon.com/docs/introduction/scale-to-zero)). Custa
  ~0,4 s por acordada, medido; é o menor dos problemas.

**Consequência:** com Streamlit no Community Cloud, a resposta a toque fica acima
de 200 ms por construção, e toda tela paga a soma das consultas a cada interação.
Dá para reduzir (cache por usuário, uma consulta por tela, `st.fragment` para não
reexecutar a página inteira), mas não para chegar a feedback visual imediato,
porque o feedback depende do servidor. Isso vai para a Etapa 7 e o Portão 3.

## O que confunde

1. **Três "quanto resta"** (R$ 334,99, R$ 809,99, R$ 588,10) e duas "sobras"
   (Sobra R$ 1.034,99 e Saldo do mês +R$ 3.639,20), sem uma linha que diga por que
   são diferentes. É a causa número um da sensação de confusão.
2. **Dois "gastos do mês"** (R$ 1.865,01 no Orçamento e R$ 1.210,80 em Lançamentos):
   um pelo mês da fatura, outro pela data. A regra do ADR-005 está certa; a tela
   não avisa qual critério está usando.
3. **Dois patrimônios investidos** (R$ 3.910,40 e R$ 11.969,90), porque CDB é
   cofrinho numa tela e renda fixa na outra.
4. **O mesmo item em três estados**: Muay thai pago, a pagar e acima do previsto.
5. **Dados de exemplo incoerentes**: lançamentos no futuro, compra fora do ciclo da
   fatura, saldo do cartão que não é a soma das faturas. Como o exemplo é o que o
   visitante vê no modo demonstração, o demo hoje ensina o sistema errado.
6. **Ações que parecem funcionar e não gravam** (Salvar, Resolvido, Lembrar amanhã,
   Aportar). O `st.toast` confirma algo que não aconteceu.
7. **Mês global aparece onde não manda** (Cofrinhos mostra saldo) e some onde
   manda (Cartões).

## O que está duplicado

| Informação | Onde aparece |
|---|---|
| Renda, gasto, guardado, sobra | Resumo e Orçamento |
| Lista de contas a pagar | Resumo → Mês e Resumo → Atenção (inteira nas duas) |
| Categorias estouradas | Resumo, Atenção e Orçamento ("Mais perto do limite") |
| Saldo por conta | Resumo ("Onde está o dinheiro") e Ajustes → Contas |
| CDBs | Cofrinhos e Investimentos → Carteira |

A duplicação das contas a pagar foi aceita no adendo do ADR-011; as outras não.

## O que falta para um controle financeiro completo

Comparando com o Apêndice A e com o que um controle financeiro precisa no uso
diário (a comparação com os produtos de referência está na Etapa 2):

| Falta | Por que importa |
|---|---|
| **Todos os casos de uso** (gravar, ler, editar) | Sem eles não existe produto; é a fatia que domina o plano |
| Editar, excluir e desfazer lançamento | Erro de digitação hoje seria permanente |
| Conta recorrente que **gera** o lançamento (ou o sugere no dia) | Hoje ela só alerta; o usuário digita de novo todo mês |
| Saldo projetado dia a dia até o fim do mês | A Atenção calcula o total; falta o "em que dia fica negativo" |
| Conciliação: saldo do app × saldo do banco | É o que mantém o número confiável; o RF05 faz isso só na importação |
| Comparação com o mês anterior e com a média, no Orçamento | Responde "gastei mais que o normal?" |
| Patrimônio líquido total num lugar só (contas + investimentos + a receber − faturas) | Hoje não existe esse número em nenhuma tela |
| Exportar CSV (RF13) | Previsto, não implementado |
| Lançamento rápido no celular (atalho, tela inicial) | Cada lançamento hoje custa abrir o app, esperar acordar, Lançar, intenção, quatro campos |
| Indicação de quando cada dado foi atualizado | Cotações e extrato têm data; saldos não |

## Veredito sobre a leitura inicial

- **"As páginas estão confusas"**: confirmado, com causa identificável — números que
  deveriam ser o mesmo vêm de contas diferentes, e telas repetem blocos umas das
  outras. Não é falta de polimento visual.
- **"Faltam informações"**: confirmado, mas o que mais falta não é informação na tela,
  é o sistema por trás dela. A interface mostra mais números do que o necessário;
  o que falta é que eles sejam reais e concordem entre si.

## O que falta medir

1. **App publicado com a UI da branch**: o publicado é a Fase 0. A medição que
   importa é a da v3, ao fim de cada tela (Etapa 9).
2. **Cold start com precisão**: cronometrar de fora, com o app dormindo há mais de 12 h.
3. **Latência servidor do Streamlit → Neon**: só medível de dentro do app. Proposta:
   um registro de tempo por consulta no próprio app, ligado só para o dono.
