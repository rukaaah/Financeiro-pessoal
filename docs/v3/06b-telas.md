# Etapa 6b — Briefing de cada tela

Data: 2026-11-04. Feito com a skill `/design-taste-frontend`, no modo **app screen**
(telas de trabalho, não página de divulgação), sobre a arquitetura de informação de
`05-arquitetura-de-informacao.md` e o estilo de `06a-estilo.md`. Ainda não há código:
isto é o briefing que a construção (Etapa 9) segue e que a auditoria (Etapa 10)
confere.

## Estilo sorteado e escolhido

O sorteio da skill para "finanças, claro, uso no celular várias vezes ao dia" deu
duas opções: **Achromatic ledger** e **Pastel consumer** (seed 1427866557).

**Escolhido: Achromatic ledger.** O cromo não tem cor; dinheiro e contagens em
tinta; **um só matiz** no dado principal de cada tela; a outra cor é só o sinal de
mudança. É a mesma regra do app desde a v2 (cor só para estado). O Pastel consumer
pinta cada categoria com um tom, o que brigaria com o verde/âmbar/vermelho de estado
e com a regra de nenhuma cor nova.

**Adaptação declarada:** o estilo pede botão principal quase preto e o matiz só no
dado. Aqui o matiz é o azul do app (`#2b55d0`, 6,12:1, decisão do Pedro em
2026-10-29), usado **no dado principal e em um único controle, o Lançar**. A skill
permite exatamente isso ("o acento no dado e em no máximo um controle"). Os demais
botões são tinta (`#181b1a`) ou contorno.

**O rosto do produto** (o que impede a tela de parecer um kit): o matiz azul no
**gasto dentro da régua do mês**, e o elemento próprio deste produto é a **régua do
mês**, descrita abaixo. Nenhum outro app de referência a tem, porque nenhum soma
contas a pagar ao lado do previsto e do gasto.

**Ajustes ao 06a que a skill impõe:**

- Número principal: no máximo **32 px no celular e 36 px no desktop** (a skill
  reprova 48 px como "cara de landing page"). O 06a dizia 36 e 48.
- Título da página: **24 px** (o 06a dizia 26).
- Lista no celular: linhas de duas linhas, nunca tabela espremida.

## Regras que valem para todas as telas

1. **Um fato mostrado duas vezes é uma variável só.** Previsto, gasto, contas a pagar
   e livre vêm de `posicao_do_mes(mes)`; o total da fatura vem de `fatura(mes)`. Teste
   automatizado compara o que cada tela mostra com a função.
2. **Totais vêm das partes como aparecem**: soma dos centavos exibidos, em `Decimal`.
3. **Toda comparação diz contra o quê**: "R$ 25,00 acima da média de 3 meses", "vs
   outubro".
4. **Zero é zero** ("R$ 0,00" em cinza), ausente é travessão cinza, nunca "--" grande.
5. **Carregando**: o desenho final com barras cinza do tamanho real de cada valor,
   sem brilho animado e sem a tela pular quando o dado chega. Nunca tela branca.
6. **Erro**: dentro do bloco que falhou, com "Não deu para carregar. Último dado às
   09:14." e "Tentar de novo".
7. **Toque**: alvos de 44 px; o botão pressionado muda na hora (CSS), antes da
   resposta do servidor. É o único jeito de chegar perto dos 200 ms do requisito
   (Etapa 7).
8. **Celular**: margem de 16 px; corpo de 16 px; legenda de no mínimo 12 px;
   nenhuma rolagem lateral da página.

## A casca

**Celular (padrão):** barra inferior fixa, 64 px, fundo opaco, régua forte em cima.
Quatro destinos com ícone de 24 px e rótulo de 12 px; no centro, **Lançar**, círculo
de 56 px no azul, que é o único controle colorido do app. Ativo: rótulo e ícone em
tinta, com peso 600; inativo, em `--fin-texto-2`. No topo: título da tela (24 px) à
esquerda e o ícone de Ajustes (24 px, com `aria-label`) à direita. A tarja de dados
fictícios vem antes de tudo, no modo demonstração.

**Desktop:** a barra vira uma coluna lateral de 232 px no fundo da página (sem cor
própria), com o nome do produto em cima, os quatro destinos, Lançar como o único
botão preenchido e Ajustes no pé. Conteúdo fluido até 1200 px.

```
┌─────────────────────────────────┐  375 px
│ Dados fictícios · Entrar        │  tarja (só no demo)
│ Mês                        ⚙   │  título 24 px + Ajustes
│ ‹  Novembro de 2026  ›          │  mês global
│                                 │
│           (conteúdo)            │
│                                 │
├─────────────────────────────────┤
│ Mês  Lançamentos (+) Cartão Patr.│  barra inferior 64 px
└─────────────────────────────────┘
```

