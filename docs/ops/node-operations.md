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

## 3) Backups (config/templates vs wallets)

Script: `scripts/ops/backup-node-assets.ps1`

Modes:
- `config`: backups of `bitcoin.conf` and repo templates (`.env.example`, `apps/web/.env.example`)
- `wallet`: backups of `wallets/`
- `all`: both

Destination format:
- `B:\BTC_NODE\backups\YYYY-MM-DD-YYYYMMDD-HHMMSS`

Retention:
- `-KeepBackups N` keeps newest `N` backup directories, prunes older ones.

Examples:

```powershell
# Config/templates only
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\software-sas\workspace\floweypay\scripts\ops\backup-node-assets.ps1" -Datadir "B:\BTC_NODE\bitcoin-data" -RepoRoot "D:\software-sas\workspace\floweypay" -BackupRoot "B:\BTC_NODE\backups" -Mode config -KeepBackups 14

# Wallets only
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\software-sas\workspace\floweypay\scripts\ops\backup-node-assets.ps1" -Datadir "B:\BTC_NODE\bitcoin-data" -BackupRoot "B:\BTC_NODE\backups" -Mode wallet -KeepBackups 14

# Full backup
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\software-sas\workspace\floweypay\scripts\ops\backup-node-assets.ps1" -Datadir "B:\BTC_NODE\bitcoin-data" -RepoRoot "D:\software-sas\workspace\floweypay" -BackupRoot "B:\BTC_NODE\backups" -Mode all -KeepBackups 14
```

### Wallet backup timing and safety

Wallet data is sensitive and consistency matters.

Preferred options:
1. Stop node before filesystem wallet copy:
   - `bitcoin-cli -signet -datadir="B:\BTC_NODE\bitcoin-data" stop`
   - Run wallet backup mode
   - Start node again
2. Use wallet RPC backup flow while node is running:
   - Load wallet(s) first if needed
   - Run `backupwallet` per wallet to a secure backup location

Security warnings:
- Never commit wallet files, secrets, or private keys to git.
- Keep wallet backups encrypted and access-controlled.
- Store at least one offline/offsite copy.
- Test restore procedures periodically in a safe environment.

## 4) Troubleshooting checklist (RPC / ZMQ)

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
