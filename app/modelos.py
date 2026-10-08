"""Modelos de tela: o que cada página precisa mostrar, sem saber de onde vem.

São a fronteira entre a interface e os casos de uso. Hoje `app.dados` os preenche
com dados de exemplo; quando os casos de uso existirem, é ele que passa a
preenchê-los, e as páginas não mudam.

Valores monetários sempre `Decimal`.
"""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from enum import Enum

# --------------------------------------------------------------------- estado


class Estado(Enum):
    """Situação de um gasto frente ao previsto. É a única coisa que ganha cor."""

    OK = "ok"
    ATENCAO = "warn"
    ESTOUROU = "over"


ROTULO_DO_ESTADO = {
    Estado.OK: "✓ Dentro",
    Estado.ATENCAO: "▲ Perto do limite",
    Estado.ESTOUROU: "✕ Acima",
}

# Acima disto do previsto, o gasto já merece atenção.
LIMITE_DE_ATENCAO = Decimal("0.90")


def estado_do_gasto(realizado: Decimal, previsto: Decimal) -> Estado:
    """Dentro, perto ou acima do previsto.

    Sem previsto, qualquer gasto é "acima": gastar onde nada foi planejado é
    justamente o que o orçamento existe para mostrar.
    """
    if previsto <= 0:
        return Estado.ESTOUROU if realizado > 0 else Estado.OK
    razao = realizado / previsto
    if razao > 1:
        return Estado.ESTOUROU
    if razao >= LIMITE_DE_ATENCAO:
        return Estado.ATENCAO
    return Estado.OK


# --------------------------------------------------------------------- contas


class TipoDeConta(Enum):
    CORRENTE = "corrente"
    CARTAO = "cartão"
    COFRINHO = "cofrinho"
    INVESTIMENTO = "investimento"
    A_RECEBER = "a receber"
    DINHEIRO = "dinheiro"


@dataclass(frozen=True, slots=True)
class Conta:
    nome: str
    tipo: TipoDeConta
    saldo: Decimal
    # Só cartão: números que o app do banco mostra (ADR-008).
    fechamento: int | None = None
    vencimento: int | None = None


# ------------------------------------------------------------------ resumo/orçamento


@dataclass(frozen=True, slots=True)
class ResumoDoMes:
    renda_base: Decimal
    renda_real: Decimal
    gasto: Decimal
    gasto_previsto: Decimal
    guardado: Decimal
    guardado_previsto: Decimal

    @property
    def renda_acima_do_previsto(self) -> Decimal:
        return max(self.renda_real - self.renda_base, Decimal(0))

    @property
    def sobra(self) -> Decimal:
        """Renda do mês menos o que foi gasto e o que foi guardado."""
        return self.renda_real - self.gasto - self.guardado

    @property
    def taxa_de_poupanca(self) -> Decimal:
        """(receitas - despesas) / receitas, em pontos percentuais."""
        if self.renda_real <= 0:
            return Decimal(0)
        return (self.renda_real - self.gasto) / self.renda_real * 100


@dataclass(frozen=True, slots=True)
class LinhaDeOrcamento:
    grupo: str
    categoria: str
    previsto: Decimal
    realizado: Decimal
    # Parte do realizado paga com dinheiro de cofrinho: consumo, mas não gasto corrente.
    financiado_por_cofrinho: Decimal = Decimal(0)

    @property
    def estado(self) -> Estado:
        return estado_do_gasto(self.realizado - self.financiado_por_cofrinho, self.previsto)


@dataclass(frozen=True, slots=True)
class MetaDeGuardado:
    destino: str
    planejado: Decimal
    transferido: Decimal
    # Devolução recompõe o que já estava guardado: não conta como guardado novo.
    devolucao: Decimal = Decimal(0)


@dataclass(frozen=True, slots=True)
class ModeloDePrevisto:
    """Uma linha do modelo recorrente do orçamento, com o ajuste do mês."""

    categoria: str
    padrao: Decimal
    ajuste_do_mes: Decimal | None


# ----------------------------------------------------------------- lançamentos


class TipoDeLancamento(Enum):
    RECEITA = "Receita"
    DESPESA = "Despesa"
    TRANSFERENCIA = "Transferência"


@dataclass(frozen=True, slots=True)
class Lancamento:
    data: date
    descricao: str
    tipo: TipoDeLancamento
    conta: str
    categoria: str | None  # transferência não tem categoria
    valor: Decimal  # com sinal: despesa negativa
    # Só compra no cartão: mês de vencimento da fatura em que cai (ADR-005).
    mes_da_fatura: date | None = None
    parcela: str | None = None  # "2/6"
    financiado_por: str | None = None  # nome do cofrinho


# ---------------------------------------------------------------------- cartões


class SituacaoDaFatura(Enum):
    PAGA = "Paga"
    ABERTA = "Aberta"
    FUTURA = "Futura"


@dataclass(frozen=True, slots=True)
class CompraNaFatura:
    data: date
    descricao: str
    categoria: str
    valor: Decimal
    parcela: str | None = None


@dataclass(frozen=True, slots=True)
class Fatura:
    cartao: str
    mes_de_vencimento: date
    situacao: SituacaoDaFatura
    compras: tuple[CompraNaFatura, ...]
    pago_em: date | None = None

    @property
    def total(self) -> Decimal:
        return sum((c.valor for c in self.compras), Decimal(0))


