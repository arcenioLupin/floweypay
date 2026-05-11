[CmdletBinding()]
param(
  [string]$DailyRoot  = "B:\BTC_NODE\backups\daily",
  [string]$LogDir     = "B:\BTC_NODE\logs\backup",
  # Number of daily backup directories to keep. Oldest are pruned.
  [int]$KeepDaily     = 7,
  [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

$timeStamp  = Get-Date -Format "yyyyMMdd-HHmmss"
$dateStamp  = Get-Date -Format "yyyy-MM-dd"
$dailyDir   = Join-Path $DailyRoot $timeStamp
$dbDir      = Join-Path $dailyDir "db"
$logFile    = Join-Path $LogDir "daily-$dateStamp.log"
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$exitCode   = 0

function Log([string]$msg) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
  Write-Host $line
  if (-not $WhatIf) {
    Add-Content -LiteralPath $logFile -Value $line
  }
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if ($WhatIf) {
  Write-Host "[WhatIf] Daily backup dir : $dailyDir"
  Write-Host "[WhatIf] Log file         : $logFile"
  Write-Host ""
  Write-Host "--- DB backup ---"
  & "$ScriptDir\backup-db.ps1" -BackupDir $dbDir -KeepBackups 9999 -WhatIf
  Write-Host ""
  Write-Host "[WhatIf] Prune $DailyRoot - keep $KeepDaily dirs"
  return
}

New-Item -ItemType Directory -Force -Path $dailyDir | Out-Null
New-Item -ItemType Directory -Force -Path $dbDir | Out-Null

Log "==== Daily backup started ===="
Log "  Dir : $dailyDir"

# ---- DB backup only ---------------------------------------------------------
Log "---- DB backup ----"
try {
  # KeepBackups=9999 because retention is managed at the daily dir level below.
  $dumpPath = & "$ScriptDir\backup-db.ps1" -BackupDir $dbDir -KeepBackups 9999
  if (-not $dumpPath -or -not (Test-Path -LiteralPath $dumpPath)) {
    throw "backup-db.ps1 did not produce a valid dump file"
  }
  Log "DB backup: OK - $dumpPath"
} catch {
  Log "DB backup: FAILED - $_"
  $exitCode = 1
}

# ---- Prune old daily directories --------------------------------------------
Log "---- Pruning daily backups (keep $KeepDaily) ----"
try {
  $allDaily = Get-ChildItem -LiteralPath $DailyRoot -Directory |
    Sort-Object Name -Descending
  if ($allDaily.Count -gt $KeepDaily) {
    $toRemove = $allDaily | Select-Object -Skip $KeepDaily
    foreach ($dir in $toRemove) {
      Remove-Item -LiteralPath $dir.FullName -Recurse -Force
      Log "Removed old daily backup: $($dir.FullName)"
    }
  }
} catch {
  Log "Pruning failed - $_"
}

$status = if ($exitCode -eq 0) { "SUCCESS" } else { "FAILURE" }
Log "==== Daily backup $status (exit $exitCode) ===="

exit $exitCode
