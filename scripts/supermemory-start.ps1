# Start Supermemory local server inside WSL from the current project directory.
# Docs: https://supermemory.ai/docs/self-hosting/overview

$ErrorActionPreference = "Stop"

$projectPath = (Resolve-Path (Get-Location)).Path
$wslPath = (wsl.exe -e wslpath -u "$projectPath" 2>$null).Trim()
if (-not $wslPath) {
    throw "Failed to convert project path to WSL: $projectPath"
}

Write-Host "Starting supermemory-server in WSL..."
Write-Host "Data dir: $projectPath\.supermemory"
Write-Host "URL:      http://127.0.0.1:6767"
Write-Host ""

wsl bash -lc "cd '$wslPath' && ~/.local/bin/supermemory-server"
