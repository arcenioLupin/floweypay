# Node Operations (Windows) - Bitcoin Core + FloweyPay Worker

This runbook covers Windows operations for Bitcoin Core and the FloweyPay worker in this repo.

## Scope and defaults

- Datadir: `B:\BTC_NODE\bitcoin-data`
- Default network for operations here: `signet`
- RPC bind target: `127.0.0.1`
- Worker defaults:
  - `BTC_NETWORK=signet`
  - `BTC_ZMQ_RAWTX=tcp://127.0.0.1:28334`
  - `BTC_ZMQ_RAWBLOCK=tcp://127.0.0.1:28335`
  - `BTC_RPC_URL=http://127.0.0.1:38332`

Do not commit secrets. Use placeholders such as `***` in any shared file.

## 1) Auto-start on Windows (Task Scheduler)

Recommendation: use `bitcoind.exe` for headless stability in production-like operation.
Fallback: `bitcoin-qt.exe` is acceptable when `bitcoind.exe` is not available.

### A. Auto-start Bitcoin Core with bitcoind (recommended)

1. Open Task Scheduler -> Create Task (not Basic Task).
2. General tab:
   - Name: `FloweyPay Bitcoin Core (signet)`
   - Select: `Run whether user is logged on or not`
   - Select: `Run with highest privileges`
   - Configure for: your Windows version
3. Triggers tab:
   - New -> Begin the task: `At startup`
   - Optional second trigger: `At log on` (for resilience on desktop sessions)
4. Actions tab -> New:
   - Action: `Start a program`
   - Program/script:
     `C:\Program Files\Bitcoin\daemon\bitcoind.exe`
   - Add arguments:
     `-datadir=B:\BTC_NODE\bitcoin-data -signet`
   - Start in:
     `C:\Program Files\Bitcoin\daemon`
5. Conditions tab:
   - Recommended: uncheck `Start the task only if the computer is on AC power` for always-on hosts.
6. Settings tab:
   - Check `Allow task to be run on demand`
   - Check `Run task as soon as possible after a scheduled start is missed`
   - If task fails, restart every `1 minute`, attempt `3` times
7. Save task and enter credentials when prompted.

Stop/restart examples:

```powershell
# Graceful stop
bitcoin-cli -signet -datadir="B:\BTC_NODE\bitcoin-data" stop

# Force stop only if needed
Stop-Process -Name bitcoind -Force

# Start task manually
schtasks /Run /TN "FloweyPay Bitcoin Core (signet)"
```

### B. Auto-start Bitcoin Core with bitcoin-qt (fallback)

Use the same Task Scheduler pattern above, but action values:

- Program/script:
  `C:\Program Files\Bitcoin\bitcoin-qt.exe`
- Add arguments:
  `-datadir=B:\BTC_NODE\bitcoin-data -signet -min`
- Start in:
  `C:\Program Files\Bitcoin`

Notes:
- `bitcoin-qt` is GUI-based and less ideal for unattended servers.
- Prefer `bitcoind` for service-like behavior.

### C. Optional: Auto-start FloweyPay worker with PowerShell script

Script in repo: `scripts/ops/start-worker.ps1`

1. Create Task -> General tab:
   - Name: `FloweyPay Worker`
   - `Run whether user is logged on or not`
   - `Run with highest privileges`
2. Trigger:
   - `At startup` (or `At log on` for local desktop workflow)
3. Action:
   - Program/script:
     `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`
   - Add arguments:
     `-NoProfile -ExecutionPolicy Bypass -File "D:\software-sas\workspace\floweypay\scripts\ops\start-worker.ps1" -RepoRoot "D:\software-sas\workspace\floweypay" -WorkerDir "D:\software-sas\workspace\floweypay\apps\worker" -LogDir "B:\BTC_NODE\logs\worker" -PidFile "B:\BTC_NODE\run\worker.pid" -EnvFile "B:\BTC_NODE\config\worker.env.ps1"`
   - Start in:
     `D:\software-sas\workspace\floweypay`
