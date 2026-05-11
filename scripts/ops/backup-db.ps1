[CmdletBinding()]
param(
  [string]$ContainerName = "floweypay_db",
  [string]$DbName        = "floweypay",
  [string]$DbUser        = "floweypay",
  # Directory where the .dump file will be written on the host.
  [string]$BackupDir     = "B:\BTC_NODE\backups\db",
  # Number of .dump files to keep in $BackupDir. Oldest are pruned.
  [int]$KeepBackups      = 8,
  [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

$timeStamp     = Get-Date -Format "yyyyMMdd-HHmmss"
$dumpFileName  = "$DbName-$timeStamp.dump"
$localDump     = Join-Path $BackupDir $dumpFileName
# Temporary path inside the container; cleaned up after docker cp.
$containerDump = "/tmp/$dumpFileName"

if ($WhatIf) {
  Write-Host "[WhatIf] Create directory: $BackupDir"
  Write-Host "[WhatIf] docker exec $ContainerName pg_dump -U $DbUser -d $DbName -Fc -f $containerDump"
  Write-Host "[WhatIf] docker cp ${ContainerName}:$containerDump $localDump"
  Write-Host "[WhatIf] Validate non-zero file: $localDump"
  Write-Host "[WhatIf] docker exec $ContainerName rm -f $containerDump"
  Write-Host "[WhatIf] Prune old dumps in $BackupDir (keep $KeepBackups)"
  return
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

# ---- pg_dump inside the container (Unix socket = no password needed) ---------
Write-Host "Running pg_dump inside container [$ContainerName]..."
docker exec $ContainerName pg_dump -U $DbUser -d $DbName -Fc -f $containerDump
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed (exit $LASTEXITCODE). Is the container running?"
}

# ---- Copy dump out of container ----------------------------------------------
Write-Host "Copying dump to host: $localDump"
docker cp "${ContainerName}:${containerDump}" $localDump
if ($LASTEXITCODE -ne 0) {
  throw "docker cp failed (exit $LASTEXITCODE)"
}

# ---- Clean up temp file inside container ------------------------------------
docker exec $ContainerName rm -f $containerDump 2>$null

# ---- Validate non-zero size -------------------------------------------------
$dumpItem = Get-Item -LiteralPath $localDump -ErrorAction SilentlyContinue
if (-not $dumpItem -or $dumpItem.Length -eq 0) {
  throw "Dump file is missing or empty: $localDump"
}
Write-Host ("Dump OK: $localDump ({0:N1} KB)" -f ($dumpItem.Length / 1KB))

# ---- Retention: keep newest $KeepBackups .dump files -------------------------
$allDumps = Get-ChildItem -LiteralPath $BackupDir -Filter "*.dump" -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending

if ($allDumps.Count -gt $KeepBackups) {
  $toRemove = $allDumps | Select-Object -Skip $KeepBackups
  foreach ($file in $toRemove) {
    Remove-Item -LiteralPath $file.FullName -Force
    Write-Host "Removed old dump: $($file.FullName)"
  }
}

Write-Host "DB backup complete. File: $localDump"
# Emit path for downstream consumers (orchestrators capture this via pipeline).
Write-Output $localDump
