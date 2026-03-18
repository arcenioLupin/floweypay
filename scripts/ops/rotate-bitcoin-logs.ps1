[CmdletBinding()]
param(
  [string]$Datadir = "B:\BTC_NODE\bitcoin-data",
  [string]$ArchiveDir = "B:\BTC_NODE\logs\bitcoin",
  [int]$KeepDays = 14,
  [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

$debugLogPath = Join-Path $Datadir "debug.log"
if (-not (Test-Path -LiteralPath $debugLogPath)) {
  Write-Warning "Bitcoin log not found: $debugLogPath"
  exit 0
}

New-Item -ItemType Directory -Force -Path $ArchiveDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$copiedLogPath = Join-Path $ArchiveDir ("debug-$timestamp.log")
$zipPath = Join-Path $ArchiveDir ("debug-$timestamp.zip")

if ($WhatIf) {
  Write-Host "[WhatIf] Copy $debugLogPath -> $copiedLogPath"
  Write-Host "[WhatIf] Compress $copiedLogPath -> $zipPath"
  Write-Host "[WhatIf] Remove copied log: $copiedLogPath"
} else {
  # Copy-only rotation: do not rename or truncate live debug.log.
  Copy-Item -LiteralPath $debugLogPath -Destination $copiedLogPath -Force
  Compress-Archive -LiteralPath $copiedLogPath -DestinationPath $zipPath -CompressionLevel Optimal -Force
  Remove-Item -LiteralPath $copiedLogPath -Force
  Write-Host "Created archive: $zipPath"
}

$cutoff = (Get-Date).AddDays(-1 * [Math]::Abs($KeepDays))
$oldArchives = Get-ChildItem -LiteralPath $ArchiveDir -File -Filter "debug-*.zip" |
  Where-Object { $_.LastWriteTime -lt $cutoff }

if ($oldArchives.Count -eq 0) {
  Write-Host "No old bitcoin archives to prune (KeepDays=$KeepDays)."
  exit 0
}

foreach ($file in $oldArchives) {
  if ($WhatIf) {
    Write-Host "[WhatIf] Remove old archive: $($file.FullName)"
  } else {
    Remove-Item -LiteralPath $file.FullName -Force
    Write-Host "Removed old archive: $($file.FullName)"
  }
}
