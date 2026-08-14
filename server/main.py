"""FlowWhisper — serveur FastAPI.

Expose :
  GET  /api/health        -> état du service
  GET  /api/config        -> capacités (langues, modes, fournisseur de raffinage)
  POST /api/transcribe    -> audio (multipart) -> transcription Whisper locale
  POST /api/refine        -> {text, mode} -> texte nettoyé/mis en forme

Sert aussi le frontend statique (../web) sur "/".
"""
from __future__ import annotations

import tempfile
from pathlib import Path
from threading import Lock
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from config import settings
from refine import refine as refine_text

app = FastAPI(title="FlowWhisper", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Chargement paresseux du modèle Whisper --------------------------------
_model = None
_model_lock = Lock()


def get_model():
    """Charge faster-whisper au premier appel (téléchargement du modèle si besoin)."""
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from faster_whisper import WhisperModel  # import tardif = démarrage rapide
                _model = WhisperModel(
                    settings.WHISPER_MODEL,
                    device=settings.WHISPER_DEVICE,
                    compute_type=settings.WHISPER_COMPUTE,
                )
    return _model


# --- API -------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok", "model": settings.WHISPER_MODEL}


@app.get("/api/config")
def get_config():
    return {
        "whisper_model": settings.WHISPER_MODEL,
        "refine_provider": settings.refine_available(),
        "refine_modes": ["clean", "formal", "email", "bullets"],
        "languages": [
            {"code": "auto", "label": "Détection auto"},
            {"code": "fr", "label": "Français"},
            {"code": "en", "label": "English"},
            {"code": "es", "label": "Español"},
            {"code": "de", "label": "Deutsch"},
            {"code": "it", "label": "Italiano"},
            {"code": "ar", "label": "العربية"},
            {"code": "pt", "label": "Português"},
        ],
    }


@app.post("/api/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: Optional[str] = Form("auto"),
):
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="Fichier audio vide.")

    suffix = Path(audio.filename or "audio.webm").suffix or ".webm"
    tmp_path: Optional[str] = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(data)
            tmp_path = tmp.name

        lang = None if not language or language == "auto" else language
        model = get_model()
        segments, info = model.transcribe(
            tmp_path,
            language=lang,
            vad_filter=True,           # filtre les silences
            beam_size=5,
        )
        text = "".join(seg.text for seg in segments).strip()
        return {
            "text": text,
            "language": info.language,
            "language_probability": round(float(info.language_probability), 3),
            "duration": round(float(info.duration), 2),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Échec de la transcription : {exc}")
    finally:
        if tmp_path:
            try:
                Path(tmp_path).unlink(missing_ok=True)
            except OSError:
                pass


class RefineRequest(BaseModel):
    text: str
    mode: str = "clean"


@app.post("/api/refine")
def refine_endpoint(req: RefineRequest):
    result = refine_text(req.text, req.mode)
    return JSONResponse(result)


# --- Frontend statique (monté en dernier pour ne pas masquer /api) ---------
_WEB_DIR = Path(__file__).resolve().parent.parent / "web"
if _WEB_DIR.exists():
    app.mount("/", StaticFiles(directory=str(_WEB_DIR), html=True), name="web")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=False)
