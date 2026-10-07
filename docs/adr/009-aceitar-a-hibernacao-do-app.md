# ADR-009 — Aceitar a hibernação do app e dispensar o monitor externo

- **Status:** Aceito
- **Data:** 2026-10-07
- **Substitui:** a decisão de monitoramento do
  [ADR-002](002-hospedagem-community-cloud.md). O resto daquele ADR —
  Community Cloud para o app, GitHub Actions para os jobs — continua valendo.

## Contexto

O ADR-002 previu um monitor do UptimeRobot com dois propósitos: avisar de queda
e **manter o container acordado**, reduzindo a hibernação do Streamlit Community
Cloud.

Ao fechar as validações da T9, os dois propósitos se mostraram frágeis:

| Propósito | O que se verificou |
|---|---|
| Manter acordado | **Não funciona.** O Community Cloud dorme após 12h de inatividade (era 7 dias quando o ADR-002 foi escrito), e o Streamlit mudou o que conta como atividade: um ping HTTP checa o backend mas não carrega a página, e não reseta o timer. |
| Avisar de queda | Fraco. Um app dormindo responde como "no ar", então o monitor erraria nos dois sentidos: silencioso quando a pessoa vê a tela de sono, e ruidoso a cada 12h de ociosidade. |

Agrava dois pontos: desde abril de 2025 nem um push no repositório acorda um app
dormindo — só um visitante clicando em "Yes, get this app back up!" — e o reset
noturno do demo não ajuda, porque escreve no banco sem visitar o app.

Separadamente, a medição do cold start do Neon (ver
[validacoes.md](../validacoes.md)) mostrou que o banco acorda em ~0,4s. A
preocupação original do ADR-002, de que as duas latências se somariam, era
desproporcional: o banco é desprezível.

## Decisão

**Não haverá monitor externo, e a hibernação do app é aceita.**

Quem abrir o app depois de 12h sem visita vê a tela de sono do Streamlit e clica
uma vez para acordá-lo. Não há erro, nem perda de dado, e o carregamento seguinte
é normal.

A alternativa real — um workflow agendado abrindo a página num navegador de
verdade, a cada ~10h — foi considerada e recusada por ora. Ver abaixo.

## Consequências

**A favor:**

- Nenhuma dependência nova, nenhum workflow a manter, nenhuma conta de terceiro
  no caminho.
- Nada que possa quebrar em silêncio quando o Streamlit mudar de política outra
  vez — e ele já mudou duas vezes: 7 dias → 72h → 12h, e o que conta como
  atividade.
- Na prática o cenário ruim é estreito: compartilhar o link já é uma visita, e
  ela reseta o timer. O caso que resta é o link parado por mais de 12h e alguém
  abrindo sem aviso.

**Contra:**

- Num projeto de portfólio, a primeira impressão de quem chega "do nada" pode
  ser uma tela de sono em vez do sistema. É o custo aceito, conscientemente: um
  clique.
- Não há alerta nenhum se o app cair de verdade. Como não há usuário além do
  dono, descobrir pelo uso é suficiente — isto mudaria se houvesse um segundo
  usuário real.

## Alternativas consideradas

- **Keep-alive com carregamento real de página** (Playwright num workflow a cada
  ~10h). Funciona, e os minutos do Actions são gratuitos em repositório público.
  Recusada por ora: traz um navegador para o CI e um workflow que depende de uma
  política que o Streamlit já mudou duas vezes. Se a hibernação passar a
  incomodar de fato, é esta a saída — e o custo de adotá-la depois é baixo.
- **Manter o UptimeRobot apenas como alerta,** sem a ilusão de manter acordado.
  Recusada: avisaria errado nos dois sentidos, e um alerta em que não se confia
  é pior que nenhum.
- **Sair do Community Cloud** para uma hospedagem sem hibernação. Recusada: todas
  as opções sem hibernação custam dinheiro, e o custo zero é restrição dura do
  projeto (ADR-002).