## Mês

- **A pergunta:** como está o meu mês e o que ainda vem pela frente?
- **A descoberta do dia** (linha logo abaixo do mês, a primeira coisa lida): a frase
  mais importante calculada hoje, por exemplo "Restaurantes passou R$ 15,00 do
  previsto" ou "Saldo fica negativo em 28/11 se nada mudar". Uma só.
- **O maior bloco: a régua do mês.** Um trilho do comprimento do previsto; o gasto
  preenchido em azul; as contas a pagar como segmento mais claro em seguida; o
  estouro, se houver, passando do fim do trilho em vermelho (é o padrão "quanto do
  plano já foi usado" da skill). Acima do trilho, os quatro números separados, como o
  Pedro pediu:

```
Previsto      Gasto       A pagar     Livre
R$ 2.675,00   R$ 1.865,01 R$ 475,00   R$ 334,99
[██████████████████▓▓▓▓▓░░░░░░]       ← gasto (azul), a pagar (claro), livre (trilho)
70% do previsto gasto · dia 4 de 30 (13% do mês)
```

  No celular, os quatro números viram uma grade 2 × 2 (rótulo de 12 px, valor de 18 px,
  "Livre" em 600), com o trilho embaixo ocupando a largura. "Livre" não é número
  gigante: é o resultado da conta, com a mesma altura dos outros.
- **Depois, nesta ordem:**
  1. **Atenção (n)**: até 3 itens, cada um com o selo de gravidade, o valor e a ação
     ("Pagar", "Ver categoria"); "Ver todos (8)".
  2. **Saldo projetado**: linha da conta corrente de hoje até o fim do mês, em tinta,
     passado sólido e futuro tracejado; marcas nas entradas previstas (salário,
     freelance em USD já convertido) e nas saídas (contas, fatura); a linha do zero
     em vermelho tracejado só se for cruzada. Rótulo no fim: "R$ 412,30 em 30/11".
  3. **Categorias**: lista agrupada por grupo; cada linha com nome, gasto à direita
     (16 px), e embaixo, em 14 px cinza, "de R$ 150,00 · média R$ 140,00"; selo só nas
     que estão perto ou fora. Barra de 2 px cinza sob o nome, a do maior gasto em
     tinta. Toque abre o detalhe.
  4. **Guardado no mês**: guardado × planejado, e a sobra (renda − gasto − guardado)
     como uma linha.
  5. Rodapé: "Copiar resumo do mês" e, no modo real com IA ligada, "Avaliar o mês".
- **Sem rolar (375 × 812):** tarja, título, mês, a descoberta, a régua inteira e o
  primeiro item da Atenção.
- **Ação mais frequente:** lançar um gasto, pelo botão central da barra.
- **Estados:** mês sem previsto preenchido mostra a régua sem trilho e "Defina o
  previsto deste mês" com o link para Ajustes. Mês futuro mostra só contas a pagar e
  entradas previstas.

## Atenção (lista completa)

- **A pergunta:** o que eu preciso resolver?
- **O maior número:** "A pagar até o fim do mês R$ 1.318,40", com "sobram R$ 521,95
  em conta" ou "faltam R$ X" logo abaixo (a cor só se faltar).
- **Lista:** agrupada por gravidade (crítico, atenção, informativo), depois por data.
  Linha de duas linhas: o fato na primeira ("Fatura Unicred vence em 7 dias"), o
  detalhe na segunda em cinza ("11/11 · Essencial"), o valor à direita, e uma ação
  em texto na coluna fixa da direita ("Pagar"). "Lembrar amanhã" e "Resolvido"
  aparecem ao arrastar a linha ou no menu de três pontos, para não virarem uma pilha
  de botões.
- **Vazio:** "Nada pendente. Próximo vencimento: Internet, 30/11."

## Detalhe da categoria

- **A pergunta:** essa categoria está normal?
- **O maior número:** gasto do mês, com "de R$ 150,00 previstos" e o selo.
- **Suporte:** colunas de 12 meses, o mês atual em azul e os outros em cinza, com a
  linha tracejada do previsto; "média de 3 meses R$ 140,00"; lançamentos do mês;
  "Ajustar o previsto deste mês" (campo e Salvar).

## Lançamentos

- **A pergunta:** o que aconteceu, e está certo?
- **Sem número grande.** Primeira linha: "Novembro · 16 lançamentos". Dois botões de
  entrada em lote lado a lado, contorno, 44 px: **Importar extrato** e **Colar
  notificação**. Depois, uma linha de filtros em chips que rola na horizontal (Tudo,
  Gastos, Entradas, Transferências, busca).
- **Lista:** agrupada por dia ("Hoje", "Ontem", "seg, 2 de nov"). Linha de duas
  linhas, 64 px: descrição em 16 px e valor à direita em tinta (entrada com "+" e no
  verde de texto `#1f6f54`, saída em tinta sem vermelho); segunda linha em 14 px
  cinza: "Mercado · PicPay" ou "Presentes · Unicred · fatura 12/2026". Transferência
  com o ícone `swap_horiz` e "PicPay → Cofrinho Reserva".
- **Toque na linha:** abre o diálogo de edição com Excluir no pé (vermelho em texto,
  com confirmação que diz o que será excluído). Depois de salvar ou excluir, aviso
  na parte de baixo com **Desfazer** por 5 s.
- **Rodapé da lista:** "Entrou R$ 4.850,00 · Saiu R$ 1.210,80 — pela data do
  lançamento", com o critério escrito (ideia 2). Exportar CSV no menu de três pontos.
- **Sem rolar:** recorte, os dois botões de lote, os chips e 6 a 7 lançamentos.

### Diálogo Lançar

- Folha que sobe de baixo no celular (diálogo centrado no desktop), 6 px de raio no
  topo.
- Abre em **Gastei**, com o campo de valor focado e teclado numérico. Seis intenções
  em chips no topo, roláveis: Gastei, Recebi, Guardei, Resgatei, Paguei a fatura, Vou
  receber.
- Campos de Gastei: valor; categoria (sugerida, marcada "sugerida"); conta (a última
  usada); data (hoje). Com cartão, aparece a frase "entra na fatura que vence em
  12/2026" e o campo de parcelas. "Mais opções": paguei por outra pessoa, usei
  dinheiro de cofrinho, observação.
- **Salvar** é o único botão preenchido (tinta). O botão muda para "Salvando…" no
  toque, antes da resposta.
- **Vou receber** (freelance): valor em USD, data prevista, conta de destino; a
  estimativa em reais aparece embaixo do valor, em cinza: "≈ R$ 5.228,00: PTAX de
  hoje (5,4120) menos o desconto médio do PayPal (3,4%)". Sem recebimento anterior:
  "≈ R$ 5.412,00 pela PTAX; o desconto do PayPal ainda não é conhecido".
- **Recebi o freelance**: dois campos, "Dólares" e "Chegou em reais (como o PayPal
  mostra)". Embaixo, na hora: "O PayPal ficou com R$ 186,40 (3,4%) contra a PTAX de
  hoje." Salvar grava a receita pelo valor em reais e guarda o desconto.

