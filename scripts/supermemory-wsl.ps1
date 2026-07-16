# Install Supermemory local inside WSL (required on Windows — no native binary yet).
# Docs: https://supermemory.ai/docs/self-hosting/overview

$ErrorActionPreference = "Stop"

function Test-WslInstalled {
    try {
        $null = wsl --status 2>$null
        return $true
    } catch {
        return $false
    }
}

if (-not (Test-WslInstalled)) {
    Write-Host ""
    Write-Host "WSL is required to run Supermemory local on Windows."
    Write-Host "Install it with:  wsl --install"
    Write-Host "Then reboot and run this script again."
    Write-Host ""
    Write-Host "Alternatively, use macOS/Linux or a Linux VM."
    exit 1
}

Write-Host "Installing Supermemory local inside WSL..."
Write-Host "(Uses your GEMINI_API_KEY from WSL environment if set)"
Write-Host ""

$installCmd = @'
set -e
if [ -n "$GEMINI_API_KEY" ]; then export GEMINI_API_KEY; fi
curl -fsSL https://supermemory.ai/install | bash
'@

wsl bash -lc $installCmd

Write-Host ""
Write-Host "Done. Start the server with:  npm run memory:start:wsl"
Write-Host "Then copy the sm_... API key into your .env as SUPERMEMORY_API_KEY"
