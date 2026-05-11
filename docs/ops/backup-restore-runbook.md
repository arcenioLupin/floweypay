# Backup & Restore Runbook — FloweyPay (Windows / Single Host)

This runbook covers restore procedures and operational conventions for the automated
backup strategy introduced in Week 8 / Day 34. For the backup scripts themselves,
see `docs/ops/node-operations.md` section 3.

---

## 1. Backup directory structure

```
B:\BTC_NODE\backups\
  weekly\
    <YYYYMMDD-HHMMSS>\
      config\
        bitcoin.conf
        .env.example          <- root repo template (no secrets)
        web.env.example       <- apps/web template (no secrets)
      wallets\
        signet\               <- present when B:\BTC_NODE\bitcoin-data\signet\wallets\ exists
          floweypay-signet\
        mainnet\              <- present when mainnet wallets\ exists
      db\
        floweypay-<YYYYMMDD-HHMMSS>.dump   <- pg_dump custom format (-Fc)
      backup-meta.txt         <- timestamp, mode, network, datadir, repoRoot
  daily\
    <YYYYMMDD-HHMMSS>\
      db\
        floweypay-<YYYYMMDD-HHMMSS>.dump
```

## 2. Retention policy

| Tier   | Scope               | Keep | Script             |
|--------|---------------------|------|--------------------|
| Weekly | wallets + config + DB | 8 dirs (~2 months) | `backup-weekly.ps1` |
| Daily  | DB only             | 7 dirs (~1 week)   | `backup-daily.ps1`  |

Pruning is automatic at the end of each orchestrator run. Oldest directories are deleted first.

## 3. Restore: PostgreSQL database

### Automated restore validation (runs after every weekly backup)

`backup-weekly.ps1` automatically calls `restore-db.ps1` on the new dump.
The restore test targets `floweypay_restore_test` — the live `floweypay` database is never touched.

### Manual full restore (disaster recovery)

Use this when you need to restore the live database from a backup.

**Prerequisites:**
- Docker is running
- `floweypay_db` container is running (`docker ps` to verify)
- You have the dump file path (example: `B:\BTC_NODE\backups\weekly\20260504-020000\db\floweypay-20260504-020000.dump`)

**Steps:**

1. Stop the web app and worker to prevent writes during restore:
   ```powershell
   # Stop web app (Ctrl+C in its terminal, or stop the PM2/Task Scheduler task)
   # Stop worker
   powershell -NoProfile -ExecutionPolicy Bypass -File "D:\software-sas\workspace\floweypay\scripts\ops\stop-worker.ps1" -PidFile "B:\BTC_NODE\run\worker.pid" -Force
   ```

2. Copy the dump into the container:
   ```powershell
   docker cp "B:\BTC_NODE\backups\weekly\<timestamp>\db\floweypay-<timestamp>.dump" floweypay_db:/tmp/restore.dump
   ```

3. Drop and recreate the live database:
   ```powershell
   docker exec floweypay_db psql -U floweypay -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'floweypay' AND pid <> pg_backend_pid();"
   docker exec floweypay_db psql -U floweypay -d postgres -c "DROP DATABASE floweypay;"
   docker exec floweypay_db createdb -U floweypay floweypay
   ```

4. Restore from dump:
   ```powershell
   docker exec floweypay_db pg_restore -U floweypay -d floweypay --no-owner /tmp/restore.dump
   ```
   Exit code 1 (warnings about roles) is acceptable. Exit code > 1 is a failure.

5. Verify row counts:
   ```powershell
   docker exec floweypay_db psql -U floweypay -d floweypay -c "SELECT COUNT(*) FROM payments; SELECT COUNT(*) FROM products; SELECT COUNT(*) FROM users;"
   ```

6. Clean up:
   ```powershell
   docker exec floweypay_db rm -f /tmp/restore.dump
   ```

7. Restart worker and web app.

**Expected outcome:** payments, products, users rows match the counts at backup time.

---

## 4. Restore: BTC wallet (signet)

