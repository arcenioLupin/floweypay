[CmdletBinding()]
param(
  [string]$ProcessIdFile = "B:\BTC_NODE\run\worker.pid",
  [switch]$Force
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

$workerProcessId = Get-WorkerProcessId -Path $ProcessIdFile
if (-not $workerProcessId) {
  Write-Host "Worker not running (pid file not found or empty): $ProcessIdFile"
  exit 0
}

if (-not (Test-ProcessAlive -ProcessId $workerProcessId)) {
  Write-Host "Worker process is not alive (PID=$workerProcessId). Removing pid file."
  Remove-Item -LiteralPath $ProcessIdFile -Force -ErrorAction SilentlyContinue
  exit 0
}

Write-Host "Stopping worker PID=$workerProcessId ..."
Stop-Process -Id $workerProcessId -Force:$Force.IsPresent
Start-Sleep -Seconds 1

if (-not (Test-ProcessAlive -ProcessId $workerProcessId)) {
  Remove-Item -LiteralPath $ProcessIdFile -Force -ErrorAction SilentlyContinue
  Write-Host "Worker stopped."
  exit 0
}

Write-Warning "Worker still appears alive after stop attempt (PID=$workerProcessId)."
exit 1