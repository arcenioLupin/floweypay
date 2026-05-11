[CmdletBinding()]
param(
  [string]$WeeklyRoot = "B:\BTC_NODE\backups\weekly",
  [string]$Datadir    = "B:\BTC_NODE\bitcoin-data",
  [string]$RepoRoot   = "D:\software-sas\workspace\floweypay",
  [string]$LogDir     = "B:\BTC_NODE\logs\backup",
  # Number of weekly backup directories to keep. Oldest are pruned.
  [int]$KeepWeekly    = 8,
  [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

$timeStamp  = Get-Date -Format "yyyyMMdd-HHmmss"
$dateStamp  = Get-Date -Format "yyyy-MM-dd"
$weeklyDir  = Join-Path $WeeklyRoot $timeStamp
$dbDir      = Join-Path $weeklyDir "db"
$logFile    = Join-Path $LogDir "weekly-$dateStamp.log"
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
  Write-Host "[WhatIf] Weekly backup dir : $weeklyDir"
  Write-Host "[WhatIf] Log file          : $logFile"
  Write-Host ""
  Write-Host "--- Step 1: backup-node-assets.ps1 ---"
  & "$ScriptDir\backup-node-assets.ps1" `
    -Datadir $Datadir -RepoRoot $RepoRoot -BackupRoot $WeeklyRoot `
    -OutDir $weeklyDir -Mode all -WhatIf
  Write-Host ""
  Write-Host "--- Step 2: backup-db.ps1 ---"
  & "$ScriptDir\backup-db.ps1" -BackupDir $dbDir -KeepBackups 9999 -WhatIf
  Write-Host ""
  Write-Host "--- Step 3: restore-db.ps1 ---"
  Write-Host "[WhatIf] restore-db.ps1 -DumpFile <dump from step 2> -WhatIf"
  Write-Host ""
  Write-Host "[WhatIf] Prune $WeeklyRoot - keep $KeepWeekly dirs"
  return
}

New-Item -ItemType Directory -Force -Path $weeklyDir | Out-Null
New-Item -ItemType Directory -Force -Path $dbDir | Out-Null

Log "==== Weekly backup started ===="
Log "  Dir : $weeklyDir"
Log "  Log : $logFile"

# ---- Step 1: Node assets (wallets + config) ----------------------------------
Log "---- Step 1: node assets (wallets + config) ----"
try {
  & "$ScriptDir\backup-node-assets.ps1" `
    -Datadir $Datadir -RepoRoot $RepoRoot -BackupRoot $WeeklyRoot `
    -OutDir $weeklyDir -Mode all
  Log "Step 1: OK"
} catch {
  Log "Step 1: FAILED - $_"
  $exitCode = 1
}

# ---- Step 2: DB backup -------------------------------------------------------
Log "---- Step 2: DB backup ----"
$dumpPath = $null
try {
  # KeepBackups=9999 because retention is managed at the weekly dir level below.
  $dumpPath = & "$ScriptDir\backup-db.ps1" -BackupDir $dbDir -KeepBackups 9999
  if (-not $dumpPath -or -not (Test-Path -LiteralPath $dumpPath)) {
    throw "backup-db.ps1 did not produce a valid dump file"
  }
  Log "Step 2: OK - $dumpPath"
} catch {
  Log "Step 2: FAILED - $_"
  $exitCode = 1
}

# ---- Step 3: Restore validation ---------------------------------------------
Log "---- Step 3: restore validation ----"
if ($dumpPath -and (Test-Path -LiteralPath $dumpPath)) {
  try {
    & "$ScriptDir\restore-db.ps1" -DumpFile $dumpPath
    Log "Step 3: OK"
  } catch {
    Log "Step 3: FAILED - $_"
    $exitCode = 1
  }
} else {
  Log "Step 3: SKIPPED (no valid dump from step 2)"
  $exitCode = 1
}

# ---- Step 4: Prune old weekly directories ------------------------------------
Log "---- Step 4: pruning weekly backups (keep $KeepWeekly) ----"
try {
  $allWeekly = Get-ChildItem -LiteralPath $WeeklyRoot -Directory |
    Sort-Object Name -Descending
  if ($allWeekly.Count -gt $KeepWeekly) {
    $toRemove = $allWeekly | Select-Object -Skip $KeepWeekly
    foreach ($dir in $toRemove) {
      Remove-Item -LiteralPath $dir.FullName -Recurse -Force
      Log "Removed old weekly backup: $($dir.FullName)"
    }
  }
} catch {
  Log "Pruning failed - $_"
}

$status = if ($exitCode -eq 0) { "SUCCESS" } else { "PARTIAL FAILURE" }
Log "==== Weekly backup $status (exit $exitCode) ===="

exit $exitCode
