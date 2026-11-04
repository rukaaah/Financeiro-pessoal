# Etapa 3 — Ideias de praticidade (parcial)

Data: 2026-11-04. **Estado: incompleto.** A parte do Reddit está bloqueada; o que
está abaixo vem da Etapa 2 (produtos) e da Etapa 1 (diagnóstico).

## Por que a parte do Reddit não foi feita

Tentei três caminhos e os três foram recusados pelo ambiente desta sessão:

| Caminho | Resultado |
|---|---|
| Buscar e ler a página do Reddit (`www.reddit.com`) | A ferramenta de leitura não acessa o Reddit |
| Abrir no navegador embutido (`old.reddit.com`) | Bloqueado pelo navegador embutido por política de segurança |
| Ler espelhos públicos das mesmas discussões | Recusado pelo controle de permissões, por contornar a proteção do site |

As buscas devolveram títulos e trechos de discussões, mas o pedido exige fonte
aberta e lida ("snippet de busca não é fonte"), então nada do Reddit entrou aqui.

**Caminhos possíveis** (decisão do Pedro):

1. **Claude in Chrome**: eu leio as discussões no Chrome do Pedro, onde o Reddit abre
   normalmente. Precisa da extensão conectada e da autorização para usar o Chrome.
2. **Liberar a leitura de espelhos** do Reddit para esta sessão, nas permissões do
   Claude Code. Os espelhos mostram o mesmo conteúdo, com o link original.
3. **Seguir sem o Reddit**: a coluna "repetições" fica vazia e a origem das ideias
   fica restrita a produtos e diagnóstico.

## Palavras-chave planejadas

Inglês: `budgeting app feature request`, `what I wish my budget app had`,
`best personal finance app features`, `YNAB vs`, `expense tracker friction`,
`manual transaction entry app`, `sinking funds app`, `bill reminders app`,
`credit card statement budgeting`, e ampliações: `budget app undo`,
`recurring transactions auto`, `cash flow forecast app`, `split expenses app`.
Português: `app de finanças pessoais`, `controle financeiro aplicativo`,
`Mobills vs Organizze`, `planilha ou aplicativo de finanças`.
Subreddits: r/personalfinance, r/ynab, r/budget, r/povertyfinance, r/frugal,
r/investimentos, r/brasil.

## Ideias até aqui

Esforço: P (dias), M (uma a duas semanas), G (mais que isso). Impacto para o uso
diário de uma pessoa. "Apêndice A" diz se o requisito já existe.

| # | Ideia | Origem | Problema que resolve | Esforço | Impacto | Apêndice A |
|---|---|---|---|---|---|---|
| 1 | **Uma conta só para "quanto resta"**, com a decomposição escrita (previsto − gasto − contas a pagar) e usada por Resumo, Orçamento e "Onde ainda cabe" | Diagnóstico | Três números diferentes para a mesma pergunta | P | alto | parcial (RF06, RF08) |
| 2 | **Rótulo de critério** em todo total de gasto: "pelo mês da fatura" ou "pela data" | Diagnóstico | Dois gastos do mês sem explicação | P | alto | não |
| 3 | **Patrimônio líquido** num número só: contas + cofrinhos + investimentos + a receber − faturas em aberto | Diagnóstico; Pierre (visão consolidada) | Nenhuma tela responde "quanto eu tenho" | P | médio | parcial (RF08) |
| 4 | CDB aparece num lugar só (cofrinho **ou** renda fixa, com o outro só apontando) | Diagnóstico | Patrimônio contado duas vezes | P | médio | parcial (regra dos CDBs) |
| 5 | **Editar, excluir e desfazer** lançamento | Diagnóstico; Organizze ("exclusão rápida") | Erro de digitação é permanente | M | alto | não (RF04 só cria) |
| 6 | **Conta recorrente vira lançamento sugerido** no dia: um toque confirma | Diagnóstico; Mobills (despesas fixas de cartão) | Redigitar todo mês o que já se sabe | M | alto | parcial (RF20 só alerta) |
| 7 | **Saldo projetado dia a dia** até o fim do mês, com o dia em que fica negativo | Diagnóstico; Pierre e Organizze (projeção) | A Atenção dá o total, não o "quando" | M | alto | parcial (RF20) |
| 8 | **Conciliação**: digitar o saldo que o banco mostra e o app aponta a diferença | Diagnóstico | Número do app deixa de ser confiável sem que se perceba | P | alto | parcial (RF05 valida só na importação) |
| 9 | Comparação com o **mês anterior e a média de 3 meses** na linha de cada categoria | Diagnóstico; Mobills (comparações mensais, Canaltech 2021) | "Gastei mais que o normal?" | P | médio | parcial (RF22, em aba separada) |
| 10 | **Lançamento rápido** no celular: atalho na tela inicial que abre direto em "Gastei" com valor focado | Etapa 2 (esforço de lançar é o gargalo em todos) | Abrir o app, esperar, Lançar, intenção, quatro campos | M | alto | não |
| 11 | **Colar o texto da notificação ou do SMS** do banco e o app preenche valor, data e estabelecimento | Organizze (lê notificações e SMS, iDinheiro 2026) | Digitar o que o banco já escreveu | M | alto | não |
| 12 | **Importar extrato PicPay (PDF)** com regras e deduplicação | Organizze (importa transações); Apêndice A | Lançar em lote | G | alto | sim (RF05) |
| 13 | **Categoria sugerida** pelo histórico do estabelecimento, antes de qualquer IA | Organizze (categorização automática) | Escolher categoria toda vez | P | médio | parcial (RF05 tem regras) |
| 14 | **Alerta de cobrança duplicada e de assinatura nova** | Pierre (Albert) | Cobrança indevida passa despercebida | M | médio | não |
| 15 | **Aviso por e-mail** de conta que vence (o app web não tem push) | Organizze ("Alerta de contas a pagar" no plano mais barato) | A aba Atenção só ajuda quem abre o app | M | médio | parcial (RF20) |
| 16 | **Perguntar aos dados** em linguagem natural ("quanto gastei com delivery em 2026?"), só no modo real | Pierre; Organizze via MCP | Relatório que não existe pronto | G | médio | parcial (RF21 copia resumo) |
| 17 | **Exportar CSV** | Apêndice A; Organizze (exporta planilha) | Sair do app com os dados | P | baixo | sim (RF13) |
| 18 | **Dados de exemplo coerentes**, gerados por uma regra (sem datas no futuro, compras dentro do ciclo) | Diagnóstico | O demo ensina o sistema errado | P | alto | parcial (requisito 1) |
| 19 | **Ação que não grava não mostra confirmação** (enquanto houver dado de exemplo) | Diagnóstico | `st.toast` confirma o que não aconteceu | P | médio | não |
| 20 | **Data da última atualização** em todo saldo e cotação | Diagnóstico | Saber se o número é de hoje | P | médio | parcial (RF10 para cotações) |

## Decisões pendentes que entram junto no Portão 1

| Pendência | Recomendação |
|---|---|
| ADR-013, modelo recorrente de previsto | Padrão por categoria com vigência histórica, ajuste do mês como exceção, receita com o mesmo mecanismo e renda base como soma dos padrões de receita (a inclinação do próprio ADR) |
| RF20, urgências e prazos | Manter Essencial, Importante, Adiável; lembrete 3 dias antes, fatura 5 dias antes, orçamento em 80% |
| RF23, prints de investimento | Preciso de prints de exemplo do Inter e do PicPay, com números trocados por fictícios antes de enviar |
