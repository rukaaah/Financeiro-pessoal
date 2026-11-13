"""Página "Importar extrato": enviar o PDF, revisar a prévia e confirmar.

Casos de uso a ligar: `importing.application.ler_extrato` (adapter PicPay em PDF),
`importing.application.confirmar_importacao`. Regras:

- o arquivo é processado em memória e descartado; CPF e número da conta nunca são guardados;
- o parser confere o resultado pelo saldo diário do extrato;
- duplicadas (mesmo hash) vêm desmarcadas;
- nada é gravado antes de o usuário revisar e confirmar.

Enquanto o parser não existe, a tela mostra uma prévia de exemplo (`dados.previa_de_importacao`).
"""

from decimal import Decimal

import streamlit as st

from app import dados
from app.componentes import metrica
from app.formatacao import brl, data_curta
from app.layout import titulo
from app.modelos import TipoDeConta

titulo("Importar extrato")

correntes = [c.nome for c in dados.contas() if c.tipo is TipoDeConta.CORRENTE]
conta = st.selectbox("Conta do extrato", correntes, help="Hoje só o extrato em PDF do PicPay.")
arquivo = st.file_uploader("Extrato em PDF", type=["pdf"], help="Até 5 MB. Não fica salvo.")

if arquivo is None:
    st.caption(
        "Envie o PDF para ver a prévia. Abaixo, uma prévia de exemplo do que você vai revisar."
    )
else:
    # TODO(claude-code): passar `arquivo.getvalue()` para importing.ler_extrato. Até lá, o
    # arquivo enviado é ignorado e a prévia é de exemplo.
    st.warning(
        "O leitor de PDF ainda não está ligado: a prévia abaixo é de exemplo.",
        icon=":material/science:",
    )

previa = dados.previa_de_importacao()
inicio, fim = previa.periodo
st.subheader(f"{previa.conta}, {data_curta(inicio)} a {data_curta(fim)}")

colunas = st.columns(3)
with colunas[0]:
    metrica("Linhas lidas", Decimal(len(previa.linhas)), ajuda="Contagem, não dinheiro.")
with colunas[1]:
    st.container(border=True).metric("Dias conferidos pelo saldo", previa.dias_conferidos)
with colunas[2]:
    st.container(border=True).metric("Dias com divergência", previa.dias_com_divergencia)

if previa.dias_com_divergencia:
    st.error(
        "O saldo diário não fecha em alguns dias. Revise antes de confirmar.",
        icon=":material/error:",
    )
else:
    st.success("O saldo de todos os dias confere com o extrato.", icon=":material/check_circle:")

categorias = dados.categorias_de_despesa() + dados.categorias_de_receita()
editado = st.data_editor(
    [
        {
            "Incluir": linha.incluir,
            "Data": data_curta(linha.data),
            "Descrição": linha.descricao,
            "Valor": brl(linha.valor),
            "Tipo": linha.tipo_detectado,
            "Categoria": linha.categoria_sugerida,
            "Obs.": ("Duplicada. " if linha.duplicada else "") + linha.observacao,
        }
        for linha in previa.linhas
    ],
    hide_index=True,
    width="stretch",
    disabled=("Data", "Descrição", "Valor", "Tipo", "Obs."),
    column_config={
        "Incluir": st.column_config.CheckboxColumn("Incluir"),
        "Valor": st.column_config.TextColumn("Valor", alignment="right"),
        "Categoria": st.column_config.SelectboxColumn("Categoria", options=list(categorias)),
    },
    key="importar_revisao",
)

selecionadas = sum(1 for linha in editado if linha["Incluir"])
st.caption(f"{selecionadas} de {len(editado)} linhas serão lançadas em {conta}.")
if st.button("Confirmar importação", type="primary", disabled=selecionadas == 0, width="stretch"):
    # TODO(claude-code): importing.confirmar_importacao(linhas_editadas) numa única transação.
    st.toast("Exemplo: nada foi gravado, o caso de uso ainda não está ligado.")