### Colar notificação

Campo de texto grande, "Colar" como botão. Ao colar, o app mostra o que leu numa
linha ("R$ 42,50 · IFOOD RESTAURANTE · 03/11 · cartão") e "Abrir em Gastei". Se não
reconheceu: "Não reconheci este formato" e "Lançar à mão".

## Cartão

- **A pergunta:** quanto vou pagar, quando, e quanto do futuro já gastei?
- **Seletor no topo:** a fatura, em chips roláveis por mês de vencimento ("Out/26
  paga", "Nov/26 aberta", "Dez/26"), aberta selecionada.
- **O maior número:** total da fatura escolhida (32 px), com "vence 11/11, em 7 dias
  · fecha dia 4" embaixo; e o botão **Pagar fatura** (tinta) logo abaixo.
- **Suporte:** "Já comprometido nas próximas: R$ 760,00 em 5 faturas", com colunas
  das próximas faturas (a escolhida em azul); compras da fatura em lista de duas
  linhas (descrição, valor; data, categoria, "parcela 1/3"); prazos vigentes no
  rodapé, com o link para Ajustes.
- **Fatura paga:** selo "paga em 11/10" no lugar do botão. **Parcial:** "faltam
  R$ X" e o botão continua.

## Patrimônio

Abas em texto sobre uma régua de 1 px, indicador de 2 px em tinta: **Visão ·
Cofrinhos · Investimentos · A receber**. Sem seletor de mês: tudo é "hoje".

### Visão

- **O maior número:** patrimônio líquido (32 px). Linha abaixo: "+R$ 420,79 vs 31/10"
  (só a mudança colorida, verde ou vermelho pelo sentido bom).
- **As partes**, como lista com um só alinhamento à direita: Contas, Cofrinhos,
  Investimentos, menos Faturas em aberto, cada uma com "atualizado hoje 09:14" ou a
  data, em cinza. Separada por régua e escrita "fora do patrimônio": **A receber de
  pessoas R$ 500,00**.
- **Patrimônio em 12 meses:** uma linha em azul, sem preenchimento, rótulo no fim.
- **Conciliar saldo:** botão de contorno no fim da lista de contas; mostra "última
  conciliação: PicPay em 01/11".

### Cofrinhos

- **O maior número:** total guardado; ao lado, no mesmo tamanho dos irmãos, "a
  devolver R$ 160,00".
- **Lista:** um cofrinho por linha: nome; saldo à direita; segunda linha "meta
  R$ 3.000,00 · deveria ter R$ 2.100,00 · atrasado R$ 300,00" e, para CDB, "102% do
  CDI"; barra de progresso de 4 px com as duas pontas rotuladas.
- **Ações:** Guardar e Resgatar abrem o Lançar já na intenção; Novo cofrinho no fim.

### Investimentos

- **O maior número:** valor investido. Linha: "mais R$ 2.070,00 em CDBs, em
  Cofrinhos" (link).
- **Suporte:** renda passiva do mês e média 12m (lado a lado, mesmo tamanho);
  rentabilidade 12m contra CDI e IFIX como **tabela de três linhas** (carteira, CDI,
  IFIX), e o gráfico de acumulado abaixo com a carteira em azul e as referências em
  cinza, cada uma com o valor no fim da linha; alocação por classe como barras com
  um traço na meta; carteira por classe em lista; agenda de proventos.
- **Diálogos:** Onde aportar, Projeção, Importar posição por print.

### A receber

- **O maior número:** total a receber de pessoas.
- **Lista:** uma seção por pessoa (inicial num círculo com tom pálido próprio, nome,
  saldo), itens em aberto com dias; **Registrar recebimento** e **Perdoar** em texto
  por pessoa.

## Ajustes

Celular: lista de áreas (Contas, Cartões, Categorias e previsto, Recorrentes e
entradas previstas, Investimentos, Regras, IA, Acesso); cada uma abre a sua tela,
com o nome da área como título. Desktop: duas colunas por seção (rótulo e descrição
à esquerda, painel à direita), à maneira do padrão "settings" sorteado.

- **Um só modelo de salvar por tela**: um Salvar por painel, no canto inferior
  direito.
- **Mostrar o que a configuração produz**: ao mudar fechamento e vencimento, a
  frase "uma compra hoje entra na fatura que vence em 11/12"; ao ligar um uso de IA,
  o exemplo exato do que será enviado.
- **IA**: cada uso com um interruptor, o que é enviado e o que nunca é. Os dois usos
  que mandam texto de estabelecimento (ideias 11 e 13) vêm desligados e só ligam
  com a aprovação explícita.
- **Acesso**: só para quem administra.
- No pé de Ajustes: nome de quem está na sessão e **Sair**.

## Números que precisam concordar (para o seed do demo e para os testes)

Escritos como asserções, no arquivo do seed (ideia 18):

- `previsto − gasto − contas_a_pagar_sem_fatura == livre`
- `soma(categorias.gasto) == gasto` e `soma(categorias.previsto) == previsto`
- `soma(compras da fatura) == total da fatura`, e toda compra tem data entre o
  fechamento anterior (exclusivo) e o fechamento da fatura (inclusivo)
- saldo do cartão == soma das faturas não pagas
- `patrimonio == contas + cofrinhos + investimentos − faturas_em_aberto`; a receber
  fica fora
- nenhum lançamento com data depois de hoje, exceto entradas previstas
- uma conta recorrente paga sai de "a pagar" e aparece em "gasto", nunca nos dois

## O que confirmar no Portão 2

1. Achromatic ledger, com o azul no dado principal e no Lançar.
2. Barra inferior com quatro destinos e Lançar no centro.
3. A régua do mês como elemento principal do Mês, com os quatro números separados.
4. Número principal em no máximo 32 px no celular.

## Esboço

`esbocos/mes.png` (e o HTML em `esbocos/mes.html`) mostra a tela Mês em 390 px com os
dados fictícios do diagnóstico: tarja, mês, a descoberta do dia, a régua com os quatro
números, a Atenção e o começo do saldo projetado acima da barra inferior. É esboço
estático, não código do app.

### Revisão do esboço (Pedro, 2026-11-04)

Retorno: "um pouco sem destaque, tudo com texto muito regularizado". O esboço v2
muda três coisas, e esta é a direção que vale para as outras telas:

1. **Um bloco de destaque por tela**, num campo de azul-escuro (`#18264f`, texto
   branco), que é o único campo de cor da tela. No Mês, ele contém **Livre** como o
   número que lidera (34 px) e, logo abaixo, a régua e os outros três números
   (Previsto, Gasto, A pagar) separados e legíveis, como o Pedro pediu no Portão 1.
   Isto se afasta do Achromatic ledger puro (que não tem campo de cor) de propósito.
2. **A descoberta do dia vira faixa** com fundo do estado (vermelho claro quando é
   estouro), e não mais uma linha cinza.
3. **Listas em blocos com fundo** (`--fin-superficie`) em vez de linhas soltas no
   papel; nome em 600, valor em 700, ação em azul e em negrito.

Nas outras telas, o bloco de destaque leva: Cartão → total da fatura e Pagar;
Patrimônio → patrimônio líquido e as partes; Lançamentos não tem (é lista).

## Chat por contexto (pedido do Pedro, 2026-11-04)

- **Onde aparece:** um botão **Perguntar** (contorno, ícone `auto_awesome`) no topo
  do Detalhe da categoria, no rodapé do bloco de destaque do Mês (substitui "Avaliar o
  mês") e no topo de Patrimônio → Investimentos.
- **Forma:** folha que sobe de baixo, com o contexto escrito no topo ("Lanches e
  delivery · novembro"), duas ou três perguntas prontas em chips, o campo de texto
  embaixo e o teclado. Cada resposta é texto curto; quando há números, uma tabela
  pequena logo abaixo, com os mesmos valores. Sugestões vêm marcadas "com base em"
  e o número.
- **Estados:** "pensando…" no lugar da resposta, sem animação; erro dentro da folha
  com "Tentar de novo"; sem chave ou fora do modo real, a folha mostra as perguntas
  prontas com respostas fixas e a frase "No modo demonstração as respostas são de
  exemplo."
- **Limite do dia:** "Limite de perguntas de hoje atingido. Volta amanhã."

## Esboço navegável (2026-11-04)

O Pedro aprovou o estilo do esboço v2 ("pode terminar o design nesse estilo"). O
esboço navegável `esbocos/mes-navegavel.html` cobre Mês (com detalhe de categoria e
chat), Lançamentos (filtros, editar e excluir com Desfazer, colar notificação,
importar), Cartão (faturas por vencimento, Pagar), Patrimônio (Visão, Cofrinhos,
Investimentos, A receber), Ajustes (áreas e IA) e o Lançar com as seis intenções,
incluindo "Recebi" com o desconto do PayPal e "Vou receber" em dólar. Todos os totais
são somados das partes, com asserções no próprio arquivo.

Regra que o esboço fixou para todas as telas: **um bloco de destaque azul-escuro por
tela** com o número que responde a pergunta da tela e, quando há, a ação principal
dentro dele (Pagar fatura, Guardar). Lançamentos não tem bloco de destaque: é lista.

### Investimentos, revisto (Pedro, 2026-11-04: "está pequena, falta gráficos, falta comportamento")

Patrimônio → Investimentos passa a ter um bloco de destaque (investido, variação do mês
fora o aporte, quanto foi aportado e quanto rendeu, Onde aportar e Perguntar) e quatro
faces num controle segmentado:

- **Resumo**: rentabilidade acumulada de 12 meses (carteira × CDI × IFIX, valor
  escrito no fim de cada linha); esforço e rendimento (aportado em cinza, rendimento
  em azul, mês a mês); próxima marca, renda passiva média, aporte médio, taxa de
  poupança; Projeção.
- **Carteira**: alocação × meta; **como cada ativo se comportou no mês** (barras
  divergentes, verde e vermelho pelo sentido); lista de ativos com P/VP, DY e
  variação sobre o preço médio. Toque abre o **detalhe do ativo**: preço em 12 meses
  com o preço médio tracejado, P/VP, DY, último provento, liquidez, peso, proventos
  por cota em 12 meses e Perguntar.
- **Proventos**: barras de 12 meses com a média; agenda com data-com, pagamento,
  anunciado ou estimado e yield on cost.
- **Movimentos**: aportes, compras e proventos recebidos, com aporte novo separado de
  realocação.

**Onde aportar** e **Projeção** funcionam no esboço: o primeiro distribui o valor pelas
regras (classe abaixo da meta, menor P/VP elegível, cota inteira, sobra no CDB Inter)
e diz quem ficou de fora e por quê; a segunda recalcula com aporte, DY e horizonte e
mostra a faixa de ±2 p.p.
