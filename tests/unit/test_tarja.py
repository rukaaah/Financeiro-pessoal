"""Qual tarja cada sessão vê.

A tarja é o aviso mais importante da tela (ADR-003): o app é público, e quem
não está na allowlist vê números inventados. Testar só a escolha do texto, sem
banco, deixa o caso mais grave coberto mesmo onde os testes de integração não
rodam.
"""

import uuid

import pytest
from app import layout

from financeiro.identity.domain.usuario import ModoDeAcesso, Sessao, UsuarioApp


def _sessao(modo: ModoDeAcesso) -> Sessao:
    demo = modo is ModoDeAcesso.DEMO
    return Sessao(UsuarioApp(uuid.uuid4(), "x@exemplo.com", "X", demo), modo)


def test_demonstracao_sempre_avisa_dados_ficticios(monkeypatch: pytest.MonkeyPatch) -> None:
    # Mesmo com os casos de uso ligados: demo é fictício para sempre.
    monkeypatch.setattr(layout, "DADOS_DE_EXEMPLO", False)
    texto = layout.texto_da_tarja(_sessao(ModoDeAcesso.DEMO))
    assert texto is not None and "Dados fictícios" in texto


def test_dono_ve_pre_visualizacao_enquanto_os_dados_sao_de_exemplo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(layout, "DADOS_DE_EXEMPLO", True)
    texto = layout.texto_da_tarja(_sessao(ModoDeAcesso.DONO))
    assert texto is not None and "Pré-visualização" in texto
    assert "Dados fictícios" not in texto


def test_dono_com_dados_reais_nao_ve_tarja(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(layout, "DADOS_DE_EXEMPLO", False)
    assert layout.texto_da_tarja(_sessao(ModoDeAcesso.DONO)) is None
