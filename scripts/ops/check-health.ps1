[CmdletBinding()]
param(
  [string]$PidFile        = "B:\BTC_NODE\run\worker.pid",
  [string]$StatusFile     = "B:\BTC_NODE\run\worker-status.json",
  [int]   $StaleThreshold = 120,
  [string]$WebBaseUrl     = "http://localhost:3000",
  [string]$LogDir         = "B:\BTC_NODE\logs\health"
)

$ErrorActionPreference = "Stop"

$issues   = [System.Collections.Generic.List[string]]::new()
$exitCode = 0

# ── helpers ──────────────────────────────────────────────────────────────────
function Fail([string]$msg) {
  $script:issues.Add($msg)
  $script:exitCode = 1
}

function Ok([string]$msg) {
  Write-Host "  [OK] $msg"
}

# ── 1. Worker process liveness (PID file) ────────────────────────────────────
Write-Host "Checking worker process..."
if (-not (Test-Path -LiteralPath $PidFile)) {
  Fail "WORKER_NOT_RUNNING: pid file not found ($PidFile)"
} else {
  $rawPid = Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  $workerPid = 0
  if (-not $rawPid -or -not [int]::TryParse($rawPid, [ref]$workerPid)) {
    Fail "WORKER_PID_INVALID: cannot parse pid file ($PidFile)"
  } else {
    try {
      $null = Get-Process -Id $workerPid -ErrorAction Stop
      Ok "worker process alive (PID=$workerPid)"
    } catch {
      Fail "WORKER_NOT_ALIVE: process $workerPid not found"
    }
  }
}

# ── 2. Worker heartbeat file ──────────────────────────────────────────────────
Write-Host "Checking worker heartbeat..."
if (-not (Test-Path -LiteralPath $StatusFile)) {
  Fail "HEARTBEAT_MISSING: status file not found ($StatusFile)"
} else {
  try {
    $status = Get-Content -LiteralPath $StatusFile -Raw | ConvertFrom-Json
    $workerTs = [datetime]::Parse(
      $status.ts,
      $null,
      [System.Globalization.DateTimeStyles]::RoundtripKind
    )
    $staleSeconds = [int]([datetime]::UtcNow - $workerTs.ToUniversalTime()).TotalSeconds
    if ($staleSeconds -gt $StaleThreshold) {
      Fail "HEARTBEAT_STALE: last update ${staleSeconds}s ago (threshold=${StaleThreshold}s)"
    } else {
      Ok "heartbeat fresh (${staleSeconds}s ago, watchlistSize=$($status.watchlistSize))"
    }
  } catch {
    Fail "HEARTBEAT_PARSE_ERROR: $($_.Exception.Message)"
  }
}

# ── 3. /api/node/health ───────────────────────────────────────────────────────
Write-Host "Checking /api/node/health..."
try {
  $resp = Invoke-WebRequest -Uri "$WebBaseUrl/api/node/health" `
    -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
  $body = $resp.Content | ConvertFrom-Json
  if (-not $body.ok) {
    Fail "NODE_HEALTH_FAIL: ok=false blockLag=$($body.blockLag) synced=$($body.synced) dbOk=$($body.dbOk)"
  } else {
    Ok "node health (blockLag=$($body.blockLag) synced=$($body.synced) dbOk=$($body.dbOk))"
  }
} catch {
  Fail "NODE_HEALTH_ERROR: $($_.Exception.Message)"
}

# ── 4. /api/worker/status ─────────────────────────────────────────────────────
Write-Host "Checking /api/worker/status..."
try {
  $resp = Invoke-WebRequest -Uri "$WebBaseUrl/api/worker/status" `
    -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
  $body = $resp.Content | ConvertFrom-Json
  if (-not $body.ok) {
    Fail "WORKER_STATUS_FAIL: ok=false staleSeconds=$($body.staleSeconds)"
  } else {
    Ok "worker status (staleSeconds=$($body.staleSeconds) watchlist=$($body.watchlistSize) backlog=$($body.watchlistBacklogLevel))"
  }
} catch {
  Fail "WORKER_STATUS_ERROR: $($_.Exception.Message)"
}

# ── Summary ───────────────────────────────────────────────────────────────────
$ts      = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ" -AsUTC
$result  = if ($issues.Count -eq 0) { "OK" } else { "FAIL" }
$details = if ($issues.Count -eq 0) { "all checks passed" } else { $issues -join "; " }
$summary = "$ts $result - $details"

Write-Host ""
if ($issues.Count -eq 0) {
  Write-Host $summary -ForegroundColor Green
} else {
  Write-Host $summary -ForegroundColor Red
}

# ── Append to daily log ───────────────────────────────────────────────────────
if ($LogDir) {
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $logFile = Join-Path $LogDir "health-$(Get-Date -Format 'yyyyMMdd').log"
  Add-Content -LiteralPath $logFile -Value $summary
}

exit $exitCode
