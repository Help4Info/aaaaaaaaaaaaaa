#!/usr/bin/env bash
# Préparation du Codespace pour FlowWhisper : ffmpeg + venv + dépendances Python.
set -e

echo "→ Installation de ffmpeg…"
sudo apt-get update -qq
sudo apt-get install -y -qq ffmpeg

echo "→ Création de l'environnement virtuel et installation des dépendances…"
cd "$(git rev-parse --show-toplevel)/server"
python -m venv .venv
./.venv/bin/pip install --upgrade pip -q
./.venv/bin/pip install -r requirements.txt

echo "✓ Prêt. Le serveur démarrera automatiquement ; ouvrez le port 8000."
