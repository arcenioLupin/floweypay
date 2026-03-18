[CmdletBinding()]
param(
  [string]$RepoRoot = "D:\software-sas\workspace\floweypay",
  [string]$WorkerDir = "D:\software-sas\workspace\floweypay\apps\worker",
  [string]$LogDir = "B:\BTC_NODE\logs\worker",
  [string]$ProcessIdFile = "B:\BTC_NODE\run\worker.pid",
  [string]$EnvFile = "B:\BTC_NODE\config\worker.env.ps1",
  [switch]$ForceRestart
)

$ErrorActionPreference = "Stop"

function Get-WorkerProcessId {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $raw = Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $raw) { return $null }
  $id = 0
  if ([int]::TryParse($raw, [ref]$id)) { return $id }
  return $null
}

function Test-ProcessAlive {
  param([int]$ProcessId)
  if (-not $ProcessId) { return $false }
  try { $null = Get-Process -Id $ProcessId -ErrorAction Stop; return $true } catch { return $false }
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ProcessIdFile) | Out-Null

$existingProcessId = Get-WorkerProcessId -Path $ProcessIdFile
if ($existingProcessId -and (Test-ProcessAlive -ProcessId $existingProcessId)) {
  if (-not $ForceRestart) {
    Write-Host "Worker already running (PID=$existingProcessId). Use -ForceRestart to restart."
    exit 0
  }

  Write-Host "Stopping existing worker PID=$existingProcessId before restart..."
  Stop-Process -Id $existingProcessId -Force
  Start-Sleep -Seconds 1
}

if (Test-Path -LiteralPath $EnvFile) {
  . $EnvFile
  Write-Host "Loaded worker environment file: $EnvFile"
} else {
  Write-Warning "Env file not found: $EnvFile. Using current process environment."
}

if (-not $env:BTC_NETWORK)   { $env:BTC_NETWORK   = "signet" }
if (-not $env:BTC_ZMQ_RAWTX) { $env:BTC_ZMQ_RAWTX = "tcp://127.0.0.1:28334" }
if (-not $env:BTC_ZMQ_RAWBLOCK) { $env:BTC_ZMQ_RAWBLOCK = "tcp://127.0.0.1:28335" }
if (-not $env:BTC_RPC_URL)   { $env:BTC_RPC_URL   = "http://127.0.0.1:38332" }

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outLog = Join-Path $LogDir ("worker-$timestamp.out.log")
$errLog = Join-Path $LogDir ("worker-$timestamp.err.log")

$compiledEntrypoint = Join-Path $WorkerDir "dist\index.js"
if (Test-Path -LiteralPath $compiledEntrypoint) {
  $exe = "node"
  $args = "dist/index.js"
  Write-Host "Starting compiled worker: node dist/index.js"
} else {
  $exe = "npx.cmd"
  $args = "tsx src/index.ts"
  Write-Host "Starting worker via tsx: npx tsx src/index.ts"
}

$proc = Start-Process -FilePath $exe `
  -ArgumentList $args `
  -WorkingDirectory $WorkerDir `
  -NoNewWindow `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -PassThru

Set-Content -LiteralPath $ProcessIdFile -Value $proc.Id -NoNewline

Write-Host "Worker started. PID=$($proc.Id)"
Write-Host "Stdout: $outLog"
Write-Host "Stderr: $errLog"