> Wallet restore is a manual procedure. Do not attempt automated live wallet replacement.
> For signet, wallet loss means losing test funds only. For mainnet, wallet loss is permanent.

### When to restore a signet wallet

- Host rebuild / disk failure and the wallet directory is missing
- Accidental wallet deletion
- Testing a wallet backup (do this on a separate machine or after stopping the node)

### Prerequisites

- Bitcoin Core is stopped:
  ```powershell
  bitcoin-cli -signet -datadir="B:\BTC_NODE\bitcoin-data" stop
  ```
- You have a backup of the wallet directory (example: `B:\BTC_NODE\backups\weekly\<timestamp>\wallets\signet\wallets\floweypay-signet\`)

### Steps

1. Confirm node is stopped:
   ```powershell
   Get-Process bitcoind -ErrorAction SilentlyContinue
   ```
   No output = stopped.

2. Remove or rename the current (broken) wallet directory if it exists:
   ```powershell
   Rename-Item "B:\BTC_NODE\bitcoin-data\signet\wallets\floweypay-signet" `
               "B:\BTC_NODE\bitcoin-data\signet\wallets\floweypay-signet.bak"
   ```

3. Copy the backed-up wallet into place:
   ```powershell
   Copy-Item -Recurse `
     "B:\BTC_NODE\backups\weekly\<timestamp>\wallets\signet\wallets\floweypay-signet" `
     "B:\BTC_NODE\bitcoin-data\signet\wallets\floweypay-signet"
   ```

4. Start Bitcoin Core:
   ```powershell
   schtasks /Run /TN "FloweyPay Bitcoin Core (signet)"
   ```

5. Wait ~10 seconds, then load and verify the wallet:
   ```powershell
   bitcoin-cli -signet -datadir="B:\BTC_NODE\bitcoin-data" loadwallet floweypay-signet
   bitcoin-cli -signet -datadir="B:\BTC_NODE\bitcoin-data" getwalletinfo
   bitcoin-cli -signet -datadir="B:\BTC_NODE\bitcoin-data" getnewaddress
   ```

6. Confirm `getwalletinfo` returns `"walletname": "floweypay-signet"` with no error.

**Note on mainnet:** The same procedure applies but wallet loss is irreversible. Always keep
an encrypted offline copy of mainnet wallets before any restore attempt.

---

## 5. Restore validation — what counts as passing

| Check | Pass condition |
|---|---|
| DB restore (automated) | `restore-db.ps1` exits 0, smoke query returns a number |
| DB restore (manual) | Row counts for payments/products/users match pre-restore counts |
| Wallet restore | `getwalletinfo` returns wallet name, `getnewaddress` returns valid address |

---

## 6. Offsite copy reminder

`B:\BTC_NODE\backups\` lives on the same physical host as the live data. A disk failure
destroys both. Periodically copy the backups tree to an external or remote location:

```powershell
# Example: robocopy to an external drive (E:)
robocopy "B:\BTC_NODE\backups" "E:\floweypay-offsite\backups" /MIR /R:2 /W:5

# Example: rclone to cloud (configure rclone remote first)
# rclone sync "B:\BTC_NODE\backups" remote:floweypay-backups
```

Suggested frequency: after each weekly backup run (can be added as step 5 in `backup-weekly.ps1`).

---

## 7. Quick reference — backup paths by tier

| What | Tier | Host path |
|---|---|---|
| Weekly wallets (signet) | Weekly | `B:\BTC_NODE\backups\weekly\<ts>\wallets\signet\wallets\floweypay-signet\` |
| Weekly DB dump | Weekly | `B:\BTC_NODE\backups\weekly\<ts>\db\floweypay-<ts>.dump` |
| Weekly bitcoin.conf | Weekly | `B:\BTC_NODE\backups\weekly\<ts>\config\bitcoin.conf` |
| Daily DB dump | Daily | `B:\BTC_NODE\backups\daily\<ts>\db\floweypay-<ts>.dump` |
| Backup run logs | Both | `B:\BTC_NODE\logs\backup\weekly-<date>.log` / `daily-<date>.log` |
