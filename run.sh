#!/usr/bin/env bash
# Lance le serveur FlowWhisper (Linux / macOS).
set -e

cd "$(dirname "$0")/server"

if [ ! -d ".venv" ]; then
  echo "→ Création de l'environnement virtuel…"
  python3 -m venv .venv
  ./.venv/bin/pip install --upgrade pip
  ./.venv/bin/pip install -r requirements.txt
fi

echo "→ Démarrage de FlowWhisper sur http://localhost:${PORT:-8000}"
exec ./.venv/bin/python main.py
