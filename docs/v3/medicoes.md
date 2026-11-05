# Medições da v3

Script: `scripts/medir_v3.mjs`, num Chrome sem interface controlado pelo protocolo
de depuração, com o perfil **"4G lento" do Lighthouse para celular**: 150 ms de RTT,
1,6 Mbps de descida, 750 kbps de subida, CPU 4× mais lenta, tela de 375 × 812. É mais
duro que um 4G comum. As medições saem daqui (Paranavaí, PR), contra o Worker publicado.

## Fatia 0 — 2026-11-04, Worker em `*.workers.dev`, branch `dev` do Neon acordado

| Métrica | Meta | Medido | Streamlit publicado (Etapa 1, banda larga) |
|---|---|---|---|
| Primeira visita, até o número aparecer | ≤ 1,5 s | **1.168 ms** (casca em 939 ms) | 2.311 a 2.672 ms, sem número nenhum |
| Visitas seguintes (casca do cache), até o número | ≤ 1,5 s | **323 a 528 ms** | — |
| `/api/saude`, 10 pedidos | p50 ≤ 300, p95 ≤ 800 ms | **p50 164 ms, p95 173 ms** | — |
| Tempo do banco dentro do Worker | — | 9 a 23 ms | — |

O `/api/saude` fica em ~1 RTT do perfil (150 ms) mais ~14 ms: o Worker com Smart
Placement e o Neon em São Paulo quase não somam tempo. **Critério de saída da fatia 0
atingido** (ADR-015).

Ainda não medido: cold start do Neon pelo Worker (o compute estava acordado) e o
tempo de toque, que só existe a partir da fatia 2.

## Fatia 2 — 2026-11-04, Lançar e Lançamentos no ar

Script: `scripts/medir_toque_v3.mjs`, mesmo perfil (4G lento, CPU 4×, 375 × 812).

| Métrica | Meta | Medido |
|---|---|---|
| Troca de tela (Mês → Lançamentos) | ≤ 300 ms | **35 ms** |
| Abrir o Lançar | ≤ 200 ms de feedback | **45 ms** |
| Salvar: a folha fecha e aparece "Lançando…" | ≤ 200 ms de feedback | **26 ms** |
| Salvar: "Lançado." com a lista já atualizada | — | 546 ms (gravação + releitura da lista, duas idas ao Worker) |
| Desfazer | — | 331 ms |

O feedback do toque não depende da rede: a resposta visual é local e a gravação
acontece por trás.

## Medição final (Etapa 10) — 2026-11-04, depois da auditoria e da versão desktop

Mesmo perfil (4G lento, CPU 4×, 375 × 812), contra o Worker publicado, perfil de
navegador novo a cada visita (sem cache e sem service worker).

A primeira rodada deu **2,3 s** na primeira visita: o app abria seis pedidos ao mesmo
tempo e só depois de baixar e rodar o JavaScript. Duas correções (PRs 29 a 31):

1. primeiro os dados da tela aberta e a sessão; opções, cartão e patrimônio vêm depois;
2. um script de 5 linhas no `<head>` dispara `/api/mes` e `/api/sessao` assim que o
   HTML chega, em paralelo com o download do JavaScript.

Oito primeiras visitas seguidas, até o número do Mês aparecer:

| Visita | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Número na tela (ms) | 2.463 | 2.297 | 838 | 840 | 7.552 | 849 | 1.695 | 1.033 |
| Resposta do HTML (ms) | 675 | 1.176 | 139 | 145 | 1.180 | 168 | 490 | 367 |

Quando a rede responde no tempo do perfil (HTML em ~150 ms), o número aparece em
**~840 ms**, abaixo da meta de 1,5 s. As visitas lentas foram lentas antes do app: o
próprio HTML estático levou de 0,5 a 1,2 s, e na visita 5 o JavaScript levou 6 s para
baixar. Isso é a rede daqui no momento da medição, não o Worker; a visita 1 também
pegou o Worker recém-publicado (o `/api/mes` levou 1,7 s e o `/api/sessao`, 0,5 s).

| Métrica | Meta | Medido |
|---|---|---|
| Primeira visita, rede no tempo do perfil | ≤ 1,5 s | **838 a 1.033 ms** |
| Visitas seguintes (casca do cache) | ≤ 1,5 s | **322 a 325 ms** |
| `/api/saude`, 10 pedidos | p50 ≤ 300, p95 ≤ 800 ms | **p50 158 ms, p95 166 ms** |
| Troca de tela | ≤ 300 ms | **20 ms** |
| Abrir o Lançar | ≤ 200 ms | **49 ms** |
| Salvar: feedback | ≤ 200 ms | **16 ms** (confirmado em 593 ms) |
| Tela branca | nunca | a casca com esqueletos aparece antes dos dados em todas as visitas |
