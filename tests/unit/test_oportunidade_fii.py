"""Medidor de oportunidade de compra de FII (ADR-022), com séries sintéticas."""

# ruff: noqa: E501 — séries e respostas sintéticas ficam legíveis numa linha.

from datetime import date, timedelta
from decimal import Decimal

from financeiro.market_data.domain.oportunidade import (
    Pregao,
    Selic,
    avaliar,
    fatos_para_ia,
    leitura_sem_ia,
    ler_resposta,
    mensagens,
    panorama,
)

D = Decimal
INICIO = date(2025, 11, 3)


VP, RENDA, VOLUME = D(100), D("0.80"), D(2_000_000)


def _serie(
    precos: list[Decimal], vp: Decimal = VP, renda: Decimal = RENDA, volume: Decimal = VOLUME
) -> list[Pregao]:
    """Um pregão por dia útil; P/VP pelo VP fixo, DY 12m pela renda mensal fixa."""
    saida, dia = [], INICIO
    for p in precos:
        while dia.weekday() >= 5:
            dia += timedelta(days=1)
        saida.append(
            Pregao(
                dia,
                p,
                (p / vp).quantize(D("0.0001")),
                (renda * 12 / p * 100).quantize(D("0.0001")),
                volume,
            )
        )
        dia += timedelta(days=1)
    return saida


def test_poucos_pregoes_nao_dao_veredito() -> None:
    s = avaliar("ABCD11", _serie([D(100)] * 10))
    assert s.veredito == "sem_dados" and s.nota is None


def test_estavel_perto_do_vp_manda_esperar() -> None:
    s = avaliar("ABCD11", _serie([D(100) + D(i % 3) for i in range(200)]))
    assert s.veredito == "esperar"
    assert s.nota is not None and s.nota < 60


def test_queda_forte_com_historico_longo_vira_grande_dia() -> None:
    precos = [D(100) + D(i % 3) for i in range(200)] + [D(100) - D(2) * i for i in range(1, 11)]
    s = avaliar("ABCD11", _serie(precos))
    assert s.veredito == "grande_dia"
    assert s.percentil is not None and s.percentil >= 95
    assert s.preco_alvo is not None and s.preco_alvo > s.preco
    assert any("abaixo do valor patrimonial" in m for m in s.motivos)


def test_a_mesma_queda_com_historico_curto_nao_e_grande_dia() -> None:
    precos = [D(100) + D(i % 3) for i in range(40)] + [D(100) - D(2) * i for i in range(1, 11)]
    s = avaliar("ABCD11", _serie(precos))
    assert s.veredito == "bom_preco"
    assert any("histórico de 50 pregões" in r for r in s.riscos)


def test_liquidez_baixa_rebaixa_para_esperar() -> None:
    precos = [D(100) + D(i % 3) for i in range(200)] + [D(100) - D(2) * i for i in range(1, 11)]
    s = avaliar("ABCD11", _serie(precos, volume=D(100_000)))
    assert s.veredito == "esperar"
    assert any("liquidez" in r for r in s.riscos)


def test_agio_alto_nunca_e_bom_preco() -> None:
    precos = [D(120) + D(i % 3) for i in range(200)] + [D(120) - D(1) * i for i in range(1, 6)]
    assert avaliar("ABCD11", _serie(precos)).veredito == "esperar"


def test_panorama_de_alta_e_de_queda() -> None:
    sobe = _serie([D(90) + D(i) / 2 for i in range(60)])
    cai = _serie([D(120) - D(i) / 2 for i in range(60)])
    assert panorama({"A11": sobe, "B11": sobe}).tendencia == "alta"
    p = panorama({"A11": cai, "B11": cai, "C11": sobe})
    assert p.tendencia == "queda" and p.caindo == ["A11", "B11"] and p.subindo == ["C11"]
    assert panorama({"A11": sobe[:5]}).tendencia == "sem_dados"


def test_selic_direcao() -> None:
    assert Selic(D(15), D(15)).direcao == "mantida"
    assert Selic(D("14.5"), D(15)).direcao == "em queda"
    assert Selic(D(15), None).direcao == "sem histórico"


def _caso() -> tuple:  # type: ignore[type-arg]
    precos = [D(100) + D(i % 3) for i in range(200)] + [D(100) - D(2) * i for i in range(1, 11)]
    serie = _serie(precos)
    s = avaliar("ABCD11", serie)
    pano = panorama({"ABCD11": serie})
    selic = Selic(D(15), D(15))
    return s, pano, selic, fatos_para_ia(s, pano, selic)