4. Settings (recommended):
   - Allow task to be run on demand
   - Run task as soon as possible after a missed start
   - If task fails, restart every 1 minute, up to 3 attempts

Worker stop/restart:

```powershell
# Stop worker by PID file
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\software-sas\workspace\floweypay\scripts\ops\stop-worker.ps1" -PidFile "B:\BTC_NODE\run\worker.pid" -Force

# Restart worker
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\software-sas\workspace\floweypay\scripts\ops\restart-worker.ps1" -RepoRoot "D:\software-sas\workspace\floweypay" -WorkerDir "D:\software-sas\workspace\floweypay\apps\worker"

# Start worker task manually
schtasks /Run /TN "FloweyPay Worker"
```

Optional environment file for scheduler runs: `B:\BTC_NODE\config\worker.env.ps1`

```powershell
$env:BTC_NETWORK = "signet"
$env:BTC_ZMQ_RAWTX = "tcp://127.0.0.1:28334"
$env:BTC_ZMQ_RAWBLOCK = "tcp://127.0.0.1:28335"
$env:BTC_RPC_URL = "http://127.0.0.1:38332"
$env:BTC_RPC_USER = "floweypay"
$env:BTC_RPC_PASSWORD = "***"
$env:DATABASE_URL = "postgresql://floweypay:***@localhost:5433/floweypay?schema=public"
```

## 2) Log rotation

### Bitcoin Core debug.log (copy + zip + prune)

Script: `scripts/ops/rotate-bitcoin-logs.ps1`

Behavior:
- Copies `debug.log` to a timestamped file.
- Compresses that copy into zip archive.
- Deletes old zip archives by age.
- Does not rename or truncate live `debug.log`.

Examples:

```powershell
# Dry run
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\software-sas\workspace\floweypay\scripts\ops\rotate-bitcoin-logs.ps1" -Datadir "B:\BTC_NODE\bitcoin-data" -ArchiveDir "B:\BTC_NODE\logs\bitcoin" -KeepDays 14 -WhatIf

# Run
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\software-sas\workspace\floweypay\scripts\ops\rotate-bitcoin-logs.ps1" -Datadir "B:\BTC_NODE\bitcoin-data" -ArchiveDir "B:\BTC_NODE\logs\bitcoin" -KeepDays 14
```

Suggested schedule: daily (for example 02:15 local).

### Worker logs (native PowerShell approach)

Scripts:
- `scripts/ops/start-worker.ps1` (redirects stdout/stderr to files)
- `scripts/ops/rotate-worker-logs.ps1` (zip + prune)

Examples:

```powershell
# Rotate worker logs
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\software-sas\workspace\floweypay\scripts\ops\rotate-worker-logs.ps1" -LogDir "B:\BTC_NODE\logs\worker" -ArchiveDir "B:\BTC_NODE\logs\worker\archive" -KeepDays 14
```

Alternative: PM2 is possible on Windows, but this runbook keeps dependencies minimal with native PowerShell.

## 3) Backups

### Overview

| Script | Purpose | Run as |
|---|---|---|
| `scripts/ops/backup-node-assets.ps1` | Wallets (per-network) + node config | Weekly (via orchestrator) or manual |
| `scripts/ops/backup-db.ps1` | PostgreSQL dump via `docker exec` | Weekly + optional daily |
| `scripts/ops/restore-db.ps1` | Restore validation into temp DB | Automatic after each weekly backup |
| `scripts/ops/backup-weekly.ps1` | Orchestrator: runs all three above | Scheduled weekly (Sunday 02:00) |
| `scripts/ops/backup-daily.ps1` | DB-only daily backup (optional) | Scheduled Mon-Sat 02:00 (optional) |

Restore and wallet recovery procedures: see `docs/ops/backup-restore-runbook.md`.

### Backup folder structure

