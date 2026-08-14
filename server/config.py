"""Configuration centralisée, lue depuis les variables d'environnement.

Un fichier .env (à la racine ou dans server/) est chargé automatiquement s'il existe.
"""
from __future__ import annotations

import os
from pathlib import Path


def _load_dotenv() -> None:
    """Chargeur .env minimal (évite une dépendance externe)."""
    for candidate in (Path(__file__).resolve().parent.parent / ".env",
                      Path(__file__).resolve().parent / ".env"):
        if not candidate.exists():
            continue
        for raw in candidate.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            # Ne pas écraser une variable déjà définie dans l'environnement réel.
            os.environ.setdefault(key, value)


_load_dotenv()


def _get(name: str, default: str) -> str:
    return os.environ.get(name, default)


class Settings:
    # --- Serveur ---
    HOST: str = _get("HOST", "127.0.0.1")
    PORT: int = int(_get("PORT", "8000"))

    # --- Whisper (transcription locale) ---
    WHISPER_MODEL: str = _get("WHISPER_MODEL", "base")
    WHISPER_DEVICE: str = _get("WHISPER_DEVICE", "auto")
    WHISPER_COMPUTE: str = _get("WHISPER_COMPUTE", "int8")

    # --- Raffinage (LLM) ---
    REFINE_PROVIDER: str = _get("REFINE_PROVIDER", "local").lower()

    OPENAI_API_KEY: str = _get("OPENAI_API_KEY", "")
    OPENAI_BASE_URL: str = _get("OPENAI_BASE_URL", "https://api.openai.com/v1")
    OPENAI_MODEL: str = _get("OPENAI_MODEL", "gpt-4o-mini")

    ANTHROPIC_API_KEY: str = _get("ANTHROPIC_API_KEY", "")
    ANTHROPIC_BASE_URL: str = _get("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
    ANTHROPIC_MODEL: str = _get("ANTHROPIC_MODEL", "claude-3-5-haiku-latest")

    def refine_available(self) -> str:
        """Retourne le fournisseur effectivement utilisable."""
        if self.REFINE_PROVIDER == "openai" and self.OPENAI_API_KEY:
            return "openai"
        if self.REFINE_PROVIDER == "anthropic" and self.ANTHROPIC_API_KEY:
            return "anthropic"
        return "local"


settings = Settings()
