"""Pendências do mês para a aba Atenção e o resumo da aba Mês (RF20).

Função pura sobre os dados que a tela já carregou: as duas abas leem a MESMA
lista, para que nenhuma tela calcule alerta por conta própria (adendo do
ADR-011). Ordem: gravidade, depois valor.

Cada alerta tem uma `chave` estável (é por ela que "lembrar amanhã" e
"resolvido" funcionam) e, quando existe, a ação que o resolve.

TODO(claude-code): o RF20 põe estas regras no domínio (módulo `alerts`), e os
adiamentos na tabela `alert_snoozes`. Aqui são funções puras sobre os dados de
exemplo, com teste, para que a troca pelo domínio não mude o comportamento.
"""

from __future__ import annotations

import calendar
from collections.abc import Mapping, Sequence
from datetime import date, timedelta
from decimal import Decimal

from app.blocos import Acao, Alerta
from app.formatacao import brl, data_curta
from app.modelos import (
    ORDEM_DA_URGENCIA,
    Cofrinho,
    ContaRecorrente,
    Estado,
    Fatura,
    LinhaDeOrcamento,
    PessoaAReceber,
    SaidaEmRisco,
    SaidaPrevista,
    SituacaoDaFatura,
    Urgencia,
)

PAGINA_ORCAMENTO = "app/paginas/orcamento.py"
PAGINA_CARTOES = "app/paginas/cartoes.py"
PAGINA_COFRINHOS = "app/paginas/cofrinhos.py"

VER_ORCAMENTO = Acao("Ver orçamento", f"pagina:{PAGINA_ORCAMENTO}", "savings")

ORDEM = {"critico": 0, "atencao": 1, "informativo": 2}
SEM_DATA = date.max
DIAS_PARA_AVISAR_FATURA = 7
DIAS_A_RECEBER_PARADO = 15


