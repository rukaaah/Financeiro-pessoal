"""Validações de entrada da tela. Só aviso ao usuário: o banco continua sendo o juiz."""

DIAS_MINIMOS_ATE_O_VENCIMENTO = 7
DIAS_MAXIMOS_ATE_O_VENCIMENTO = 10
DIAS_DO_MES_COMERCIAL = 30


def dias_entre_fechamento_e_vencimento(fechamento: int, vencimento: int) -> int:
    """Quantos dias separam o fechamento do vencimento (mês de 30 dias, aproximação).

    Unicred, fecha 4 e vence 11: 7 dias. Nubank, fecha 27 e vence 5, que é no mês
    seguinte: 8 dias.
    """
    if vencimento > fechamento:
        return vencimento - fechamento
    return DIAS_DO_MES_COMERCIAL - fechamento + vencimento


def intervalo_plausivel(fechamento: int, vencimento: int) -> bool:
    """O vencimento costuma cair de 7 a 10 dias depois do fechamento (ADR-008).

    Um par fora disso provavelmente é erro de digitação: a tela avisa, mas não
    impede, porque o banco pode mudar essas datas.
    """
    dias = dias_entre_fechamento_e_vencimento(fechamento, vencimento)
    return DIAS_MINIMOS_ATE_O_VENCIMENTO <= dias <= DIAS_MAXIMOS_ATE_O_VENCIMENTO
