# FlowWhisper 🎙️

Application de **dictée vocale par IA**, inspirée de FlowWhisper / Wispr Flow.
Vous parlez, l'application transcrit votre voix **localement** avec Whisper, puis un
LLM **nettoie et met en forme** le texte (ponctuation, suppression des hésitations,
reformulation). Le texte final est copiable en un clic.

> Base **web** (navigateur + serveur local), structurée pour évoluer vers une
> **application de bureau** (scaffold Electron fourni).

---

## ✨ Fonctionnalités

- 🎤 **Enregistrement micro** dans le navigateur (`MediaRecorder`), avec indicateur de niveau audio.
- 🧠 **Transcription 100 % locale** via [`faster-whisper`](https://github.com/SYSTRAN/faster-whisper) — privée, sans envoi de votre audio dans le cloud.
- 🌍 **Multilingue** (détection automatique ou langue forcée : français, anglais, etc.).
- ✍️ **Raffinage par IA** avec plusieurs modes : `Nettoyer`, `Formel`, `E-mail`, `Puces`.
  - Compatible **OpenAI**, **Ollama** (local), **Anthropic**.
  - **Repli local sans clé API** : nettoyage heuristique (ponctuation, majuscules, filtres d'hésitations).
- ⌨️ **Push-to-talk** : maintenir la barre d'espace pour dicter.
- 📋 **Copie en un clic** + **historique** des dictées de la session.
- 🖥️ **Scaffold Electron** pour packager l'app en bureau (Windows/Mac/Linux).

---

## 🏗️ Architecture

```
flowwhisper/
├── server/                 # Backend Python (FastAPI)
│   ├── main.py             # API : /transcribe, /refine, /config + sert le front
│   ├── refine.py           # Nettoyage/mise en forme du texte par LLM (+ repli local)
│   ├── config.py           # Configuration via variables d'environnement
│   └── requirements.txt
├── web/                    # Frontend (HTML/CSS/JS, sans build)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── desktop/               # Scaffold Electron (évolution bureau)
│   ├── package.json
│   ├── main.js
│   └── preload.js
├── .env.example          # Modèle de configuration
├── run.sh / run.ps1      # Scripts de lancement
└── README.md
```

**Flux :** navigateur (micro) → `POST /api/transcribe` (Whisper local) → texte brut
→ `POST /api/refine` (LLM) → texte propre → affichage + copie.

---

## 🚀 Démarrage rapide

### 1. Prérequis

- **Python 3.9+**
- **ffmpeg** installé (nécessaire à `faster-whisper` pour décoder l'audio) :
  - Ubuntu/Debian : `sudo apt install ffmpeg`
  - macOS : `brew install ffmpeg`
  - Windows : `choco install ffmpeg` (ou télécharger sur ffmpeg.org)

### 2. Installation

```bash
cd server
python -m venv .venv
source .venv/bin/activate        # Windows : .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configuration (optionnelle)

Copiez `.env.example` en `.env` et ajustez si besoin :

```bash
cp .env.example .env
```

Sans clé API, le raffinage utilise le **repli local** (aucune configuration requise).
Pour un raffinage IA de meilleure qualité, renseignez un fournisseur (voir plus bas).

### 4. Lancement

```bash
# Depuis la racine du projet
./run.sh            # Linux / macOS
# ou
pwsh ./run.ps1      # Windows (PowerShell)
```

Puis ouvrez **http://localhost:8000** dans votre navigateur.

> ⚠️ Le micro nécessite un contexte sécurisé : `localhost` fonctionne. Pour un accès
> réseau, servez l'app en HTTPS.

---

## ⚙️ Configuration du raffinage IA

Variables d'environnement (dans `.env`) :

| Variable            | Description                                                        | Défaut                     |
|---------------------|-------------------------------------------------------------------|----------------------------|
| `REFINE_PROVIDER`   | `local`, `openai`, `anthropic`                                     | `local`                    |
| `WHISPER_MODEL`     | Taille du modèle : `tiny`, `base`, `small`, `medium`, `large-v3`  | `base`                     |
| `WHISPER_DEVICE`    | `auto`, `cpu`, `cuda`                                              | `auto`                     |
| `WHISPER_COMPUTE`   | `int8`, `int8_float16`, `float16`, `float32`                       | `int8`                     |
| `OPENAI_API_KEY`    | Clé API (aussi utilisée pour Ollama/serveurs compatibles)         | —                          |
| `OPENAI_BASE_URL`   | URL de base compatible OpenAI                                      | `https://api.openai.com/v1`|
| `OPENAI_MODEL`      | Modèle de chat                                                     | `gpt-4o-mini`              |
| `ANTHROPIC_API_KEY` | Clé API Anthropic                                                 | —                          |
| `ANTHROPIC_MODEL`   | Modèle Anthropic                                                  | `claude-3-5-haiku-latest`  |

### Exemple : Ollama (LLM local, 100 % privé)

```env
REFINE_PROVIDER=openai
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
OPENAI_MODEL=llama3.1
```

---

## 🖥️ Vers une application de bureau (Electron)

Le dossier `desktop/` contient un scaffold Electron qui charge l'interface web et
enregistre un **raccourci global** pour afficher/masquer la fenêtre de dictée.

```bash
cd desktop
npm install
npm start        # lance le serveur Python + la fenêtre Electron
```

**Étapes suivantes (roadmap bureau) :**
- Collage automatique du texte dans n'importe quelle application (via `nut.js` / `robotjs`).
- Overlay flottant et dictée « au premier plan ».
- Empaquetage installable (`electron-builder`).

---

## 🔒 Confidentialité

- **La transcription reste locale** : votre audio n'est jamais envoyé à un service tiers.
- Le **raffinage** n'envoie du **texte** à un LLM que si vous configurez un fournisseur
  cloud. Avec `REFINE_PROVIDER=local` ou Ollama, **rien ne sort de votre machine**.

---

## 📝 Licence

MIT — voir [`LICENSE`](LICENSE).
