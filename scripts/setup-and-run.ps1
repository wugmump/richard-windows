param(
  [int]$Port = 9443,
  [string]$HostName = "0.0.0.0",
  [string]$JoinCode = "696367",
  [string]$Model = "hf.co/TheDrummer/Cydonia-24B-v4.3-GGUF:Q4_K_M",
  [string]$OllamaUrl = "http://127.0.0.1:11434",
  [switch]$SkipModelPull
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Require-Command {
  param(
    [string]$Command,
    [string]$WingetId,
    [string]$InstallName
  )

  if (Get-Command $Command -ErrorAction SilentlyContinue) {
    return
  }

  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "$InstallName is required, and winget is not available to install it automatically."
  }

  Write-Step "Installing $InstallName"
  winget install --exact --id $WingetId --accept-package-agreements --accept-source-agreements

  if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  }

  if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
    throw "$InstallName was installed, but '$Command' is not available in this shell yet. Open a new PowerShell window and run this script again."
  }
}

function Wait-For-Ollama {
  param([string]$BaseUrl)

  for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
      Invoke-RestMethod -Uri "$BaseUrl/api/tags" -Method Get -TimeoutSec 2 | Out-Null
      return
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  throw "Ollama did not become reachable at $BaseUrl."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

Write-Step "Checking prerequisites"
Require-Command -Command "node" -WingetId "OpenJS.NodeJS.LTS" -InstallName "Node.js LTS"
Require-Command -Command "npm" -WingetId "OpenJS.NodeJS.LTS" -InstallName "npm"
Require-Command -Command "ollama" -WingetId "Ollama.Ollama" -InstallName "Ollama"

Write-Step "Checking Node.js version"
$nodeVersionText = (& node --version) -replace "^v", ""
$nodeMajor = [int]($nodeVersionText.Split(".")[0])
if ($nodeMajor -lt 20) {
  throw "Node.js 20 or newer is required. Found v$nodeVersionText."
}

Write-Step "Starting Ollama if needed"
try {
  Invoke-RestMethod -Uri "$OllamaUrl/api/tags" -Method Get -TimeoutSec 2 | Out-Null
} catch {
  Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Minimized
  Wait-For-Ollama -BaseUrl $OllamaUrl
}

if (-not $SkipModelPull) {
  Write-Step "Pulling Richard model"
  & ollama pull $Model
}

Write-Step "Preparing local app data"
New-Item -ItemType Directory -Force -Path (Join-Path $repoRoot "data") | Out-Null

$env:HOST = $HostName
$env:PORT = [string]$Port
$env:RICHARD_JOIN_CODE = $JoinCode
$env:OLLAMA_URL = $OllamaUrl
$env:RICHARD_MODEL = $Model

$localUrl = "http://localhost:$Port"

Write-Step "Starting Richard Windows"
Write-Host "Local URL:  $localUrl"
Write-Host "Office URL: http://<this-windows-pc-ip>:$Port"
Write-Host "Join code:  $JoinCode"
Write-Host ""
Write-Host "Leave this PowerShell window open while Richard is running." -ForegroundColor Yellow

# Launch the browser shortly after `npm start` begins, so the HTTP listener is
# normally ready by the time the tab opens.
Start-Job -ScriptBlock {
  param([string]$Url)
  Start-Sleep -Seconds 2
  Start-Process $Url
} -ArgumentList $localUrl | Out-Null

& npm start
