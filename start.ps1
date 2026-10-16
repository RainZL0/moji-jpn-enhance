# Start the local server the MOJi extension talks to (http://localhost:8000).
#   ./start.ps1             normal use
#   ./start.ps1 -Port 8010  another port (set the same address in the extension popup)
param([int]$Port = 8000)

$ErrorActionPreference = "Stop"
$server = Join-Path $PSScriptRoot "server"

Write-Host "Server on http://localhost:$Port  (Ctrl+C to stop)" -ForegroundColor Green
uv run --project $server --directory $server uvicorn app:app --port $Port
