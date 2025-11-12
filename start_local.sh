#!/usr/bin/env bash
# Arranca un servidor local para permitir login con Google (Firebase)
set -e
PORT="${1:-5173}"
echo "👉 Abre http://localhost:${PORT}"
python3 -m http.server "${PORT}"
