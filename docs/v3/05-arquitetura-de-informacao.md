# Etapa 5 — Representação das finanças e arquitetura de informação

Data: 2026-11-04. Parte do diagnóstico (`01`), das referências (`02`), das ideias
aprovadas no Portão 1 (`03`) e do uso de IA (`04`). Substitui, quando aprovada, a
`.design/interface-v2/INFORMATION_ARCHITECTURE.md` e o ADR-011 nas partes de
navegação.

## 1. Como representar as finanças deste usuário

### O modelo mental

O Pedro decide sobre **o mês**, e o mês dele tem quatro números que ele quer ver
**separados** (resposta ao item 1 do Portão 1: "preciso saber o quanto é previsto
desse mês, preciso saber quantas contas tenho que gastar"):

| Número | Definição única (uma função, usada em todo lugar) |
|---|---|
| **Previsto** | Soma do previsto de despesa do mês (padrão por categoria + ajuste do mês, ADR-013) |
| **Gasto** | Despesas do mês pelo **mês da fatura** para cartão e pela data para o resto (ADR-005). Transferência nunca conta |
| **Contas a pagar** | Contas recorrentes do mês ainda não pagas e que **ainda não estão** no gasto, mais a fatura aberta do cartão que vence no mês, sem contar o que dela já está no gasto |
| **Livre** | Previsto − Gasto − Contas a pagar que não sejam fatura. Escrito como conta, nunca sozinho |

O defeito do diagnóstico (três "quanto resta") some porque **todas as telas leem a
mesma função** `posicao_do_mes(mes)`, que devolve os quatro números e a lista de
itens que compõem cada um. Nenhuma tela soma por conta própria.

Isto também resolve "Muay thai pago, a pagar e acima do previsto": uma conta
recorrente que já virou lançamento sai de "Contas a pagar" e entra em "Gasto".

### Onde mora cada coisa

| Conceito | Representação | Por quê |
|---|---|---|
| Conta corrente (PicPay) | Conta com saldo | É de onde o dinheiro sai |
| Cartão (Unicred) | Conta cujas compras vivem em **faturas**; o dinheiro só sai da corrente no pagamento | Regra do Apêndice A, ADR-005 a 010 |
| Cofrinho, inclusive os CDBs | Conta própria, com meta e % do CDI | Os CDBs **ficam só aqui** (item 4 aprovado). Investimentos mostra "renda fixa em cofrinhos: R$ X" como uma linha que aponta para cá, sem somar de novo |
| Valor a receber de pessoa | Conta por pessoa | Fica **fora** do patrimônio líquido (item 3), mostrado à parte |
| Freelance em dólar (ideia 21) | **Entrada prevista** com valor em USD, data prevista e conversão estimada; vira receita quando cai | É renda esperada, não dívida de alguém. Entra na projeção do mês pela data prevista |
| Investimentos (FII, Tesouro) | Conta de investimento com posições | Valor de mercado vem do job de cotações |
| Patrimônio líquido | Contas + cofrinhos + investimentos − faturas em aberto, **sem** a receber | Item 3 aprovado, com as partes visíveis |

### Comparação com as referências

| Ponto | Organizze / Mobills | Pierre | Aqui |
|---|---|---|---|
| Cartão | Fatura por cartão; despesa de cartão é tipo separado (Mobills) | Alerta de parcelas | Fatura com fechamento inclusivo e orçamento pelo mês do vencimento. Nenhuma referência lida descreve isso |
| Orçamento | Limite por categoria, "quanto ainda tem disponível" | Não tem (reclamação na loja) | Previsto recorrente com ajuste do mês, mais contas a pagar à parte |
| Metas | Metas com progresso | Agentes por meta | Cofrinho como conta, com "deveria ter" e dívida consigo mesmo (RF18), que nenhum deles tem |
| Projeção | Agente projeta (Organizze) | Agente mensal (Pierre) | Saldo projetado dia a dia por regra (ideia 7), explicável linha a linha |

## 2. Destinos: quais ficam, por quê

Cada destino precisa responder uma pergunta que nenhum outro responde.

| v2 (7 destinos) | Pergunta | v3 | Motivo |
|---|---|---|---|
| Resumo | Como está meu mês? | **Mês** | Fica, e absorve Orçamento: os quatro números + categorias são o orçamento |
| Orçamento | Quanto previ e gastei por categoria? | dentro de **Mês** | Hoje repete renda, gasto, guardado e sobra do Resumo. A tabela por categoria vira a segunda seção de Mês; a evolução (RF22) vai para o detalhe da categoria |
| Lançamentos | O que aconteceu? | **Lançamentos** | Fica. Ganha editar, excluir, desfazer, importar e colar notificação |
| Cartões | Quanto vou pagar de fatura? | **Cartão** | Fica |
| Cofrinhos | Quanto guardei? | dentro de **Patrimônio** | Saldo de cofrinho é patrimônio, não depende do mês. Guardar e resgatar continuam no Lançar |
| Investimentos | Quanto tenho investido? | dentro de **Patrimônio** | Idem; resolve os dois patrimônios do diagnóstico |
| Ajustes | Como configuro? | **Ajustes**, fora da barra | Uso raro; ícone no topo |

Resultado: **quatro destinos na barra + Lançar + Ajustes no topo.**

## 3. Mapa de telas

```
Barra inferior (sempre visível, ao alcance do polegar)
┌────────┬─────────────┬─────────┬────────┬────────────┐
│  Mês   │ Lançamentos │  + Lançar │ Cartão │ Patrimônio │
└────────┴─────────────┴─────────┴────────┴────────────┘

Mês  /                                   (mês global, padrão: mês atual)
 ├─ Atenção (n)        lista completa     /atencao
 └─ Categoria X        detalhe + evolução /categoria/<id>   (folha)

Lançamentos  /lancamentos                (mês global)
 ├─ Importar extrato   diálogo
 ├─ Colar notificação  diálogo
 └─ Lançamento         editar / excluir   diálogo

Cartão  /cartao                          (fatura escolhida, não o mês global)
 └─ Pagar fatura       diálogo

Patrimônio  /patrimonio                  (sem mês: é hoje)
 abas: Visão · Cofrinhos · Investimentos · A receber
 ├─ Investimentos: Carteira, Proventos (seções); Onde aportar e Projeção (diálogos)
 └─ Conciliar saldo    diálogo

Ajustes  /ajustes     (ícone no topo, à direita)
 abas: Contas · Cartões · Categorias e previsto · Recorrentes e entradas previstas ·
       Investimentos · Regras · IA · Acesso (só admin)

Lançar (global, botão central da barra)
 Gastei · Recebi · Guardei · Resgatei · Paguei a fatura · Vou receber
```

Profundidade máxima: destino → aba ou detalhe. O que não cabe vira diálogo.

### Por que barra inferior, e não a barra do topo do ADR-011

- O ADR-011 recusou barra inferior porque "a do topo já resolve". O que mudou: o
  pedido agora é **mobile first com alcance do polegar**, e a barra do topo exige o
  polegar no canto oposto da tela a cada troca. As duas referências com navegação
  lida usam barra inferior com o "+" de lançar (Organizze,
  [iDinheiro 2026](https://www.idinheiro.com.br/financaspessoais/organizze-app/);
  Mobills, [Canaltech 2021](https://canaltech.com.br/apps/o-que-e-mobills-como-usar/)).
- Quatro destinos cabem sem rolar em 375 px (a barra rolável da v2 escondia três dos
  sete).
- No desktop, a mesma barra vira coluna lateral à esquerda.
- Custo: depende do framework. Se a interface continuar em Streamlit, é CSS fixo
  sobre um contêiner; isso entra na avaliação da Etapa 7.

## 4. Cada tela: pergunta, número principal, suporte, o que sai

"Acima da dobra" = o que aparece num celular de 375 × 812 sem rolar, descontadas a
barra inferior e a tarja do demo.

### Mês

- **Pergunta:** como está o meu mês e o que ainda vem pela frente?
- **Número principal:** a **régua de quatro números** — Previsto · Gasto · Contas a
  pagar · Livre — numa linha só, com Livre escrito como resultado ("= R$ 334,99").
  Não é um número grande isolado: é a conta inteira, porque o Pedro pediu para ver
  as partes.
- **Suporte, em ordem:**
  1. Barra do mês: % do previsto gasto contra % do mês passado (está adiantado?).
  2. **Atenção (n)**: os 3 itens mais graves, com ação direta; "ver tudo".
  3. **Saldo projetado**: a linha da conta corrente até o fim do mês, com as
     entradas previstas (salário, freelance em USD convertido) e as saídas (contas,
     fatura). Se fica negativo, o dia e o valor.
  4. **Categorias**: tabela previsto × gasto × diferença, com o mês anterior e a
     média de 3 meses na mesma linha (ideia 9). Toque abre o detalhe.
  5. Guardado no mês × planejado.
  6. Botões discretos: Copiar resumo do mês (RF21) e Avaliar o mês (IA, modo real).
- **Acima da dobra:** régua de quatro números, barra do mês, Atenção (até 3).
- **Sai:** "Sobra" (renda − gasto − guardado) como bloco. Vira uma linha no fim da
  seção Guardado. "Onde está o dinheiro" sai (é Patrimônio).

### Detalhe da categoria

- **Pergunta:** essa categoria está normal?
- **Número principal:** gasto do mês contra o previsto.
- **Suporte:** 12 meses em barras (RF22), média de 3 meses, lançamentos do mês,
  "ajustar previsto deste mês".

### Atenção

- **Pergunta:** o que eu preciso resolver?
- **Número principal:** a pagar até o fim do mês, com "sobram" ou "faltam" em conta.
- **Suporte:** itens por gravidade (crítico, atenção, informativo), cada um com ação,
  "lembrar amanhã" e "resolvido" (que gravam). Entram: estouro (80%), conta a vencer
  (3 dias), fatura (5 dias), aporte atrasado, a devolver a cofrinho, a receber,
  extrato desatualizado, cobrança duplicada e assinatura nova (ideia 14), conciliação
  pendente (ideia 8).

### Lançamentos

- **Pergunta:** o que aconteceu, e está certo?
- **Número principal:** nenhum grande. A primeira linha diz o recorte: "Novembro · 16
  lançamentos · critério: data". Totais de entrada e saída ficam no rodapé da lista,
  com o critério escrito (ideia 2), porque são conferência.
- **Suporte:** filtros, ordenação por valor, busca; toque abre editar/excluir;
  "desfazer" no aviso depois de salvar ou excluir (ideia 5); Importar extrato e
  Colar notificação no topo; Exportar CSV no menu (ideia 17).
- **Acima da dobra:** recorte, dois botões de entrada em lote, os primeiros 6 a 8
  lançamentos.
- **Sai:** "Saldo do mês +R$ 3.639,20", que contradizia a sobra.

### Cartão

- **Pergunta:** quanto vou pagar, quando, e quanto do futuro já gastei?
- **Número principal:** fatura aberta, com o vencimento e "fecha dia 4".
- **Suporte:** Pagar fatura (logo abaixo); já comprometido nas próximas; lista de
  faturas por vencimento com situação; compras da fatura escolhida; prazos vigentes
  no rodapé.
- **Seletor:** a fatura, não o mês global (a fatura de novembro tem compras de
  outubro; mostrar o mês do calendário confunde).

### Patrimônio → Visão

- **Pergunta:** quanto eu tenho, de verdade?
- **Número principal:** patrimônio líquido (contas + cofrinhos + investimentos −
  faturas em aberto, sem a receber).
- **Suporte:** as partes, uma por linha, cada uma com a data de atualização (ideia
  20); a receber em linha separada, fora da soma, escrito "fora do patrimônio";
  patrimônio no tempo (12 meses); "Conciliar saldo" (ideia 8).

### Patrimônio → Cofrinhos

- **Número principal:** total guardado; ao lado, total a devolver.
- **Suporte:** tabela com saldo, meta, deveria ter, adiantado/atrasado, % do CDI.

### Patrimônio → Investimentos

- **Número principal:** valor investido (sem os CDBs, que estão em Cofrinhos; uma
  linha diz "mais R$ X em CDBs, em Cofrinhos").
- **Suporte:** renda passiva do mês e média 12m; rentabilidade × CDI e IFIX; carteira
  por classe com meta; proventos (agenda); Onde aportar e Projeção como diálogos.

### Patrimônio → A receber

- **Número principal:** total a receber de pessoas.
- **Suporte:** uma seção por pessoa; registrar recebimento; perdoar.

### Ajustes

Abas ordenadas por frequência de uso. Novas: **Recorrentes e entradas previstas**
(contas recorrentes do RF20 e o freelance em USD), **IA** (liga e desliga cada uso,
com o que é enviado escrito; as duas aprovações explícitas moram aqui).

## 5. Fluxos principais

### F1 — Lançar um gasto

1. Toca **+** (centro da barra). Abre em **Gastei** (a intenção mais comum), com o
   campo de valor focado e o teclado numérico aberto.
2. Valor → categoria (sugerida por regra ou histórico) → conta (padrão: a última
   usada) → data (hoje).
   - Cartão: "entra na fatura que vence em 12/2026" e parcelas.
   - "Paguei por outra pessoa" e "Usei dinheiro de cofrinho" em Mais opções.
3. Salvar → aviso com **Desfazer** por 5 s. A régua do Mês já reflete o gasto.

Meta: três toques além de digitar o valor, quando a categoria vem sugerida.

### F2 — Posso gastar isso?

1. Abre o app em **Mês**.
2. Lê a régua: Previsto, Gasto, Contas a pagar, **Livre**.
3. Se a compra é de uma categoria específica, a tabela de categorias mostra a
   diferença dela. Se é no cartão, o Cartão diz em qual fatura cai.
4. Se o saldo projetado fica negativo em algum dia, isso já está na Atenção.

### F3 — Pagar a fatura

1. Atenção ("Fatura vence em 5 dias") → **Pagar**, ou Cartão → **Pagar fatura**.
2. Diálogo já preenchido: fatura que quita (ADR-010), conta de origem, valor total.
3. Confirma. Fatura fica paga ou parcial; nada entra como gasto.

### F4 — Guardar e resgatar

1. **+** → **Guardei**: cofrinho, valor; se há dívida com o cofrinho, pergunta "é
   devolução?" (RF18).
2. **+** → **Resgatei**: cofrinho, valor, finalidade (usado no objetivo, empréstimo,
   retirada definitiva).

### F5 — Importar extrato

1. Lançamentos → **Importar extrato** → conta → PDF.
2. Revisão: duplicadas desmarcadas, categoria sugerida, conferência pelo saldo
   diário antes do botão.
3. Confirmar: uma transação só.

### F6 — Ver investimentos

1. Patrimônio → **Investimentos**.
2. Valor investido, renda passiva, × CDI; carteira por classe.
3. Onde aportar → diálogo com a distribuição pelas regras.

### F7 — Colar notificação do banco (ideia 11)

1. Lançamentos → **Colar notificação** (ou o atalho de lançamento rápido).
2. Cola o texto → regra lê (IA como reserva, se aprovada) → abre **Gastei**
   preenchido.
3. Confere e salva.

### F8 — Freelance em dólar (ideia 21)

1. **+** → **Vou receber**: valor em USD, data prevista, conta de destino.
2. A estimativa em reais aparece na hora (PTAX × taxa efetiva calibrada) e entra
   no saldo projetado do Mês na data prevista.
3. Quando o dinheiro cai: o item da Atenção "Freelance previsto para hoje" vira
   **Recebi** preenchido; o valor em reais é o do extrato. Na primeira vez, o app
   deduz a taxa efetiva e passa a usá-la nas próximas estimativas.

### F9 — Conciliar (ideia 8)

1. Patrimônio → Visão → **Conciliar saldo** → conta → "o banco mostra R$ ___".
2. Diferença zero: grava a data da conciliação. Diferente: mostra os lançamentos
   desde a última conciliação e oferece "lançar a diferença como ajuste".

### F10 — Lançamento rápido (ideia 10)

Atalho na tela inicial do celular que abre direto em **Gastei** com o valor focado.
Como isso é feito depende da Etapa 7: numa PWA é um atalho do manifesto; no
Streamlit, um link com parâmetro (`?lancar=gastei`) salvo na tela inicial.

## 6. Nomes

Mantém a tabela de nomes da v2, com estas mudanças:

| Antes | Agora | Por quê |
|---|---|---|
| Resumo | **Mês** | Diz de que se trata e cabe na barra |
| Quanto ainda posso gastar | **Livre**, dentro da régua | O Pedro quer a conta inteira, não um número isolado |
| Sobra do mês | Linha em Guardado | Resultado, não decisão |
| Cofrinhos / Investimentos (destinos) | **Patrimônio** (abas) | Um lugar para "quanto eu tenho" |
| — | **Vou receber** (intenção) / **Entrada prevista** (registro) | Freelance em USD e outras entradas com data |
| — | **Conciliar saldo** | Termo de banco, curto |

Mantidos os proibidos da v2: emoji, exclamação, "meu/minha" em rótulo, adjetivo onde
um número responde.

## 7. Apêndice A: onde cada requisito mora

| RF | Onde |
|---|---|
| RF01, RF19 | Login no topo; Ajustes → Acesso |
| RF02, RF03 | Ajustes → Contas, Categorias e previsto |
| RF04/16 | Lançar (seis intenções) e Lançamentos (editar) |
| RF05 | Lançamentos → Importar extrato |
| RF06 | Mês → categorias; Ajustes → Categorias e previsto |
| RF07 | Cartão; Ajustes → Cartões |
| RF08 | Mês (gasto) e Patrimônio (saldo, poupança) |
| RF09/10/11/15 | Patrimônio → Investimentos |
| RF13 | Lançamentos → Exportar CSV |
| RF14, RF18 | Patrimônio → Cofrinhos; Lançar → Guardei, Resgatei |
| RF17 | Patrimônio → A receber |
| RF20 | Mês → Atenção; Ajustes → Recorrentes |
| RF21 | Mês, rodapé |
| RF22 | Detalhe da categoria; Patrimônio → Visão e Investimentos |
| RF23 | Patrimônio → Investimentos → Importar posição |

Nenhum requisito saiu.
