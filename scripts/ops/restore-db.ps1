[CmdletBinding()]
param(
  # Path to the .dump file on the host to validate.
  [Parameter(Mandatory)]
  [string]$DumpFile,
  [string]$ContainerName = "floweypay_db",
  [string]$DbUser        = "floweypay",
  [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

$TestDb        = "floweypay_restore_test"
$containerDump = "/tmp/restore-validate.dump"

if ($WhatIf) {
  Write-Host "[WhatIf] docker cp $DumpFile -> ${ContainerName}:$containerDump"
  Write-Host "[WhatIf] psql: DROP DATABASE IF EXISTS $TestDb"
  Write-Host "[WhatIf] createdb -U $DbUser $TestDb"
  Write-Host "[WhatIf] pg_restore -U $DbUser -d $TestDb --no-owner $containerDump"
  Write-Host "[WhatIf] psql: SELECT COUNT(*) FROM payments"
  Write-Host "[WhatIf] dropdb -U $DbUser $TestDb"
  Write-Host "[WhatIf] docker exec $ContainerName rm -f $containerDump"
  return
}

if (-not (Test-Path -LiteralPath $DumpFile)) {
  throw "Dump file not found: $DumpFile"
}

Write-Host "Restore validation started."
Write-Host "  Dump  : $DumpFile"
Write-Host "  Target: $TestDb (temporary - will be dropped)"

# ---- Copy dump file into container ------------------------------------------
Write-Host "Copying dump to container..."
docker cp $DumpFile "${ContainerName}:${containerDump}"
if ($LASTEXITCODE -ne 0) { throw "docker cp to container failed (exit $LASTEXITCODE)" }

# ---- Drop test DB if it exists from a previous failed run -------------------
docker exec $ContainerName psql -U $DbUser -d postgres `
  -c "DROP DATABASE IF EXISTS $TestDb" | Out-Null

# ---- Create fresh test DB ---------------------------------------------------
Write-Host "Creating test database: $TestDb"
docker exec $ContainerName createdb -U $DbUser $TestDb
if ($LASTEXITCODE -ne 0) { throw "createdb failed (exit $LASTEXITCODE)" }

# ---- Restore ----------------------------------------------------------------
Write-Host "Running pg_restore..."
docker exec $ContainerName pg_restore -U $DbUser -d $TestDb --no-owner $containerDump
# pg_restore exits 1 for non-fatal warnings (missing roles, etc.), 3+ for errors.
$restoreExit = $LASTEXITCODE
if ($restoreExit -gt 1) {
  throw "pg_restore failed with exit code $restoreExit"
}
if ($restoreExit -eq 1) {
  Write-Warning "pg_restore completed with warnings (exit 1) - continuing validation"
}

# ---- Smoke query ------------------------------------------------------------
Write-Host "Running smoke query: SELECT COUNT(*) FROM payments"
$countRaw = docker exec $ContainerName psql -U $DbUser -d $TestDb -t -A `
  -c "SELECT COUNT(*) FROM payments;"
if ($LASTEXITCODE -ne 0) { throw "Smoke query failed (exit $LASTEXITCODE)" }
$count = $countRaw.Trim()
Write-Host "Smoke query OK: payments row count = $count"

# ---- Drop test DB -----------------------------------------------------------
Write-Host "Dropping test database: $TestDb"
docker exec $ContainerName dropdb -U $DbUser $TestDb
if ($LASTEXITCODE -ne 0) {
  Write-Warning "dropdb failed - manual cleanup required: $TestDb"
}

# ---- Clean up dump inside container -----------------------------------------
docker exec $ContainerName rm -f $containerDump 2>$null

Write-Host "Restore validation complete: OK (payments=$count)"