def pendencias(
    hoje: date,
    orcamento: Sequence[LinhaDeOrcamento],
    faturas: Sequence[Fatura],
    cofrinhos: Sequence[Cofrinho],
    a_receber: Sequence[PessoaAReceber],
    dia_de_vencimento: int,
    recorrentes: Sequence[ContaRecorrente] = (),
) -> list[Alerta]:
    # (alerta, chave de desempate: maior valor primeiro dentro da gravidade)
    # (alerta, desempate): dentro da gravidade, o que vence antes; sem data, o maior valor.
    itens: list[tuple[Alerta, tuple[date, Decimal]]] = []
    perto: list[LinhaDeOrcamento] = []

    # Contas recorrentes: vencida e não paga é crítico; perto de vencer, atenção.
    for conta in recorrentes:
        if not conta.pendente:
            continue
        faltam = (conta.vence_em - hoje).days
        valor_texto = ("~" if conta.varia else "") + brl(conta.valor)
        pagar = Acao("Pagar", f"pagar:{conta.nome}", "payments")
        chave = f"conta:{conta.nome}:{conta.vence_em:%Y-%m}"
        if faltam < 0:
            itens.append(
                (
                    Alerta(
                        "critico",
                        f"{conta.nome} venceu {data_curta(conta.vence_em)}",
                        f"{conta.urgencia.value} · paga com {conta.conta}",
                        valor_texto,
                        chave,
                        pagar,
                    ),
                    (conta.vence_em, -conta.valor),
                )
            )
        elif faltam <= conta.avisar_dias_antes:
            quando = "hoje" if faltam == 0 else "amanhã" if faltam == 1 else f"em {faltam} dias"
            itens.append(
                (
                    Alerta(
                        "atencao",
                        f"{conta.nome} vence {quando}",
                        f"{conta.urgencia.value} · {data_curta(conta.vence_em)} · "
                        f"paga com {conta.conta}",
                        valor_texto,
                        chave,
                        pagar,
                    ),
                    (conta.vence_em, -conta.valor),
                )
            )

    for linha in orcamento:
        if linha.natureza == "cofrinho":
            # Inserção prevista e gasto do cofrinho não aparecem; salário além disso, sim.
            fora = linha.fora_do_previsto
            if fora > 0:
                partes = []
                if linha.do_salario > 0:
                    partes.append(f"{brl(linha.do_salario)} gastos direto do salário")
                extra = linha.para_cofrinho - linha.previsto
                if extra > 0:
                    partes.append(f"{brl(extra)} a mais no cofrinho")
                itens.append(
                    (
                        Alerta(
                            "atencao",
                            f"{linha.categoria} usou dinheiro do mês",
                            " e ".join(partes)
                            + f"; a inserção prevista é {brl(linha.previsto)} no cofrinho "
                            + f"{linha.cofrinho}",
                            brl(fora),
                            f"cofrinho-salario:{linha.categoria}",
                            VER_ORCAMENTO,
                        ),
                        (SEM_DATA, -fora),
                    )
                )
            continue
        gasto = linha.gasto
        if linha.estado is Estado.ESTOUROU:
            itens.append(
                (
                    Alerta(
                        "critico",
                        f"{linha.categoria} passou do previsto",
                        f"{brl(gasto)} de {brl(linha.previsto)} previstos",
                        f"+{brl(gasto - linha.previsto)}",
                        f"estourou:{linha.categoria}",
                        VER_ORCAMENTO,
                    ),
                    (SEM_DATA, -(gasto - linha.previsto)),
                )
            )
        elif linha.estado is Estado.ATENCAO and linha.natureza == "variável":
            # Fixo perto de 100% é a mensalidade sendo paga, não um aviso.
            perto.append(linha)

    # Perto do limite vira UM item quando são várias (revisão de 2026-10-30: cinco
    # linhas iguais empurravam as contas vencendo para fora da tela).
    if len(perto) == 1:
        linha = perto[0]
        itens.append(
            (
                Alerta(
                    "atencao",
                    f"{linha.categoria} perto do limite",
                    f"Restam {brl(linha.previsto - linha.gasto)} de {brl(linha.previsto)}",
                    f"{linha.gasto / linha.previsto * 100:.0f}%",
                    f"perto:{linha.categoria}",
                    VER_ORCAMENTO,
                ),
                (SEM_DATA, Decimal(0)),
            )
        )
    elif perto:
        perto.sort(key=lambda linha: linha.livre)
        restam = sum((linha.livre for linha in perto), Decimal(0))
        itens.append(
            (
                Alerta(
                    "atencao",
                    f"{len(perto)} categorias perto do limite",
                    ", ".join(f"{linha.categoria} ({brl(linha.livre)})" for linha in perto),
                    f"restam {brl(restam)}",
                    "perto:" + ",".join(sorted(linha.categoria for linha in perto)),
                    VER_ORCAMENTO,
                ),
                (SEM_DATA, Decimal(0)),
            )
        )

    for fatura in faturas:
        if fatura.situacao is not SituacaoDaFatura.ABERTA:
            continue
        vencimento = fatura.mes_de_vencimento.replace(day=dia_de_vencimento)
        faltam = (vencimento - hoje).days
        if 0 <= faltam <= DIAS_PARA_AVISAR_FATURA:
            quando = "hoje" if faltam == 0 else f"em {faltam} dias ({data_curta(vencimento)})"
            itens.append(
                (
                    Alerta(
                        "atencao",
                        f"Fatura {fatura.cartao} vence {quando}",
                        "Ainda não paga",
                        brl(fatura.total),
                        f"fatura:{fatura.cartao}:{fatura.mes_de_vencimento:%Y-%m}",
                        Acao("Pagar fatura", f"pagina:{PAGINA_CARTOES}", "credit_card"),
                    ),
                    (vencimento, -fatura.total),
                )
            )

    for cofrinho in cofrinhos:
        if cofrinho.a_devolver > 0:
            itens.append(
                (
                    Alerta(
                        "atencao",
                        f"Devolver ao cofrinho {cofrinho.nome}",
                        "Empréstimo do cofrinho ainda em aberto",
                        brl(cofrinho.a_devolver),
                        f"devolver:{cofrinho.nome}",
                        Acao("Abrir cofrinhos", f"pagina:{PAGINA_COFRINHOS}", "savings"),
                    ),
                    (SEM_DATA, -cofrinho.a_devolver),
                )
            )
        elif cofrinho.deveria_ter is not None and cofrinho.saldo < cofrinho.deveria_ter:
            atraso = cofrinho.deveria_ter - cofrinho.saldo
            itens.append(
                (
                    Alerta(
                        "informativo",
                        f"{cofrinho.nome} atrás do planejado",
                        f"Deveria ter {brl(cofrinho.deveria_ter)}",
                        f"-{brl(atraso)}",
                        f"atrasado:{cofrinho.nome}",
                        Acao("Abrir cofrinhos", f"pagina:{PAGINA_COFRINHOS}", "savings"),
                    ),
                    (SEM_DATA, -atraso),
                )
            )

    for pessoa in a_receber:
        parados = [i for i in pessoa.itens if i.dias_em_aberto > DIAS_A_RECEBER_PARADO]
        if parados:
            valor = sum((i.valor for i in parados), Decimal(0))
            itens.append(
                (
                    Alerta(
                        "informativo",
                        f"{pessoa.nome} deve há mais de {DIAS_A_RECEBER_PARADO} dias",
                        ", ".join(i.descricao for i in parados),
                        brl(valor),
                        f"a-receber:{pessoa.nome}",
                        Acao("Abrir a receber", f"pagina:{PAGINA_COFRINHOS}", "person"),
                    ),
                    (SEM_DATA, -valor),
                )
            )

    itens.sort(key=lambda par: (ORDEM[par[0].gravidade], par[1]))
    return [alerta for alerta, _ in itens]


def onde_ainda_cabe(orcamento: Sequence[LinhaDeOrcamento]) -> list[LinhaDeOrcamento]:
    """Categorias com dinheiro de fato livre, da maior folga para a menor.

    Regra do Pedro (2026-10-29): fica de fora o que já estourou ou zerou, o gasto
    fixo (mensalidade: o dinheiro já tem destino) e a categoria paga por cofrinho
    (não é gasto do mês).
    """
    livres = [linha for linha in orcamento if linha.natureza == "variável" and linha.livre > 0]
    return sorted(livres, key=lambda linha: linha.livre, reverse=True)