```
B:\BTC_NODE\backups\
  weekly\
    <YYYYMMDD-HHMMSS>\        <- one directory per weekly run
      config\
        bitcoin.conf
        .env.example
        web.env.example
      wallets\
        signet\               <- per-network, only networks that exist are included
          floweypay-signet\
        mainnet\              <- present only when mainnet wallets directory exists
      db\
        floweypay-<timestamp>.dump
      backup-meta.txt
  daily\
    <YYYYMMDD-HHMMSS>\        <- DB only
      db\
        floweypay-<timestamp>.dump
```

Retention: weekly keeps 8 directories (~2 months). Daily keeps 7 directories (~1 week).

### backup-node-assets.ps1

Backs up `bitcoin.conf`, repo `.env.example` templates (never live secret files), and wallet
directories by network. Each active network gets its own subdirectory under `wallets\<network>\`.

New parameters (Day 34):

- `-Network` — `all` | `signet` | `mainnet` | `regtest` | `testnet3` (default `all`)
- `-OutDir` — when set by an orchestrator, use this path directly (skips retention pruning)

```powershell
# Standalone: full backup, all networks
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\software-sas\workspace\floweypay\scripts\ops\backup-node-assets.ps1" `
  -Datadir "B:\BTC_NODE\bitcoin-data" -RepoRoot "D:\software-sas\workspace\floweypay" `
  -BackupRoot "B:\BTC_NODE\backups" -Mode all -KeepBackups 14

# Signet wallets only
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\software-sas\workspace\floweypay\scripts\ops\backup-node-assets.ps1" `
  -Datadir "B:\BTC_NODE\bitcoin-data" -BackupRoot "B:\BTC_NODE\backups" `
  -Mode wallet -Network signet -KeepBackups 14
```

### backup-db.ps1

Runs `pg_dump -Fc` inside the `floweypay_db` Docker container (Unix socket — no password
needed), copies the dump to the host, validates non-zero size.

```powershell
# Standalone DB backup
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\software-sas\workspace\floweypay\scripts\ops\backup-db.ps1" `
  -BackupDir "B:\BTC_NODE\backups\db" -KeepBackups 8
```

### restore-db.ps1

Restores a `.dump` file into `floweypay_restore_test` (never touches the live DB), runs
`SELECT COUNT(*) FROM payments` as a smoke test, then drops the test database.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\software-sas\workspace\floweypay\scripts\ops\restore-db.ps1" `
  -DumpFile "B:\BTC_NODE\backups\weekly\<timestamp>\db\floweypay-<timestamp>.dump"
```

### backup-weekly.ps1 (recommended schedule)

Orchestrates all three steps in order: node assets -> DB dump -> restore validation.
Writes a log to `B:\BTC_NODE\logs\backup\weekly-<date>.log`. Exits non-zero if any step fails.

```powershell
# Manual run
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\software-sas\workspace\floweypay\scripts\ops\backup-weekly.ps1"

# Dry run
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\software-sas\workspace\floweypay\scripts\ops\backup-weekly.ps1" -WhatIf
```

Task Scheduler setup (weekly, Sunday 02:00):

1. Open Task Scheduler -> Create Task (not Basic Task).
2. General tab:
   - Name: `FloweyPay Weekly Backup`
   - `Run whether user is logged on or not`
   - `Run with highest privileges`
3. Triggers tab:
   - New -> Weekly -> Sunday -> 02:00
   - Check `Stop task if it runs longer than: 2 hours`
4. Actions tab:
   - Program/script: `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`
   - Add arguments:
     `-NoProfile -ExecutionPolicy Bypass -File "D:\software-sas\workspace\floweypay\scripts\ops\backup-weekly.ps1"`
   - Start in: `D:\software-sas\workspace\floweypay`
5. Settings tab:
   - `Run task as soon as possible after a scheduled start is missed`

### backup-daily.ps1 (optional)

DB-only backup. Keeps 7 daily directories. Does not include wallet files or node config.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\software-sas\workspace\floweypay\scripts\ops\backup-daily.ps1"
```

