"""Mede quanto tempo o Neon leva para acordar depois de hibernar.

É a validação da T9 que decide se a combinação Community Cloud + Neon no plano
gratuito é aceitável: as duas latências se somam, e quem abre o app depois de
um período de inatividade paga as duas.

O script não recebe nem imprime a URL de conexão — ela vem de `DATABASE_URL` no
ambiente, e o relatório mostra só tempos e o host sem credenciais.

Uso:

    export DATABASE_URL='<conexão do branch dev, nunca production>'
    uv run python scripts/medir_cold_start.py

Para medir o cold start de verdade, o compute precisa estar hibernado antes.
No plano gratuito isso acontece após alguns minutos sem conexão; o painel do
Neon mostra o endpoint como `idle`. Rodar com o compute acordado mede a
latência morna, que também é informação útil — o script diz qual dos dois caso
ele acha que mediu.
"""

import os
import statistics
import sys
import time
from urllib.parse import urlsplit

import psycopg

# Acima disto, a primeira visita depois da hibernação fica ruim o bastante para
# o UptimeRobot (ADR-002) passar de conveniência a necessidade.
LIMITE_ACEITAVEL_S = 5.0
REPETICOES_MORNAS = 3


def _host_sem_credencial(url: str) -> str:
    """Só o host, para o relatório poder ser colado em qualquer lugar."""
    partes = urlsplit(url)
    return partes.hostname or "(host desconhecido)"


def _mede_conexao(url: str) -> float:
    inicio = time.perf_counter()
    with psycopg.connect(url, connect_timeout=60) as conexao, conexao.cursor() as cur:
        cur.execute("SELECT 1")
        cur.fetchone()
    return time.perf_counter() - inicio


def main() -> int:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        print("DATABASE_URL não definida.", file=sys.stderr)
        return 2
    url = url.replace("postgresql+psycopg://", "postgresql://")

    print(f"Host: {_host_sem_credencial(url)}")
    print()

    try:
        primeira = _mede_conexao(url)
    except psycopg.OperationalError as erro:
        # Sem a URL na mensagem: o repositório é público.
        print(f"Falha ao conectar: {erro.__class__.__name__}", file=sys.stderr)
        return 1

    mornas = [_mede_conexao(url) for _ in range(REPETICOES_MORNAS)]
    mediana_morna = statistics.median(mornas)

    print(f"Primeira conexão:  {primeira:6.2f}s")
    print(f"Conexões seguintes: {mediana_morna:6.2f}s  (mediana de {REPETICOES_MORNAS})")
    print()

    # Se a primeira não foi muito mais lenta que as seguintes, o compute já
    # estava acordado e o número não é um cold start.
    acordou_agora = primeira > mediana_morna * 3 and primeira > 1.0

    if acordou_agora:
        print(f"Parece ter sido um cold start: {primeira:.2f}s para acordar.")
        if primeira > LIMITE_ACEITAVEL_S:
            print(
                f"Acima do limite de {LIMITE_ACEITAVEL_S:.0f}s. Somado ao tempo do "
                "Community Cloud, a primeira visita fica lenta — o ping do "
                "UptimeRobot deixa de ser conveniência e passa a ser necessário."
            )
        else:
            print(f"Dentro do limite de {LIMITE_ACEITAVEL_S:.0f}s.")
    else:
        print(
            "O compute já estava acordado: isto é latência morna, não cold start.\n"
            "Para medir o cold start, espere o endpoint ficar `idle` no painel do "
            "Neon e rode de novo."
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
