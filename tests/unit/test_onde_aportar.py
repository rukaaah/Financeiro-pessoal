"""A regra do "Onde aportar": pelas metas e critérios do usuário, nunca por palpite.

É dinheiro de verdade quando os dados forem reais, então o que a regra promete
na tela (soma bate, critério barra, cota é inteira) vira teste.
"""

from decimal import Decimal

from app.carteira import RENDA_FIXA, Ativo, Criterios, onde_aportar


def _fii(
    codigo: str, classe: str, valor: str, preco: str, p_vp: str, liq: str = "1000000"
) -> Ativo:
    return Ativo(
        codigo,
        codigo,
        classe,
        valor=Decimal(valor),
        custo=Decimal(valor),
        cotas=int(Decimal(valor) / Decimal(preco)),
        preco=Decimal(preco),
        p_vp=Decimal(p_vp),
        liquidez_diaria=Decimal(liq),
    )


CARTEIRA = (
    _fii("BARA11", "Papel", "1000", "10", "0.90"),
    _fii("CARO11", "Papel", "1000", "10", "1.10"),
    _fii("ILIQ11", "Tijolo", "500", "100", "0.80", liq="1000"),
    Ativo("CDB", "CDB", RENDA_FIXA, Decimal("2500"), Decimal("2500")),
)
META = {"Papel": Decimal("50"), "Tijolo": Decimal("20"), RENDA_FIXA: Decimal("30")}


def test_a_soma_das_sugestoes_e_o_aporte() -> None:
    sugestoes, _ = onde_aportar(Decimal("777.77"), CARTEIRA, META, Criterios())
    assert sum(s.valor for s in sugestoes) == Decimal("777.77")


def test_criterio_do_usuario_barra_o_ativo_e_diz_por_que() -> None:
    sugestoes, barrados = onde_aportar(Decimal("1000"), CARTEIRA, META, Criterios())
    motivos = {b.codigo: b.motivo for b in barrados}
    assert "P/VP" in motivos["CARO11"]
    assert "liquidez" in motivos["ILIQ11"]
    assert {s.destino for s in sugestoes}.isdisjoint({"CARO11", "ILIQ11"})


def test_fii_sai_em_cotas_inteiras_e_a_sobra_vai_para_o_destino_dela() -> None:
    sugestoes, _ = onde_aportar(Decimal("1000"), CARTEIRA, META, Criterios(destino_da_sobra="CDB"))
    for s in sugestoes:
        if s.cotas is not None:
            assert s.valor == Decimal("10") * s.cotas
    assert sugestoes[-1].destino == "CDB"


def test_entre_elegiveis_escolhe_o_menor_p_vp() -> None:
    barato = _fii("BARA11", "Papel", "1000", "10", "0.90")
    mais_barato = _fii("MUIT11", "Papel", "1000", "10", "0.85")
    carteira = (
        barato,
        mais_barato,
        Ativo("CDB", "CDB", RENDA_FIXA, Decimal("3000"), Decimal("3000")),
    )
    sugestoes, _ = onde_aportar(
        Decimal("1000"), carteira, {"Papel": Decimal("70"), RENDA_FIXA: Decimal("30")}, Criterios()
    )
    assert sugestoes[0].destino == "MUIT11"


def test_aporte_zero_nao_sugere_nada() -> None:
    assert onde_aportar(Decimal(0), CARTEIRA, META, Criterios()) == ([], [])