Schedule with Task Scheduler (daily Mon-Sat 02:00) using the same pattern as weekly above,
but trigger: Daily at 02:00, then in Advanced Settings set repeat or use multiple triggers
excluding Sunday (which runs the full weekly instead).

### Wallet backup timing and safety

Wallet files (`B:\BTC_NODE\bitcoin-data\signet\wallets\floweypay-signet\`) are copied at the
filesystem level. For maximum safety stop the node before the copy:

```powershell
bitcoin-cli -signet -datadir="B:\BTC_NODE\bitcoin-data" stop
# run backup
schtasks /Run /TN "FloweyPay Bitcoin Core (signet)"
```

For signet/dev use the live filesystem copy is acceptable. For mainnet, stop the node first
or use the `backupwallet` RPC:

```powershell
bitcoin-cli -signet -datadir="B:\BTC_NODE\bitcoin-data" backupwallet "B:\BTC_NODE\backups\manual\floweypay-signet.bak"
```

### Security and offsite reminder

- Never commit wallet files, secrets, or private keys to git.
- Keep wallet backups access-controlled (not world-readable).
- `.env.local` and live secret files are **not** included in any backup script by design.
- `B:\BTC_NODE\backups\` is on the same host as the live data. A single disk failure loses
  both. Schedule a periodic robocopy or rclone job to copy the `backups\` tree to an
  external drive or remote storage.

## 4) Observability and health checks

### Worker heartbeat file

The worker writes a JSON status file every 30 seconds:

```
B:\BTC_NODE\run\worker-status.json
```

Fields:
- `ts` — ISO timestamp of the last write
- `pid` — worker process ID
- `watchlistSize` — number of addresses currently watched
- `lastRawTxAt` — timestamp of the last received `rawtx` ZMQ message (null if none since boot)
- `lastRawBlockAt` — timestamp of the last received `rawblock` ZMQ message (null if none since boot)
- `lastBlockHeight` — most recently processed block height (null if no block processed yet)

Configure the path via `WORKER_STATUS_FILE` in both the worker and web environments.
Default: `B:\BTC_NODE\run\worker-status.json`

### Health endpoints (internal)

| Endpoint | Description |
|---|---|
| `GET /api/node/health` | bitcoind RPC health: chain, block lag, sync status, DB reachability |
| `GET /api/worker/status` | Worker liveness: reads heartbeat file, reports staleness, watchlist size |

Both endpoints are internal. Do not expose them publicly without an access guard.

`/api/node/health` response fields:
- `ok` — overall health boolean
- `blockLag` — `headers - blocks` (> 2 indicates the node is catching up)
- `synced` — `true` when not in IBD and `blockLag <= 2`
- `dbOk` — PostgreSQL reachability

### check-health.ps1

Script: `scripts/ops/check-health.ps1`

Runs four checks in sequence: worker PID, heartbeat freshness, `/api/node/health`, `/api/worker/status`.
Exits with code 0 on success, 1 on any failure. Appends a one-line result to a daily log file.

```powershell
# Manual run
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\software-sas\workspace\floweypay\scripts\ops\check-health.ps1" `
  -WebBaseUrl "http://localhost:3000" `
  -LogDir "B:\BTC_NODE\logs\health"

# Scheduled via Task Scheduler (every 5 minutes is sufficient for MVP)
# Action → Start a program:
#   powershell.exe
#   -NoProfile -ExecutionPolicy Bypass -File "...\check-health.ps1" -WebBaseUrl "http://localhost:3000"
```

Parameters:
- `-PidFile` — path to worker PID file (default: `B:\BTC_NODE\run\worker.pid`)
- `-StatusFile` — path to worker heartbeat JSON (default: `B:\BTC_NODE\run\worker-status.json`)
- `-StaleThreshold` — seconds before heartbeat is considered stale (default: 120)
- `-WebBaseUrl` — base URL for the web app (default: `http://localhost:3000`)
- `-LogDir` — where to write daily health logs (default: `B:\BTC_NODE\logs\health`)

### FX provider failures

Provider errors and cache-fallback events are logged to stderr with `[fxrate]` prefix:
- `[fxrate] provider unavailable, serving stale cache:` — provider rejected, cache used
- `[fxrate] provider unavailable, no cache fallback:` — provider rejected, no cache → invoice creation fails
- `[fxrate] provider error, serving stale cache:` — unexpected error, cache used
- `[fxrate] provider error, no cache fallback:` — unexpected error, no cache → invoice creation fails

These appear in the web process logs (Next.js server stdout/stderr).

## 5) Troubleshooting checklist (RPC / ZMQ)

Use this symptom -> likely cause -> fix checklist.

### A. RPC authentication errors (401 / forbidden / auth failed)

Likely cause:
- Wrong `BTC_RPC_USER`/`BTC_RPC_PASSWORD`
- `bitcoin.conf` credentials do not match worker env

Fix:
- Verify worker env values (use placeholders in docs only).
- Ensure `BTC_RPC_URL` points to the correct network RPC port.
- Restart worker after environment updates.

### B. RPC connection refused / timeout

Likely cause:
- Bitcoin node not running
- Wrong RPC port for selected network
- RPC bound to different interface

Fix:
- Check node process:
  `Get-Process bitcoind -ErrorAction SilentlyContinue`
- Check listener ports:
  `netstat -ano | findstr ":8332 :18443 :38332"`
- Validate rpcbind/rpcallowip and network mode in `bitcoin.conf`.

### C. Network mismatch (worker signet vs node main/regtest)

Likely cause:
- `BTC_NETWORK` and `BTC_RPC_URL`/ZMQ ports are not aligned.

Fix:
- For signet, use:
  - RPC `http://127.0.0.1:38332`
  - rawtx `tcp://127.0.0.1:28334`
  - rawblock `tcp://127.0.0.1:28335`
- Restart worker after changes.

### D. ZMQ not receiving messages

Likely cause:
- Missing ZMQ publish settings in node config
- Wrong worker ZMQ endpoint
- Firewall/policy blocking localhost ports

Fix:
- Confirm node notifications:
  `bitcoin-cli -signet -datadir="B:\BTC_NODE\bitcoin-data" getzmqnotifications`
- Confirm ports listening:
  `netstat -ano | findstr ":28334 :28335"`
- Run worker smoke tests from repo root:

```powershell
# rawtx
$env:BTC_ZMQ_RAWTX="tcp://127.0.0.1:28334"; npm exec -w @floweypay/worker tsx src/zmq_smoke.ts

# rawblock
$env:BTC_ZMQ_RAWBLOCK="tcp://127.0.0.1:28335"; npm exec -w @floweypay/worker tsx src/zmq_smoke_block.ts
```

### E. Wallet not found / wallet RPC errors

Likely cause:
- Wallet not loaded in the active node/network context

Fix:
- List loaded wallets:
  `bitcoin-cli -signet -datadir="B:\BTC_NODE\bitcoin-data" listwallets`
- Load a wallet:
  `bitcoin-cli -signet -datadir="B:\BTC_NODE\bitcoin-data" loadwallet "<wallet_name>"`

### F. Quick node health checks

```powershell
bitcoin-cli -signet -datadir="B:\BTC_NODE\bitcoin-data" getblockchaininfo
bitcoin-cli -signet -datadir="B:\BTC_NODE\bitcoin-data" getnetworkinfo
bitcoin-cli -signet -datadir="B:\BTC_NODE\bitcoin-data" getzmqnotifications
```

If these pass and worker still fails, restart worker and inspect latest log files under `B:\BTC_NODE\logs\worker`.
