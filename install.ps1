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

# ── Runtime Detection ──────────────────────────────────

$runtime = ""
$runtimeCmd = ""

if (Get-Command "bun" -ErrorAction SilentlyContinue) {
    $bunVer = bun --version
    Write-Host "[OK] Bun $bunVer" -ForegroundColor Green
    $runtime = "bun"
    $runtimeCmd = "bun"
} elseif (Get-Command "node" -ErrorAction SilentlyContinue) {
    $nodeVer = node -v
    if ($nodeVer -match 'v(\d+)') {
        $major = [int]$Matches[1]
        if ($major -lt 20) {
            Write-Host "[ERR] Node.js 20+ required (found $nodeVer)" -ForegroundColor Red
            Write-Host "  Download: https://nodejs.org/" -ForegroundColor Cyan
            exit 1
        }
    }
    Write-Host "[OK] Node.js $(node -v)" -ForegroundColor Green
    $runtime = "node"
    $runtimeCmd = "node"
} else {
    Write-Host "[ERR] No supported runtime found. Install one:" -ForegroundColor Red
    Write-Host "  - Node.js 20+  -> https://nodejs.org/" -ForegroundColor Cyan
    Write-Host "  - Bun >=1.0    -> https://bun.sh/" -ForegroundColor Cyan
    exit 1
}

if (-not (Get-Command "git" -ErrorAction SilentlyContinue)) {
    Write-Host "[ERR] Git not found. Install: https://git-scm.com/" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Git" -ForegroundColor Green

# ── Install / Update ────────────────────────────────────

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

if ($runtime -eq "bun") {
    $wrapperContent = "@echo off`r`nset `"AETHERA_ROOT=${installDir}\agent`"`r`nbun `"%AETHERA_ROOT%\src\cli\index.ts`" %*"
} else {
    $wrapperContent = "@echo off`r`nset `"AETHERA_ROOT=${installDir}\agent`"`r`nnode `"%AETHERA_ROOT%\dist\cli\index.js`" %*"
}

$wrapperContent | Out-File -FilePath "$binDir\aethera.cmd" -Encoding ASCII

Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   Aethera v$version installed!           ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. aethera init     -- Setup wizard" -ForegroundColor Yellow
Write-Host "  2. aethera start    -- Launch TUI" -ForegroundColor Yellow
Write-Host ""
Write-Host "Uninstall: aethera uninstall" -ForegroundColor Cyan
Write-Host ""
Write-Host "Add to PATH: $binDir" -ForegroundColor Cyan
Write-Host ""
