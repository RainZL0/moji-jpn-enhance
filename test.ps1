# Run every test and check. Stops at the first one that fails.
#   ./test.ps1
# The word-chain tests (tests/extension/chain.test.js) need the local server (./start.ps1);
# without it they are skipped. Set TTS_SERVER if it is not on http://localhost:8000.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$server = Join-Path $root "server"

function Step($name, [scriptblock]$run) {
    Write-Host "== $name" -ForegroundColor Cyan
    & $run
    if ($LASTEXITCODE) { Write-Host "FAILED: $name" -ForegroundColor Red; exit $LASTEXITCODE }
}

if (-not (Test-Path (Join-Path $root "node_modules"))) { Step "npm install" { npm --prefix $root ci } }
Step "server tests" { uv run --project $server --directory $server pytest -q }
Step "python style" { uvx ruff check $server; if (-not $LASTEXITCODE) { uvx ruff format --check $server } }
Step "extension syntax" { Get-ChildItem (Join-Path $root "extension/*.js") | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE) { return } } }
Step "extension tests" { Push-Location $root; try { node --test "tests/extension/*.test.js" } finally { Pop-Location } }
Step "doc links" { Push-Location $root; try { lychee --offline --no-progress . } finally { Pop-Location } }
Write-Host "All passed." -ForegroundColor Green
