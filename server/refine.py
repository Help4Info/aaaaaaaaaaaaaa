"""Nettoyage et mise en forme du texte transcrit.

Trois fournisseurs possibles :
  - "openai"     : API compatible OpenAI (OpenAI officiel, Ollama, LM Studio, etc.)
  - "anthropic"  : API Anthropic Messages
  - "local"      : repli heuristique, sans clé API et sans réseau

Chaque mode ("clean", "formal", "email", "bullets") applique une consigne différente.
"""
from __future__ import annotations

import re
from typing import Dict

import requests

from config import settings

# --- Consignes par mode (pour les fournisseurs LLM) -------------------------

_MODE_INSTRUCTIONS: Dict[str, str] = {
    "clean": (
        "Nettoie ce texte dicté à la voix : ajoute la ponctuation et les majuscules, "
        "supprime les hésitations (euh, hum, bah), les répétitions et les faux départs. "
        "Ne change PAS le sens, ne rajoute rien, garde la langue d'origine."
    ),
    "formal": (
        "Reformule ce texte dicté dans un registre professionnel et soigné, tout en "
        "conservant le sens. Corrige la grammaire et la ponctuation. Garde la langue d'origine."
    ),
    "email": (
        "Transforme ce texte dicté en e-mail clair et poli (formule d'appel, corps "
        "structuré, formule de politesse). Conserve le sens et la langue d'origine."
    ),
    "bullets": (
        "Résume ce texte dicté en une liste concise de puces claires. "
        "Garde la langue d'origine. Réponds uniquement avec les puces."
    ),
}

_SYSTEM_PROMPT = (
    "Tu es un assistant de mise en forme de dictée vocale. "
    "Tu renvoies UNIQUEMENT le texte transformé, sans commentaire, sans guillemets, "
    "sans préambule."
)


def refine(text: str, mode: str = "clean") -> Dict[str, str]:
    """Renvoie {'text': ..., 'provider': ...}. Ne lève jamais : repli local en cas d'erreur."""
    text = (text or "").strip()
    if not text:
        return {"text": "", "provider": "none"}

    mode = mode if mode in _MODE_INSTRUCTIONS else "clean"
    provider = settings.refine_available()

    try:
        if provider == "openai":
            return {"text": _refine_openai(text, mode), "provider": "openai"}
        if provider == "anthropic":
            return {"text": _refine_anthropic(text, mode), "provider": "anthropic"}
    except Exception as exc:  # repli robuste : ne jamais casser l'UX
        return {"text": _refine_local(text, mode), "provider": f"local (repli après erreur {provider}: {exc})"}

    return {"text": _refine_local(text, mode), "provider": "local"}


# --- Fournisseur : OpenAI-compatible ---------------------------------------

def _refine_openai(text: str, mode: str) -> str:
    url = settings.OPENAI_BASE_URL.rstrip("/") + "/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.OPENAI_MODEL,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": f"{_MODE_INSTRUCTIONS[mode]}\n\n---\n{text}"},
        ],
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


# --- Fournisseur : Anthropic ------------------------------------------------

def _refine_anthropic(text: str, mode: str) -> str:
    url = settings.ANTHROPIC_BASE_URL.rstrip("/") + "/v1/messages"
    headers = {
        "x-api-key": settings.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.ANTHROPIC_MODEL,
        "max_tokens": 1024,
        "system": _SYSTEM_PROMPT,
        "messages": [
            {"role": "user", "content": f"{_MODE_INSTRUCTIONS[mode]}\n\n---\n{text}"},
        ],
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    return "".join(block.get("text", "") for block in data.get("content", [])).strip()


# --- Repli local (aucune clé, aucun réseau) --------------------------------

# Hésitations courantes (français + anglais).
_FILLERS = [
    "euh", "heu", "hum", "hein", "bah", "ben", "genre", "voilà quoi",
    "um", "uh", "erm", "hmm", "like", "you know",
]


def _refine_local(text: str, mode: str) -> str:
    cleaned = _basic_clean(text)
    if mode == "bullets":
        parts = re.split(r"(?<=[.!?])\s+", cleaned)
        return "\n".join(f"- {p.strip()}" for p in parts if p.strip())
    return cleaned


def _basic_clean(text: str) -> str:
    # Espaces multiples et espaces avant ponctuation.
    text = re.sub(r"\s+", " ", text).strip()

    # Suppression des hésitations (mot entier, insensible à la casse).
    for filler in _FILLERS:
        text = re.sub(rf"\b{re.escape(filler)}\b[,]?\s*", "", text, flags=re.IGNORECASE)

    # Suppression des répétitions immédiates (« le le », « the the »).
    text = re.sub(r"\b(\w+)(\s+\1\b)+", r"\1", text, flags=re.IGNORECASE)

    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""

    # Ponctuation française : espace insécable avant ; : ! ?  n'est pas gérée ici
    # pour rester simple ; on normalise juste les espaces autour de la ponctuation.
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)

    # Majuscule en début et après ponctuation forte.
    def _capitalize(match: re.Match) -> str:
        return match.group(1) + match.group(2).upper()

    text = text[0].upper() + text[1:]
    text = re.sub(r"([.!?]\s+)([a-zà-ÿ])", _capitalize, text)

    # Ajoute un point final si absent.
    if text and text[-1] not in ".!?":
        text += "."
    return text
