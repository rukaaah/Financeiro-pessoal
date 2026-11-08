# Auditoria final de interface (Etapa 10)

Revisão de `web/src` contra as Web Interface Guidelines (Vercel), com a skill
/web-design-guidelines, em 2026-11-04.

## Corrigido

| Achado | Onde | Correção |
|---|---|---|
| Foco visível só em botão e link | `estilo.css` | `:focus-visible` também em input, select, textarea e abas |
| Toque com atraso e realce azul do iOS | `estilo.css` | `touch-action: manipulation` e `-webkit-tap-highlight-color: transparent` |
| Rolagem da folha vazava para a página | `.folha` | `overscroll-behavior: contain` |
| Esc não fechava folha | `main.tsx` | atalho global de teclado |
| Campo focado escondido pela barra fixa | `html` | `scroll-padding-bottom: 96px` (zerado no desktop) |
| Listas longas renderizadas inteiras | `.lista > .item` | `content-visibility: auto` |
| `theme-color` azul diferente do fundo | `index.html` | uma cor por tema, igual ao papel |
| Select do importador sem cor explícita | `estilo.css` | fundo e cor do papel em todo select |
| Campos de valor com sugestões do navegador | telas | `autoComplete="off"` nos campos de dinheiro |
| Placeholders sem reticências | telas | terminam em "…" |
| Nomes de mês e dia escritos à mão | `mes.tsx`, `lancamentos.tsx` | `Intl.DateTimeFormat("pt-BR")` |
| Tela não aparecia no endereço | `main.tsx` | `#lancamentos`, `#cartao`… e o voltar do celular funciona |
| "Encerrar" conta recorrente num toque só | `ajustes.tsx` | confirmação em dois passos |

## Exceções mantidas, com motivo

- **Formato de dinheiro em texto exato** (`brl()`), não `Intl.NumberFormat`:
  o valor vem do banco como texto decimal e não passa por float (ADR-012).
- **Caixa de frase nos títulos**: é a convenção do português, a regra de
  Title Case é do inglês.
- **`autoFocus` no valor de Lançar**: pedido no briefing (lançar em 3 toques);
  só acontece quando a pessoa abre a folha.

## Versão desktop

Mobile first; a partir de 900 px:

- a barra inferior vira coluna lateral de 232 px, com "Lançar" no topo;
- o conteúdo vai até 1160 px;
- Mês, Cartão e Patrimônio (Visão) abrem em duas colunas (resumo à esquerda,
  detalhe à direita);
- as folhas viram diálogos centrados de até 560 px.

Conferido com prints a 1440 × 900 e 375 × 812: sem rolagem horizontal nas duas
larguras, e Esc fecha a folha nas duas.

## Segunda passada (2026-11-08)

Mesmas regras (Web Interface Guidelines, versão atual do repositório
`vercel-labs/web-interface-guidelines`), agora com as telas que entraram depois
de 04/11: revisão do extrato, troca entre contas, edição de lançamentos, saldo
do cofrinho.

| Achado | Onde | Correção |
|---|---|---|
| Nenhum retorno de hover no desktop | `estilo.css` | `@media (hover:hover)`: botões clareiam, links sublinham, abas escurecem |
| Datas `dd/mm` montadas à mão em 8 lugares | telas | `diaMes()` e `diaCompleto()` em `api.ts`, com `Intl.DateTimeFormat("pt-BR")` |
| Aba do Patrimônio fora do endereço | `patrimonio.tsx` | `#patrimonio/cofrinhos`, `#patrimonio/a-receber`…; recarregar volta na aba |
| "Corrigir saldo" com recuo na faixa vermelha | `.link-sub` | `padding:0` (o botão herdava o padding do navegador) |
| Texto longo na faixa de aviso podia vazar | `.achado` | `min-width:0` e `overflow-wrap:anywhere` |
| Placeholders novos sem reticências | `lancar.tsx`, `entrada.tsx` | terminam em "…" com exemplo |
| Ticker com corretor e sugestões | `investimentos.tsx` | `spellcheck=false`, `autocomplete=off`, maiúsculas |
| Títulos sem balanceamento de linha | `h1`, `h3` | `text-wrap: balance` (o `h2` já tinha) |

Conferido sem achado: botões só de ícone com `aria-label`, todo campo com
rótulo, toasts e erros com `role="status"`/`role="alert"`, foco visível, sem
`transition: all`, animações só com `prefers-reduced-motion: no-preference`,
zoom liberado, `theme-color` e `color-scheme` por tema, safe areas, sem rolagem
horizontal a 390 px (medido com Playwright).

Exceções novas, com motivo:

- **Inputs sem `name`**: nenhum formulário é enviado pelo navegador; o valor
  vai por `fetch` a partir do estado.
- **Fundo do véu com `onClick`**: fecha a folha; o teclado tem Esc e o botão
  Fechar, então não há ação só de mouse.
