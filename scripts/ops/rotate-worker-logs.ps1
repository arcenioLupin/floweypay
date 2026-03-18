[CmdletBinding()]
param(
  [string]$LogDir = "B:\BTC_NODE\logs\worker",
  [string]$ArchiveDir = "B:\BTC_NODE\logs\worker\archive",
  [int]$KeepDays = 14,
  [int]$MinAgeMinutes = 2,   # no tocar logs muy recientes (probablemente activos)
  [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

function Test-FileLocked {
  param([string]$Path)
  try {
    $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)
    $fs.Close()
    return $false
  } catch {
    return $true
  }
}

if (-not (Test-Path -LiteralPath $LogDir)) {
  Write-Warning "Worker log directory not found: $LogDir"
  exit 0
}

New-Item -ItemType Directory -Force -Path $ArchiveDir | Out-Null

$minAgeCutoff = (Get-Date).AddMinutes(-1 * [Math]::Abs($MinAgeMinutes))

$logFiles = Get-ChildItem -LiteralPath $LogDir -File -Filter "worker-*.log" |
  Where-Object { $_.DirectoryName -ieq $LogDir } |
  Where-Object { $_.LastWriteTime -lt $minAgeCutoff }

foreach ($logFile in $logFiles) {
  $zipPath = Join-Path $ArchiveDir ($logFile.BaseName + ".zip")

  if ($WhatIf) {
    Write-Host "[WhatIf] Compress $($logFile.FullName) -> $zipPath"
    Write-Host "[WhatIf] Remove source log: $($logFile.FullName)"
    continue
  }

  if (Test-FileLocked -Path $logFile.FullName) {
    Write-Warning "Skipping locked log file: $($logFile.FullName)"
    continue
  }

  try {
    Compress-Archive -LiteralPath $logFile.FullName -DestinationPath $zipPath -CompressionLevel Optimal -Force -ErrorAction Stop

    if (Test-Path -LiteralPath $zipPath) {
      Remove-Item -LiteralPath $logFile.FullName -Force -ErrorAction Stop
      Write-Host "Archived worker log: $zipPath"
    } else {
      Write-Warning "Archive not created for: $($logFile.FullName). Skipping delete."
    }
  } catch {
    Write-Warning "Failed to archive $($logFile.FullName): $($_.Exception.Message)"
    continue
  }
}

$cutoff = (Get-Date).AddDays(-1 * [Math]::Abs($KeepDays))
$oldArchives = Get-ChildItem -LiteralPath $ArchiveDir -File -Filter "worker-*.zip" |
  Where-Object { $_.LastWriteTime -lt $cutoff }

foreach ($file in $oldArchives) {
  if ($WhatIf) {
    Write-Host "[WhatIf] Remove old archive: $($file.FullName)"
  } else {
    Remove-Item -LiteralPath $file.FullName -Force -ErrorAction Stop
    Write-Host "Removed old worker archive: $($file.FullName)"
  }
}

if ($oldArchives.Count -eq 0) {
  Write-Host "No old worker archives to prune (KeepDays=$KeepDays)."
}