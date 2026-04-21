$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $repoRoot "Backend"
$frontendPath = Join-Path $repoRoot "Frontend"
$pythonExe = "c:/INDUSTRIAI/.venv/Scripts/python.exe"

Start-Process pwsh -ArgumentList "-NoExit", "-Command", "Set-Location '$backendPath'; $pythonExe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "Set-Location '$frontendPath'; npm run dev"

Write-Host "Started backend on http://localhost:8000 and frontend on http://localhost:3000"
Write-Host "Use: http://localhost:3000"