def test_prompt_pede_honestidade_e_traz_os_fatos() -> None:
    s, pano, selic, fatos = _caso()
    sistema, usuario = (m["content"] for m in mensagens(s, pano, selic, "Nova emissão."))
    assert "brutalmente honesto" in sistema and "Nunca concorde por concordar" in sistema
    assert "Pesquise antes de falar" in sistema
    assert f"- dy_menos_selic: {fatos['dy_menos_selic']}" in usuario
    assert "Nova emissão." in usuario


def test_resposta_com_numero_dos_fatos_passa() -> None:
    s, _, _, fatos = _caso()
    texto = f'{{"veredito": "bom_preco", "motivo": "P/VP {fatos["pvp"]} e DY {fatos["dy_12m"]}.", "riscos": ["emissão"], "previsao": "Cota a {fatos["preco_se_pvp_voltar_a_mediana"]}; ou a {fatos["preco_se_pvp_for_ao_minimo"]}."}}'
    leitura = ler_resposta(texto, s, fatos)
    assert leitura is not None and leitura.veredito == "bom_preco"


def test_previsao_com_um_lado_so_e_descartada() -> None:
    s, _, _, fatos = _caso()
    texto = f'{{"veredito": "bom_preco", "motivo": "P/VP {fatos["pvp"]}.", "riscos": ["emissão"], "previsao": "Cota a {fatos["preco_se_pvp_voltar_a_mediana"]}."}}'
    assert ler_resposta(texto, s, fatos) is None


def test_resposta_sem_risco_e_descartada() -> None:
    s, _, _, fatos = _caso()
    texto = f'{{"veredito": "bom_preco", "motivo": "P/VP {fatos["pvp"]}.", "riscos": [], "previsao": "Cota a {fatos["preco_se_pvp_voltar_a_mediana"]}; ou a {fatos["preco_se_pvp_for_ao_minimo"]}."}}'
    assert ler_resposta(texto, s, fatos) is None


def test_prompt_nao_veste_persona_de_analista() -> None:
    s, pano, selic, _ = _caso()
    sistema = mensagens(s, pano, selic, None)[0]["content"]
    assert "analista sênior" not in sistema and "não é analista" in sistema
    assert "preco_se_pvp_for_ao_minimo" in sistema


def test_resposta_com_numero_inventado_e_descartada() -> None:
    s, _, _, fatos = _caso()
    texto = '{"veredito": "grande_dia", "motivo": "Deve subir 37,5% até março.", "riscos": [], "previsao": ""}'
    assert ler_resposta(texto, s, fatos) is None


def test_ia_nao_sobe_o_veredito() -> None:
    s, _, _, fatos = _caso()
    curto = avaliar("ABCD11", _serie([D(100) + D(i % 3) for i in range(200)]))
    assert curto.veredito == "esperar"
    assert ler_resposta('{"veredito": "bom_preco", "motivo": "Bom."}', curto, fatos) is None
    lados = f"{fatos['preco_se_pvp_voltar_a_mediana']} ou {fatos['preco_se_pvp_for_ao_minimo']}"
    assert (
        ler_resposta(
            f'{{"veredito": "esperar", "motivo": "Sem pressa.", "riscos": ["volátil"], "previsao": "{lados}"}}',
            s,
            fatos,
        )
        is not None
    )


def test_leitura_sem_ia_usa_so_a_conta() -> None:
    s, *_ = _caso()
    leitura = leitura_sem_ia(s)
    assert leitura.veredito == "grande_dia"
    assert "cenário, não promessa" in leitura.previsao
    assert s.fatos["preco_se_pvp_for_ao_minimo"] in leitura.previsao


def test_le_a_selic_do_sgs() -> None:
    from financeiro.market_data.adapters.bcb_sgs import ler_selic

    corpo = '[{"data":"01/07/2026","valor":"15.00"},{"data":"10/11/2026","valor":"14.50"}]'
    selic = ler_selic(corpo, date(2026, 11, 11))
    assert selic == Selic(D("14.50"), D("15.00")) and selic.direcao == "em queda"
    assert ler_selic("erro", date(2026, 11, 11)) is None