@dataclass(frozen=True, slots=True)
class TermosDoCartao:
    cartao: str
    fechamento: int
    vencimento: int
    vigente_desde: date


# --------------------------------------------------------------------- cofrinhos


@dataclass(frozen=True, slots=True)
class Cofrinho:
    nome: str
    saldo: Decimal
    meta: Decimal | None
    deveria_ter: Decimal | None
    entrou_no_mes: Decimal
    saiu_no_mes: Decimal
    usado_no_mes: Decimal
    a_devolver: Decimal
    dias_a_devolver: int | None = None
    rendimento_no_mes: Decimal = Decimal(0)
    percentual_do_cdi: Decimal | None = None
    reserva_de_emergencia: bool = False
    historico: tuple[tuple[date, Decimal, Decimal], ...] = ()  # (mês, saldo, deveria ter)


class FinalidadeDoResgate(Enum):
    USADO = "Usado no objetivo"
    EMPRESTIMO = "Empréstimo (fica a devolver)"
    RETIRADA = "Retirada definitiva"


# ---------------------------------------------------------------------- a receber


@dataclass(frozen=True, slots=True)
class ItemAReceber:
    data: date
    descricao: str
    valor: Decimal
    dias_em_aberto: int
    # Cofrinhos cujo dinheiro foi emprestado para pagar isto (RF18): nome -> valor.
    emprestado_de: tuple[tuple[str, Decimal], ...] = ()


@dataclass(frozen=True, slots=True)
class PessoaAReceber:
    nome: str
    itens: tuple[ItemAReceber, ...]
    quitacoes: tuple[tuple[date, Decimal], ...] = ()

    @property
    def saldo(self) -> Decimal:
        return sum((i.valor for i in self.itens), Decimal(0))


# ------------------------------------------------------------------ investimentos


@dataclass(frozen=True, slots=True)
class Fii:
    ticker: str
    cotas: int
    preco: Decimal
    preco_medio: Decimal
    dy_12m: Decimal  # pontos percentuais
    p_vp: Decimal
    valorizacao_no_mes: Decimal  # pontos percentuais
    provento_por_cota: Decimal
    provento_estimado: bool  # True antes do anúncio: média dos últimos 12
    lido_em: date

    @property
    def valor_de_mercado(self) -> Decimal:
        return self.preco * self.cotas

    @property
    def custo(self) -> Decimal:
        return self.preco_medio * self.cotas

    @property
    def provento_do_mes(self) -> Decimal:
        return self.provento_por_cota * self.cotas


@dataclass(frozen=True, slots=True)
class RendaFixa:
    nome: str
    saldo: Decimal
    percentual_do_cdi: Decimal | None  # None: Tesouro Selic, que segue a Selic


@dataclass(frozen=True, slots=True)
class PremissasDeProjecao:
    aporte_mensal: Decimal
    dy_anual: Decimal  # pontos percentuais
    valorizacao_anual: Decimal  # pontos percentuais
    reinvestir_proventos: bool


@dataclass(frozen=True, slots=True)
class PontoDaProjecao:
    meses: int
    patrimonio: Decimal
    renda_mensal: Decimal


@dataclass(frozen=True, slots=True)
class FonteDeDados:
    """De onde veio um dado externo e quando foi lido pela última vez."""

    nome: str
    lido_em: date | None
    ok: bool = True


# ------------------------------------------------------------------- importação


@dataclass(frozen=True, slots=True)
class LinhaDeImportacao:
    incluir: bool
    data: date
    descricao: str
    valor: Decimal
    tipo_detectado: str
    categoria_sugerida: str | None
    duplicada: bool = False
    observacao: str = ""


@dataclass(frozen=True, slots=True)
class PreviaDeImportacao:
    conta: str
    periodo: tuple[date, date]
    linhas: tuple[LinhaDeImportacao, ...]
    dias_conferidos: int
    dias_com_divergencia: int


# ------------------------------------------------------------------- configuração


@dataclass(frozen=True, slots=True)
class CategoriaConfigurada:
    grupo: str
    nome: str
    tipo: str  # "Despesa" ou "Receita"
    arquivada: bool = False


@dataclass(frozen=True, slots=True)
class RegraDeCategoria:
    padrao: str
    categoria: str
    prioridade: int


@dataclass(frozen=True, slots=True)
class UsuarioComAcesso:
    email: str
    nome: str
    ativo: bool
    criado_em: date
    admin: bool = False


@dataclass(frozen=True, slots=True)
class RegistroDeAcesso:
    quando: date
    quem: str
    acao: str
    alvo: str


@dataclass(frozen=True, slots=True)
class PedidoDeLancamento:
    """O que o diálogo "Lançar" coleta. Valor sempre `Decimal`."""

    tipo: TipoDeLancamento
    valor: Decimal
    conta: str
    data: date
    descricao: str = ""
    categoria: str | None = None
    conta_destino: str | None = None  # só transferência
    parcelas: int = 1
    paga_por_outra_pessoa: str | None = None
    valor_da_outra_pessoa: Decimal | None = None
    finalidade_do_resgate: FinalidadeDoResgate | None = None
    e_devolucao: bool = False
    extras: dict[str, str] = field(default_factory=dict)
