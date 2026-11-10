"""Notícias e insights dos FIIs (ADR-021), com respostas sintéticas do Fundos.NET e da IA."""

# ruff: noqa: E501 — respostas sintéticas ficam legíveis numa linha por item.

import base64
import json
from datetime import date, datetime
from zoneinfo import ZoneInfo

from financeiro.market_data.adapters.fundosnet import ler_busca, texto_do_documento
from financeiro.market_data.adapters.workers_ai import ler_resposta_da_api
from financeiro.market_data.domain.insights import (
    Documento,
    data_escrita_no_texto,
    insight_para_banco,
    ler_resposta,
    mensagens,
    para_resumir,
)

SP = ZoneInfo("America/Sao_Paulo")


def _doc(ident: int, categoria: str, dia: date, texto: str = "", tipo: str = "") -> Documento:
    return Documento(
        ident,
        categoria,
        tipo,
        "",
        None,
        datetime(dia.year, dia.month, dia.day, 18, tzinfo=SP),
        texto,
    )


def test_le_a_busca_do_fundosnet() -> None:
    corpo = json.dumps(
        {
            "data": [
                {"id": 10, "categoriaDocumento": "Fato Relevante", "tipoDocumento": "",
                 "especieDocumento": "", "dataReferencia": "04/11/2026", "dataEntrega": "04/11/2026 19:07"},
                {"id": 11, "categoriaDocumento": "Relatórios", "tipoDocumento": "Relatório Gerencial",
                 "especieDocumento": "", "dataReferencia": "10/2026", "dataEntrega": "03/11/2026 18:04"},
                {"id": None, "categoriaDocumento": "Fato Relevante", "dataEntrega": "01/11/2026 10:00"},
                {"id": 12, "categoriaDocumento": "Fato Relevante", "dataEntrega": "ontem"},
            ]
        }
    )  # fmt: skip
    docs = ler_busca(corpo)
    assert [d.id for d in docs] == [10, 11]
    assert docs[0].entregue_em == datetime(2026, 11, 4, 19, 7, tzinfo=SP)
    assert docs[0].referencia == date(2026, 11, 4)
    assert docs[1].referencia is None  # "10/2026" não é dia
    assert docs[0].titulo == "Fato Relevante"
    assert docs[1].titulo == "Relatório Gerencial"
    assert ler_busca(b"<html>erro</html>") == []


def test_texto_de_html_em_base64() -> None:
    html = "<html><style>p{}</style><body><p>Data-com:&nbsp;28/11/2026</p><script>x()</script></body></html>"
    texto = texto_do_documento(base64.b64encode(html.encode()))
    assert "Data-com: 28/11/2026" in texto
    assert "x()" not in texto and "p{}" not in texto


def test_texto_do_xml_estruturado_vira_campo_valor() -> None:
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?><DadosEconomicoFinanceiros><InformeRendimentos>'
        "<Rendimento><DataBase>2026-11-28</DataBase><DataPagamento>2026-12-12</DataPagamento>"
        "<ValorProvento>0.10</ValorProvento></Rendimento></InformeRendimentos></DadosEconomicoFinanceiros>"
    )
    texto = texto_do_documento(xml.encode())
    assert "DataBase: 2026-11-28" in texto
    assert "ValorProvento: 0.10" in texto


def test_so_resume_documentos_relevantes_e_recentes() -> None:
    hoje = date(2026, 11, 10)
    docs = [
        _doc(1, "Fato Relevante", date(2026, 11, 9)),
        _doc(2, "Informes Periódicos", date(2026, 11, 9)),
        _doc(3, "Comunicado ao Mercado", date(2026, 6, 1)),
        _doc(4, "Aviso aos Cotistas - Estruturado", date(2026, 11, 1)),
    ]
    assert [d.id for d in para_resumir(docs, hoje)] == [1, 4]


def test_mensagens_citam_cada_documento() -> None:
    m = mensagens(
        "ABCD11", [_doc(7, "Fato Relevante", date(2026, 11, 9), "Nova emissão")], date(2026, 11, 10)
    )
    assert m[0]["role"] == "system" and "não invente" in m[0]["content"]
    assert "Documento 7" in m[1]["content"] and "Nova emissão" in m[1]["content"]


def test_data_escrita_no_texto_aceita_formatos_brasileiros() -> None:
    d = date(2026, 12, 1)
    assert data_escrita_no_texto(d, "pagamento em 01/12/2026")
    assert data_escrita_no_texto(d, "DataPagamento: 2026-12-01")
    assert data_escrita_no_texto(d, "a partir de 1º de Dezembro de 2026")
    assert not data_escrita_no_texto(d, "pagamento em 02/12/2026")


def test_resposta_da_ia_descarta_data_que_nao_esta_no_documento() -> None:
    docs = [
        _doc(
            5,
            "Fato Relevante",
            date(2026, 11, 9),
            "Direito de preferência de 17/11/2026 a 28/11/2026.",
        )
    ]
    resposta = "Claro! " + json.dumps(
        {
            "resumo": "O fundo   anunciou a 9ª emissão.",
            "preparar": ["Decida até 28/11 se exerce o direito de preferência.", "", 3],
            "eventos": [
                {"tipo": "subscricao", "data": "2026-11-28", "texto": "Fim do direito de preferência", "documento": 5},
                {"tipo": "data_com", "data": "2026-11-30", "texto": "Data-com inventada", "documento": 5},
                {"tipo": "pagamento", "data": "2026-11-17", "texto": "Doc que não existe", "documento": 99},
                {"tipo": "palpite", "data": "2026-11-17", "texto": "Tipo fora da lista", "documento": 5},
            ],
        }
    )  # fmt: skip
    insight = ler_resposta(resposta, docs)
    assert insight is not None
    assert insight.resumo == "O fundo anunciou a 9ª emissão."
    assert insight.preparar == ["Decida até 28/11 se exerce o direito de preferência."]
    assert [(e.tipo, e.data) for e in insight.eventos] == [("subscricao", date(2026, 11, 28))]
    resumo, preparar, eventos = insight_para_banco(insight)
    assert json.loads(eventos)[0] == {
        "tipo": "subscricao",
        "data": "2026-11-28",
        "texto": "Fim do direito de preferência",
        "documento": 5,
    }
    assert json.loads(preparar) and resumo


def test_resposta_sem_resumo_ou_sem_json_e_descartada() -> None:
    assert ler_resposta("não sei", []) is None
    assert ler_resposta({"resumo": "", "preparar": []}, []) is None
    assert ler_resposta({"resumo": "Sem novidades relevantes."}, []) is not None


def test_le_a_resposta_da_api_da_workers_ai() -> None:
    assert ler_resposta_da_api(json.dumps({"result": {"response": "oi"}, "success": True})) == "oi"
    assert ler_resposta_da_api(json.dumps({"result": {"response": {"resumo": "x"}}})) == {
        "resumo": "x"
    }
    assert ler_resposta_da_api(b"{}") is None
