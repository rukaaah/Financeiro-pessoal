# Design Brief: Financeiro pessoal — app completo (Fase 1 + Investimentos)

> Fonte das decisões: grill-me de 2026-10-08, `CLAUDE.md`, ADR-001 a 009 e o
> planejamento privado (RF01–RF19). Texto voltado ao usuário em português do Brasil.

## Problem

Hoje o orçamento vive numa planilha com fórmulas quebradas: aporte conta como gasto,
fatura de cartão some do mês certo, o "Emergência" virou categoria genérica e não
dá para saber, no celular e na hora, quanto ainda posso gastar neste mês. Lançar um
gasto exige abrir a planilha, achar a linha e digitar quatro campos.

## Solution

Um app que responde, na primeira tela, "quanto posso gastar e quanto já guardei este
mês", deixa lançar um gasto em poucos toques no celular, e mostra por trás dessa
resposta o orçamento, as faturas, os cofrinhos, o que tenho a receber e a carteira de
investimentos com proventos previstos. Quem chega sem login vê o mesmo app com dados
fictícios.

## Experience Principles

1. Resposta antes de detalhe -- a tela inicial entrega o número que decide (sobra do
   mês, gasto × previsto, guardado), e cada número abre o detalhe.
2. Lançar é a ação principal -- um botão fixo e acessível abre o lançamento rápido
   (valor, categoria, conta; data = hoje) em qualquer página, no celular.
3. Cor só para estado -- verde/âmbar/vermelho indicam dentro, perto e fora do
   orçamento; todo o resto é neutro. Densidade alta, sem decoração.

## Aesthetic Direction

- **Philosophy**: sóbrio, denso e legível; interface de ferramenta financeira,
  não de marketing.
- **Tone**: calmo e confiável.
- **Reference points**: extrato bancário bem diagramado; planilha limpa com
  hierarquia clara.
- **Anti-references**: gradientes, cards decorativos, emoji, dashboards "de template"
  com gráficos de pizza.

## Existing Patterns

- Typography: padrão do Streamlit (sans-serif do tema).
- Colors: `primaryColor = #1f6f54`, tema `light` (`.streamlit/config.toml`).
- Spacing: padrão do Streamlit; sem CSS próprio.
- Components: `st.navigation` com 7 páginas placeholder, `app/layout.py:cabecalho`
  (faixa "Dados fictícios" + identificação), `app/composicao.py` (sessão).

## Component Inventory

| Component | Status | Notes |
| --- | --- | --- |
| Tela de entrada (Google / Ver demonstração) | New | visitante escolhe; hoje cai direto no demo |
| Cabeçalho com faixa de demo | Exists | mantido |
| Botão e diálogo "Lançar" | New | `st.dialog`, presente em todas as páginas |
| Cartão de métrica (valor, comparação, estado) | New | sobre `st.metric`/`st.container` |
| Barra planejado × realizado | New | por categoria, cor por estado |
| Tabela de lançamentos | New | `st.dataframe`, filtros em `st.popover` |
| Linha de fatura (mês, total, paga/aberta) | New | pagamento aponta a fatura que quita |
| Cartão de cofrinho | New | saldo, meta, deveria ter, a devolver |
| Cartão de pessoa (a receber) | New | saldo e itens em aberto |
| Tabela de FIIs (DY, P/VP, valorização) | New | dados raspados, com data da última leitura |
| Projeção de renda | New | premissas editáveis |
| Importação com revisão linha a linha | New | só estrutura; parser é placeholder |
| Configurações e Acesso (admin) | New | Acesso só para `is_admin` |

## Key Interactions

- **Lançar**: botão → diálogo com valor, categoria e conta; data = hoje, descrição
  opcional; conta de cartão mostra "entra na fatura que vence em MM/AAAA" antes de
  salvar; pagar por outra pessoa vira valor a receber; salvar fecha o diálogo e
  confirma com `st.toast`.
- **Orçamento**: mês navegável; previsto vem do modelo recorrente com ajuste do mês;
  gasto e guardado aparecem separados; sobra = renda − gasto − guardado; renda acima
  do previsto aparece como "acima do previsto".
- **Cartões**: faturas por mês de vencimento; pagar escolhe a fatura que quita;
  parcelas futuras projetadas.
- **Cofrinhos**: aportar e resgatar; resgate exige finalidade (usado, empréstimo,
  retirada definitiva); "a devolver" visível no cartão.
- **Investimentos**: tabela comparativa, proventos previstos do mês (marcados como
  estimado antes do anúncio), projeção em 6/12/24 meses com premissas editáveis;
  mostra a data do último dado raspado e o último valor se a fonte falhar.

## Responsive Behavior

Celular primeiro. Uma coluna por padrão; métricas em grade 2×N; tabelas largas em
rolagem horizontal; filtros dentro de popover. Em telas largas, até 3 colunas de
cartões. Barra lateral recolhida no celular, com o botão Lançar também no corpo
da página.

## Accessibility Requirements

Contraste mínimo 4,5:1 no texto; estado nunca só por cor (ícone e rótulo
acompanham); foco visível; rótulo em todo campo; alvos de toque ≥ 44 px.

## Out of Scope

Importador de OFX do Inter e OCR da fatura (Fase 2/3), classificador de categorias,
lançamento rápido por texto, exportação CSV, recomendação de compra de ativos.
Integrações reais com o banco, scraping e login ficam como placeholders marcados
`TODO(claude-code)`.
