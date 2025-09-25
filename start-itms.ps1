#requires -version 5
# Run from project root. Starts Docker services and launches the Electron app.
# Usage: Launch via start-itms.cmd or right-click -> Run with PowerShell

param(
    [switch]$Prod
)

$ErrorActionPreference = 'Stop'

function Write-Info($message) {
    $timestamp = Get-Date -Format 'HH:mm:ss'
    Write-Host "[$timestamp] $message"
}

function Find-Command {
    param(
        [Parameter(Mandatory=$true)][string]$Name,
        [string[]]$Candidates
    )
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
    if (-not $cmd -and $Candidates) {
        foreach ($c in $Candidates) {
            if (Test-Path $c) { $cmd = $c; break }
        }
    }
    return $cmd
}

# Resolve docker and npm paths early and fail fast if missing
$DockerCmd = Find-Command -Name 'docker.exe' -Candidates @(
    "$Env:ProgramFiles\Docker\Docker\resources\bin\docker.exe"
)
if (-not $DockerCmd) { $DockerCmd = Find-Command -Name 'docker' }
if (-not $DockerCmd) { throw 'Docker CLI not found. Please install Docker Desktop and restart.' }

$NpmCmd = Find-Command -Name 'npm.cmd' -Candidates @(
    "$Env:ProgramFiles\nodejs\npm.cmd",
    "$Env:APPDATA\npm\npm.cmd"
)
if (-not $NpmCmd) { $NpmCmd = Find-Command -Name 'npm' }
if (-not $NpmCmd) { throw 'npm not found. Please install Node.js and ensure npm is on PATH.' }

function Ensure-DockerRunning {
    Write-Info 'Checking Docker Desktop...'
    $dockerOk = $false
    try {
        $version = & $DockerCmd version --format '{{.Server.Version}}' 2>$null
        if ($LASTEXITCODE -eq 0 -and $version) { $dockerOk = $true }
    } catch {}

    if (-not $dockerOk) {
        Write-Info 'Starting Docker Desktop...'
        $dockerDesktopPath = "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
        if (-not (Test-Path $dockerDesktopPath)) {
            $dockerDesktopPath = "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
        }
        if (Test-Path $dockerDesktopPath) {
            Start-Process -FilePath $dockerDesktopPath | Out-Null
        } else {
            throw 'Docker Desktop is not installed at the expected path.'
        }
    }

    $timeoutSec = 180
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $timeoutSec) {
        try {
            & $DockerCmd info 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Info 'Docker engine is ready.'
                return
            }
        } catch {}
        Start-Sleep -Seconds 3
    }
    throw 'Docker engine did not become ready in time.'
}

function Compose-Up {
    Write-Info 'Bringing up Docker Compose services...'
    & $DockerCmd 'compose' 'up' '-d' '--build'
    if ($LASTEXITCODE -ne 0) {
        throw 'docker compose up failed.'
    }
}

function Ensure-Dependencies {
    Write-Info 'Installing npm dependencies if needed...'
    if (Test-Path 'package-lock.json') {
        & $NpmCmd ci --silent
    } else {
        & $NpmCmd install --silent
    }
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
}

function Ensure-FrontEndBuilt {
    param([switch]$Prod)
    if (-not $Prod) { return }
    $indexPath = Join-Path $PSScriptRoot 'dist\index.html'
    if (-not (Test-Path $indexPath)) {
        Write-Info 'Building frontend (vite build)...'
        & $NpmCmd exec vite build
        if ($LASTEXITCODE -ne 0) { throw 'vite build failed.' }
    }
}

function Start-App {
    param(
        [switch]$Prod
    )
    if ($Prod) {
        Write-Info 'Starting Electron in production mode...'
        & $NpmCmd run start
    } else {
        Write-Info 'Starting app in dev mode (vite + electron)...'
        & $NpmCmd run dev
    }
}

Push-Location $PSScriptRoot
try {
    # Add debugging information
    Write-Info "Script started from: $PSScriptRoot"
    Write-Info "Current working directory: $(Get-Location)"
    Write-Info "PowerShell version: $($PSVersionTable.PSVersion)"
    Write-Info "Execution policy: $(Get-ExecutionPolicy)"
    
    $logDir = Join-Path $PSScriptRoot 'logs'
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
    $logFile = Join-Path $logDir ("launch-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log")
    Start-Transcript -Path $logFile -Append | Out-Null

    Write-Info "Starting ITMS launch sequence..."
    Ensure-DockerRunning
    Compose-Up
    Ensure-Dependencies
    Ensure-FrontEndBuilt -Prod:$Prod
    Start-App -Prod:$Prod
    Write-Info "ITMS launch sequence completed successfully."
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Stack trace: $($_.ScriptStackTrace)" -ForegroundColor Red
    throw
} finally {
    try { Stop-Transcript | Out-Null } catch {}
    Pop-Location
}
