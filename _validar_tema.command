#!/bin/bash
# Lança: valida no Streamlit instalado as chaves de tema usadas em .streamlit/config.toml.
# Gerado pelo Claude; pode apagar depois.
cd "$(dirname "$0")" || exit 1
SAIDA="_validar_tema.saida.txt"
{
  echo "== $(date)"
  uv sync 2>&1 | tail -5
  echo "== versão"
  uv run python -c "import streamlit; print(streamlit.__version__)"
  echo "== opções de tema conhecidas pelo Streamlit"
  uv run python - <<'PY'
from streamlit import config
from pathlib import Path
import tomllib
conhecidas = {k for k in config._config_options_template if k.startswith("theme.")}
print(len(conhecidas), "opções theme.* conhecidas")
tema = tomllib.loads(Path(".streamlit/config.toml").read_text())["theme"]
usadas = set()
for k, v in tema.items():
    if isinstance(v, dict):
        usadas |= {f"theme.{k}.{sub}" for sub in v}
    else:
        usadas.add(f"theme.{k}")
print("USADAS:", len(usadas))
print("USADAS_INEXISTENTES:", sorted(usadas - conhecidas))
PY
  echo "== FIM"
} > "$SAIDA" 2>&1
echo "Pronto. Pode fechar esta janela."
