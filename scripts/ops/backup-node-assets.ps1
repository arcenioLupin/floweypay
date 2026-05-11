[CmdletBinding()]
param(
  [string]$Datadir    = "B:\BTC_NODE\bitcoin-data",
  [string]$RepoRoot   = "D:\software-sas\workspace\floweypay",
  [string]$BackupRoot = "B:\BTC_NODE\backups",
  [ValidateSet("all", "config", "wallet")]
  [string]$Mode       = "all",
  # "all" backs up every network directory that exists under $Datadir.
  # Pass a specific value to target only that network.
  [ValidateSet("all", "signet", "mainnet", "regtest", "testnet3")]
  [string]$Network    = "all",
  # When set by an orchestrator, use this path directly as the backup destination
  # instead of computing a new timestamped subdirectory. Retention pruning is
  # skipped because the orchestrator owns the directory lifecycle.
  [string]$OutDir     = "",
  [int]$KeepBackups   = 14,
  [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

$dateStamp = Get-Date -Format "yyyy-MM-dd"
$timeStamp = Get-Date -Format "yyyyMMdd-HHmmss"

if ($OutDir -ne "") {
  $backupDir = $OutDir
  $skipPrune = $true
} else {
  $backupDir = Join-Path $BackupRoot ("$dateStamp-$timeStamp")
  $skipPrune = $false
}

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

  # Map each network name to its wallet directory under $Datadir.
  # Mainnet wallets live at the root level; all other networks use a subdirectory.
  $networkWalletMap = [ordered]@{
    mainnet  = Join-Path $Datadir "wallets"
    signet   = Join-Path $Datadir "signet\wallets"
    regtest  = Join-Path $Datadir "regtest\wallets"
    testnet3 = Join-Path $Datadir "testnet3\wallets"
  }

  $networksToBackup = if ($Network -eq "all") {
    $networkWalletMap.Keys
  } else {
    @($Network)
  }

  $anyWalletFound = $false
  foreach ($net in $networksToBackup) {
    $walletSrc = $networkWalletMap[$net]
    if (-not (Test-Path -LiteralPath $walletSrc)) {
      Write-Host "Skipping $net wallets - not found: $walletSrc"
      continue
    }

    $netOut = Join-Path $walletOut $net
    $anyWalletFound = $true

    if ($WhatIf) {
      Write-Host "[WhatIf] Create directory: $netOut"
      Write-Host "[WhatIf] Copy wallet directory $walletSrc -> $netOut"
    } else {
      New-Item -ItemType Directory -Force -Path $netOut | Out-Null
      Copy-Item -LiteralPath $walletSrc -Destination $netOut -Recurse -Force
      Write-Host "Wallet backed up: [$net]  $walletSrc -> $netOut"
    }
  }

  if (-not $anyWalletFound) {
    Write-Warning "No wallet directories found for network(s): $Network"
    Write-Warning "Checked paths under: $Datadir"
  }
}

if (-not $WhatIf) {
  $metaPath = Join-Path $backupDir "backup-meta.txt"
  $meta = @(
    "timestamp=$(Get-Date -Format o)",
    "mode=$Mode",
    "network=$Network",
    "datadir=$Datadir",
    "repoRoot=$RepoRoot"
  )
  Set-Content -LiteralPath $metaPath -Value $meta
}

# Retention pruning — skipped when $OutDir is provided because the orchestrator
# manages directory lifecycle at the weekly/daily root level.
if (-not $skipPrune) {
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
}

Write-Host "Backup complete. Mode=$Mode Network=$Network Destination=$backupDir"