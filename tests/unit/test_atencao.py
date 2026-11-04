"""Regras da aba Atenção (RF20): contas recorrentes, em risco, adiar e resolver.

Funções puras de `app.alertas`; a tela só desenha o que elas devolvem.
"""

from datetime import date
from decimal import Decimal

from app.alertas import em_risco, pendencias, saidas_do_mes, visiveis
from app.blocos import Alerta
from app.modelos import (
    Cofrinho,
    CompraNaFatura,
    ContaRecorrente,
    Fatura,
    LinhaDeOrcamento,
    SaidaPrevista,
    SituacaoDaFatura,
    Urgencia,
)

HOJE = date(2026, 10, 30)
OUTUBRO = date(2026, 10, 1)


def _conta(
    nome: str,
    valor: str,
    vence: date,
    urgencia: Urgencia = Urgencia.IMPORTANTE,
    paga_em: date | None = None,
) -> ContaRecorrente:
    return ContaRecorrente(
        nome, Decimal(valor), vence.day, "Casa", "PicPay", urgencia, vence, paga_em=paga_em
    )


def _saida(nome: str, valor: str, dia: int, urgencia: Urgencia) -> SaidaPrevista:
    return SaidaPrevista(f"conta:{nome}", nome, Decimal(valor), date(2026, 10, dia), urgencia)


def _cofrinho(nome: str, saldo: str, *, reserva: bool = False) -> Cofrinho:
    zero = Decimal(0)
    return Cofrinho(
        nome, Decimal(saldo), None, None, zero, zero, zero, zero, reserva_de_emergencia=reserva
    )


# ------------------------------------------------------------- contas recorrentes


def test_conta_vencida_e_critica_e_perto_de_vencer_e_atencao() -> None:
    contas = [
        _conta("Luz", "120", date(2026, 10, 28)),
        _conta("Internet", "100", date(2026, 10, 31)),
        _conta("Streaming", "45", date(2026, 11, 20)),  # longe: não avisa
        _conta("Celular", "60", date(2026, 10, 20), paga_em=date(2026, 10, 20)),  # paga
    ]
    itens = pendencias(HOJE, [], [], [], [], 11, contas)
    assert [(a.gravidade, a.titulo) for a in itens] == [
        ("critico", "Luz venceu 28/10"),
        ("atencao", "Internet vence amanhã"),
    ]
    assert itens[0].acao is not None
    assert itens[0].acao.destino == "pagar:Luz"


def test_dentro_da_gravidade_vem_primeiro_o_que_vence_antes() -> None:
    """A conta que vence amanhã não pode ficar atrás de um aviso sem data."""
    contas = [_conta("Internet", "10", date(2026, 10, 31))]
    cofrinho = Cofrinho(
        "Reserva",
        Decimal("1000"),
        None,
        None,
        Decimal(0),
        Decimal(0),
        Decimal(0),
        Decimal("500"),  # a devolver: alerta de atenção sem data, valor maior
    )
    itens = pendencias(HOJE, [], [], [cofrinho], [], 11, contas)
    assert [a.titulo for a in itens] == ["Internet vence amanhã", "Devolver ao cofrinho Reserva"]


def test_varias_categorias_perto_do_limite_viram_um_item() -> None:
    orcamento = [
        LinhaDeOrcamento("G", nome, Decimal("100"), Decimal(gasto))
        for nome, gasto in (("Mercado", "90"), ("Hobbies", "95"), ("Folgada", "10"))
    ]
    itens = pendencias(HOJE, orcamento, [], [], [], 11)
    assert [a.titulo for a in itens] == ["2 categorias perto do limite"]
    assert itens[0].texto == "Hobbies (R$ 5,00), Mercado (R$ 10,00)"


# -------------------------------------------------------------- a pagar no mês


