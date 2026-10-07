"""Interface Streamlit.

Esta camada só chama casos de uso (ADR-001). A única exceção é a montagem das
dependências em `app/composicao.py`, que é o papel de uma raiz de composição:
alguém precisa escolher as implementações concretas, e esse alguém é a borda.
"""
