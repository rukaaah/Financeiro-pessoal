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
