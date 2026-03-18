[CmdletBinding()]
param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"

# Use scripts as single source of truth
.\scripts\ops\stop-worker.ps1 -Force:$Force.IsPresent
Start-Sleep -Seconds 1
.\scripts\ops\start-worker.ps1 -ForceRestart