#!/bin/bash
cd "$(dirname "$0")" || exit 1
PREVIEW_DONO=1 .venv/bin/streamlit run _preview_ui.py --server.headless true --server.port 8598 --browser.gatherUsageStats false --server.fileWatcherType none