def test_saidas_do_mes_tem_contas_pendentes_e_faturas_que_vencem_no_mes() -> None:
    contas = [
        _conta("Luz", "120", date(2026, 10, 28)),
        _conta("Celular", "60", date(2026, 10, 20), paga_em=date(2026, 10, 20)),
    ]
    compra = (CompraNaFatura(date(2026, 10, 2), "x", "Mercado", Decimal("300")),)
    faturas = [
        Fatura("Unicred", date(2026, 10, 1), SituacaoDaFatura.ABERTA, compra),  # vence 11/10
        Fatura("Unicred", date(2026, 11, 1), SituacaoDaFatura.ABERTA, compra),  # novembro
    ]
    saidas = saidas_do_mes(OUTUBRO, faturas, 11, contas)
    assert [(s.nome, s.vence_em.day, s.urgencia) for s in saidas] == [
        ("Fatura Unicred", 11, Urgencia.ESSENCIAL),
        ("Luz", 28, Urgencia.IMPORTANTE),
    ]


# ------------------------------------------------------------------- em risco


def test_saldo_vai_primeiro_para_o_essencial() -> None:
    """Com R$ 150: a luz essencial é coberta; a internet e o streaming ficam em risco."""
    saidas = [
        _saida("Internet", "100", 31, Urgencia.IMPORTANTE),
        _saida("Luz", "120", 28, Urgencia.ESSENCIAL),
        _saida("Streaming", "45", 31, Urgencia.ADIAVEL),
    ]
    risco = em_risco(Decimal("150"), saidas, [_cofrinho("Viagem", "950")])
    assert [(r.saida.nome, r.falta, r.cofrinho_que_cobre) for r in risco] == [
        ("Internet", Decimal("70"), "Viagem"),
        ("Streaming", Decimal("45"), "Viagem"),
    ]


def test_saldo_que_cobre_tudo_nao_tem_risco() -> None:
    saidas = [_saida("Luz", "120", 28, Urgencia.ESSENCIAL)]
    assert em_risco(Decimal("120"), saidas, []) == []


def test_reserva_so_cobre_quando_nenhum_outro_cofrinho_cobre() -> None:
    saidas = [_saida("Aluguel", "800", 31, Urgencia.ESSENCIAL)]
    cofrinhos = [_cofrinho("Jogos", "300"), _cofrinho("Reserva", "2000", reserva=True)]
    (risco,) = em_risco(Decimal("0"), saidas, cofrinhos)
    assert (risco.cofrinho_que_cobre, risco.cofrinho_e_reserva) == ("Reserva", True)


def test_o_mesmo_dinheiro_do_cofrinho_nao_cobre_duas_faltas() -> None:
    saidas = [
        _saida("Luz", "200", 28, Urgencia.ESSENCIAL),
        _saida("Internet", "200", 31, Urgencia.ESSENCIAL),
    ]
    risco = em_risco(Decimal("0"), saidas, [_cofrinho("Viagem", "300")])
    assert [r.cofrinho_que_cobre for r in risco] == ["Viagem", None]


# ------------------------------------------------------------ adiar e resolver


def _alerta(gravidade: str, chave: str) -> Alerta:
    return Alerta(gravidade, chave, "", chave=chave)  # type: ignore[arg-type]


def test_lembrar_amanha_some_hoje_e_volta_amanha() -> None:
    itens = [_alerta("atencao", "a")]
    adiado = {"a": HOJE}
    assert visiveis(itens, HOJE, adiado, {}) == []
    assert visiveis(itens, date(2026, 10, 31), adiado, {}) == itens


def test_resolvido_some_ate_o_fim_do_mes() -> None:
    itens = [_alerta("atencao", "a")]
    resolvido = {"a": date(2026, 10, 2)}
    assert visiveis(itens, HOJE, {}, resolvido) == []
    assert visiveis(itens, date(2026, 11, 1), {}, resolvido) == itens


def test_critico_resolvido_nao_some_por_mais_de_um_dia() -> None:
    itens = [_alerta("critico", "c")]
    resolvido = {"c": HOJE}
    assert visiveis(itens, HOJE, {}, resolvido) == []
    assert visiveis(itens, date(2026, 10, 31), {}, resolvido) == itens