# ------------------------------------------------------------- adiar e resolver


def visiveis(
    itens: Sequence[Alerta],
    hoje: date,
    adiados: Mapping[str, date],
    resolvidos: Mapping[str, date],
) -> list[Alerta]:
    """Tira o que foi adiado ou resolvido, com a regra do brief para o crítico.

    - "lembrar amanhã" (`adiados`: chave -> dia em que foi adiado) some até o dia
      seguinte, para qualquer gravidade;
    - "resolvido" (`resolvidos`: chave -> dia) some pelo resto do mês, menos o
      crítico: crítico não some por mais de um dia, então volta amanhã se a causa
      continuar lá.
    """

    def escondido(a: Alerta) -> bool:
        adiado = adiados.get(a.chave)
        if adiado is not None and hoje < adiado + timedelta(days=1):
            return True
        resolvido = resolvidos.get(a.chave)
        if resolvido is None:
            return False
        if a.gravidade == "critico":
            return hoje < resolvido + timedelta(days=1)
        return (resolvido.year, resolvido.month) == (hoje.year, hoje.month)

    return [a for a in itens if not a.chave or not escondido(a)]


# ------------------------------------------------------------- a pagar e em risco


def saidas_do_mes(
    mes: date,
    faturas: Sequence[Fatura],
    dia_de_vencimento: int,
    recorrentes: Sequence[ContaRecorrente],
) -> list[SaidaPrevista]:
    """O que ainda vai sair da conta até o fim do mês, em ordem de vencimento.

    Fatura de cartão é Essencial: atrasar custa juros que nenhuma outra conta tem.
    Vencidas e não pagas continuam aqui; elas também precisam sair do saldo.
    """
    ultimo_dia = mes.replace(day=calendar.monthrange(mes.year, mes.month)[1])
    saidas = [
        SaidaPrevista(f"conta:{c.nome}:{c.vence_em:%Y-%m}", c.nome, c.valor, c.vence_em, c.urgencia)
        for c in recorrentes
        if c.pendente and c.vence_em <= ultimo_dia
    ]
    for fatura in faturas:
        if fatura.situacao is not SituacaoDaFatura.ABERTA:
            continue
        vence = fatura.mes_de_vencimento.replace(day=dia_de_vencimento)
        if vence <= ultimo_dia:
            saidas.append(
                SaidaPrevista(
                    f"fatura:{fatura.cartao}:{fatura.mes_de_vencimento:%Y-%m}",
                    f"Fatura {fatura.cartao}",
                    fatura.total,
                    vence,
                    Urgencia.ESSENCIAL,
                )
            )
    return sorted(saidas, key=lambda s: (s.vence_em, ORDEM_DA_URGENCIA[s.urgencia]))


def em_risco(
    saldo_em_conta: Decimal,
    saidas: Sequence[SaidaPrevista],
    cofrinhos: Sequence[Cofrinho],
) -> list[SaidaEmRisco]:
    """Saídas que o saldo não cobre, se ele for gasto na ordem sugerida.

    A ordem sugerida é Essencial -> Importante -> Adiável e, dentro de cada uma,
    a data: o saldo vai primeiro para o essencial. O que sobra sem cobertura é o
    "em risco", na ordem de vencimento.

    Para cada uma, o cofrinho que cobriria a falta como empréstimo (RF18): o
    primeiro que não é reserva de emergência e tem saldo; a reserva só entra se
    nenhum outro cobrir, e a tela avisa. O app nunca resgata sozinho.
    """
    restante = saldo_em_conta
    descobertas: list[SaidaEmRisco] = []
    por_prioridade = sorted(saidas, key=lambda s: (ORDEM_DA_URGENCIA[s.urgencia], s.vence_em))
    for saida in por_prioridade:
        if restante >= saida.valor:
            restante -= saida.valor
            continue
        falta = saida.valor - max(restante, Decimal(0))
        restante -= saida.valor
        descobertas.append(SaidaEmRisco(saida, falta))

    # Cofrinho que cobre: o dinheiro de um cofrinho só cobre uma falta por vez.
    disponivel = {c.nome: c.saldo for c in cofrinhos if c.percentual_do_cdi is None}
    reserva = {c.nome for c in cofrinhos if c.reserva_de_emergencia}
    resultado = []
    for item in sorted(descobertas, key=lambda r: r.saida.vence_em):
        candidatos = sorted(
            (nome for nome, saldo in disponivel.items() if saldo >= item.falta),
            key=lambda nome: (nome in reserva, -disponivel[nome]),
        )
        if candidatos:
            nome = candidatos[0]
            disponivel[nome] -= item.falta
            resultado.append(SaidaEmRisco(item.saida, item.falta, nome, nome in reserva))
        else:
            resultado.append(item)
    return resultado
