# Lance le serveur FlowWhisper (Windows / PowerShell).
$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot/server"

if (-not (Test-Path ".venv")) {
    Write-Host "-> Creation de l'environnement virtuel..."
    python -m venv .venv
    & ".venv/Scripts/python.exe" -m pip install --upgrade pip
    & ".venv/Scripts/pip.exe" install -r requirements.txt
}

$port = if ($env:PORT) { $env:PORT } else { "8000" }
Write-Host "-> Demarrage de FlowWhisper sur http://localhost:$port"
& ".venv/Scripts/python.exe" main.py
