# Aethera v2.0 — Windows Installer
# Usage: irm https://raw.githubusercontent.com/Unknows05/Aethera-agent/main/install.ps1 | iex

$ErrorActionPreference = "Stop"
$repo = "https://github.com/Unknows05/Aethera-agent.git"
$installDir = if ($env:AETHERA_DIR) { $env:AETHERA_DIR } else { "$env:USERPROFILE\aethera-v2" }
$version = "2.0.0"

Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║   Aethera v$version -- Installer        ║" -ForegroundColor Cyan
Write-Host "  ║   Autonomous AI Trading Agent        ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

function Check-Command {
    param($Name)
    if (Get-Command $Name -ErrorAction SilentlyContinue) {
        Write-Host "[OK] $Name found" -ForegroundColor Green
        return $true
    } else {
        Write-Host "[ERR] $Name not found. Please install it first." -ForegroundColor Red
        return $false
    }
}

Write-Host "Checking dependencies..." -ForegroundColor Cyan
if (-not (Check-Command "git")) { exit 1 }
if (-not (Check-Command "node")) { exit 1 }

$nodeVer = node -v
if ($nodeVer -match 'v(\d+)') {
    $major = [int]$Matches[1]
    if ($major -lt 20) {
        Write-Host "[ERR] Node.js 20+ required (found $nodeVer)" -ForegroundColor Red
        exit 1
    }
}
Write-Host "[OK] Node.js $(node -v)" -ForegroundColor Green

if (Test-Path "$installDir\.git") {
    Write-Host "Updating existing installation..." -ForegroundColor Yellow
    Set-Location $installDir
    git fetch origin main 2>$null
    git reset --hard origin/main 2>$null
} else {
    Write-Host "Installing Aethera to $installDir..." -ForegroundColor Cyan
    git clone $repo $installDir 2>&1 | Out-Null
    if (-not (Test-Path $installDir)) {
        Write-Host "[ERR] Clone failed." -ForegroundColor Red
        exit 1
    }
}

Set-Location "$installDir\agent"

Write-Host "Installing dependencies..." -ForegroundColor Cyan
npm install --silent 2>$null
Write-Host "[OK] Dependencies installed" -ForegroundColor Green

Write-Host "Building TypeScript..." -ForegroundColor Cyan
npm run build
Write-Host "[OK] TypeScript built" -ForegroundColor Green

if (Test-Path "tui") {
    Write-Host "Building TUI..." -ForegroundColor Cyan
    Set-Location tui
    npm install --silent 2>$null
    npm run build 2>$null
    Set-Location ..
    Write-Host "[OK] TUI built" -ForegroundColor Green
}

$binDir = "$env:USERPROFILE\.local\bin"
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

$wrapperPath = "$binDir\aethera.cmd"
@"
@echo off
set "AETHERA_ROOT=${installDir}\agent"
node "%AETHERA_ROOT%\dist\cli\index.js" %*
"@ | Out-File -FilePath $wrapperPath -Encoding ASCII

Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   Aethera v$version installed!           ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. aethera init     -- Setup wizard (Binance LLM config)" -ForegroundColor Yellow
Write-Host "  2. aethera start    -- Launch TUI" -ForegroundColor Yellow
Write-Host ""
Write-Host "Add to PATH: $binDir" -ForegroundColor Cyan
Write-Host ""
