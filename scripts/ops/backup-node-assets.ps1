[CmdletBinding()]
param(
  [string]$Datadir = "B:\BTC_NODE\bitcoin-data",
  [string]$RepoRoot = "D:\software-sas\workspace\floweypay",
  [string]$BackupRoot = "B:\BTC_NODE\backups",
  [ValidateSet("all", "config", "wallet")]
  [string]$Mode = "all",
  [int]$KeepBackups = 14,
  [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

$dateStamp = Get-Date -Format "yyyy-MM-dd"
$timeStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $BackupRoot ("$dateStamp-$timeStamp")
$configOut = Join-Path $backupDir "config"
$walletOut = Join-Path $backupDir "wallets"

$pathsToCreate = @($backupDir)
if ($Mode -in @("all", "config")) { $pathsToCreate += $configOut }
if ($Mode -in @("all", "wallet")) { $pathsToCreate += $walletOut }

foreach ($path in $pathsToCreate) {
  if ($WhatIf) {
    Write-Host "[WhatIf] Create directory: $path"
  } else {
    New-Item -ItemType Directory -Force -Path $path | Out-Null
  }
}

if ($Mode -in @("all", "config")) {
  $bitcoinConf = Join-Path $Datadir "bitcoin.conf"
  $templateFiles = @(
    (Join-Path $RepoRoot ".env.example"),
    (Join-Path $RepoRoot "apps\web\.env.example")
  )

  if (Test-Path -LiteralPath $bitcoinConf) {
    if ($WhatIf) {
      Write-Host "[WhatIf] Copy $bitcoinConf -> $configOut"
    } else {
      Copy-Item -LiteralPath $bitcoinConf -Destination $configOut -Force
    }
  } else {
    Write-Warning "Not found (skipping): $bitcoinConf"
  }

  foreach ($templatePath in $templateFiles) {
    if (Test-Path -LiteralPath $templatePath) {
      if ($WhatIf) {
        Write-Host "[WhatIf] Copy $templatePath -> $configOut"
      } else {
        Copy-Item -LiteralPath $templatePath -Destination $configOut -Force
      }
    } else {
      Write-Warning "Not found (skipping): $templatePath"
    }
  }
}

if ($Mode -in @("all", "wallet")) {

  # Try common wallet locations (root + per-network under datadir)
  $walletCandidates = @(
    (Join-Path $Datadir "wallets"),
    (Join-Path $Datadir "signet\wallets"),
    (Join-Path $Datadir "regtest\wallets"),
    (Join-Path $Datadir "testnet3\wallets"),
    (Join-Path $Datadir "mainnet\wallets")
  )

  $walletSource = $walletCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

  if ($walletSource) {
    Write-Host "Wallet source detected: $walletSource"
    if ($WhatIf) {
      Write-Host "[WhatIf] Copy wallet directory $walletSource -> $walletOut"
    } else {
      Copy-Item -LiteralPath $walletSource -Destination $walletOut -Recurse -Force
    }
  } else {
    Write-Warning "Wallet directory not found in expected locations under datadir: $Datadir"
    Write-Warning ("Checked: " + ($walletCandidates -join ", "))
  }
}

if (-not $WhatIf) {
  $metaPath = Join-Path $backupDir "backup-meta.txt"
  $meta = @(
    "timestamp=$(Get-Date -Format o)",
    "mode=$Mode",
    "datadir=$Datadir",
    "repoRoot=$RepoRoot"
  )
  Set-Content -LiteralPath $metaPath -Value $meta
}

# Keep only the newest N backups by directory timestamp/name.
$allBackups = @()
if (Test-Path -LiteralPath $BackupRoot) {
  $allBackups = Get-ChildItem -LiteralPath $BackupRoot -Directory |
    Sort-Object Name -Descending
}

if ($allBackups.Count -gt $KeepBackups) {
  $toRemove = $allBackups | Select-Object -Skip $KeepBackups
  foreach ($dir in $toRemove) {
    if ($WhatIf) {
      Write-Host "[WhatIf] Remove old backup directory: $($dir.FullName)"
    } else {
      Remove-Item -LiteralPath $dir.FullName -Recurse -Force
      Write-Host "Removed old backup directory: $($dir.FullName)"
    }
  }
}

Write-Host "Backup complete. Mode=$Mode Destination=$backupDir"