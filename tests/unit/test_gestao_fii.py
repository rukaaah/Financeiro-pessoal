"""Comportamento da gestão (ADR-021): planos e mudanças só com trecho do documento citado."""

# ruff: noqa: E501 — respostas sintéticas ficam legíveis numa linha por item.

import json
from datetime import date, datetime
from zoneinfo import ZoneInfo

from financeiro.market_data.domain.insights import (
    Documento,
    gestao_para_banco,
    ler_gestao,
    mensagens_da_gestao,
    relatorios_da_gestao,
    trecho_no_texto,
)

SP = ZoneInfo("America/Sao_Paulo")
AGO = "A gestão pretende vender o galpão de Cajamar até o fim de 2026 para reduzir a alavancagem."
OUT = "A venda do galpão de Cajamar foi adiada para 2027, dado o cenário de juros, e a gestão vai priorizar a recompra de cotas."


def _rel(ident: int, dia: date, texto: str, categoria: str = "Relatórios") -> Documento:
    return Documento(
        ident,
        categoria,
        "Relatório Gerencial",
        "",
        None,
        datetime(dia.year, dia.month, dia.day, 18, tzinfo=SP),
        texto,
    )


DOCS = [_rel(1, date(2026, 9, 10), AGO), _rel(2, date(2026, 10, 10), OUT)]


def test_relatorios_vem_do_mais_velho_ao_mais_novo_e_so_com_texto() -> None:
    docs = [
        *DOCS,
        _rel(3, date(2026, 11, 1), ""),
        _rel(4, date(2026, 11, 2), "texto", "Fato Relevante"),
    ]
    assert [d.id for d in relatorios_da_gestao(list(reversed(docs)))] == [1, 2]
    assert [d.id for d in relatorios_da_gestao(DOCS, limite=1)] == [2]


def test_trecho_precisa_estar_no_texto_e_ter_tamanho_de_citacao() -> None:
    assert trecho_no_texto("a venda do galpão  de Cajamar foi ADIADA para 2027", OUT)
    assert not trecho_no_texto("venda adiada", OUT)  # curto demais para provar algo
    assert not trecho_no_texto("a venda do galpão de Cajamar foi cancelada", OUT)


def test_aceita_mudanca_com_trecho_e_ordem_certa() -> None:
    resposta = {
        "postura": "A gestão adiou a venda e passou a priorizar recompra.",
        "planos": [
            {
                "texto": "Recomprar cotas",
                "documento": 2,
                "trecho": "a gestão vai priorizar a recompra de cotas",
            }
        ],
        "mudancas": [
            {
                "tema": "Venda de Cajamar",
                "antes": "Vender até o fim de 2026",
                "agora": "Adiada para 2027",
                "documento_antes": 1,
                "documento_agora": 2,
                "trecho": "A venda do galpão de Cajamar foi adiada para 2027",
            }
        ],
    }
    g = ler_gestao(json.dumps(resposta), DOCS)
    assert g is not None and len(g.planos) == 1 and len(g.mudancas) == 1
    salvo = json.loads(gestao_para_banco(g))
    assert salvo["mudancas"][0]["documento_antes"] == 1 and salvo["postura"].startswith("A gestão")


def test_descarta_o_que_nao_esta_escrito_ou_vai_contra_o_tempo() -> None:
    resposta = {
        "postura": "Gestão agressiva.",
        "planos": [
            {
                "texto": "Nova emissão",
                "documento": 2,
                "trecho": "a gestão fará uma nova emissão de cotas em dezembro",
            }
        ],
        "mudancas": [
            {
                "tema": "Venda",
                "antes": "x",
                "agora": "y",
                "documento_antes": 2,
                "documento_agora": 1,
                "trecho": "A gestão pretende vender o galpão de Cajamar",
            },
            {
                "tema": "Venda",
                "antes": "x",
                "agora": "y",
                "documento_antes": 1,
                "documento_agora": 9,
                "trecho": "A venda do galpão de Cajamar foi adiada",
            },
        ],
    }
    assert ler_gestao(json.dumps(resposta), DOCS) is None  # só a postura, sem nada citado, não vale


def test_resposta_que_nao_e_json_e_descartada() -> None:
    assert ler_gestao("A gestão está bem.", DOCS) is None


def test_mensagens_levam_os_relatorios_em_ordem() -> None:
    m = mensagens_da_gestao("AAAA11", DOCS, date(2026, 11, 11))
    assert m[0]["role"] == "system" and "trecho" in m[0]["content"]
    assert m[1]["content"].index("Documento 1") < m[1]["content"].index("Documento 2")
