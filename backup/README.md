# Backups (restic)

Daily, encrypted, off-machine backup of the server's ZFS datasets to a
[rest-server](https://github.com/restic/rest-server) on another machine on the LAN.

**Status:** running daily since 2026-11-05. Restore drill passed 2026-11-11 (see
[Restore drill log](#restore-drill-log)).

```
TrueNAS cron (root, daily)
  └─ backup/restic-backup.sh
       1. read datasets.list  → which datasets to back up, warn about any without a rule
       2. zfs snapshot (ONE command → all datasets frozen at the same instant)
       3. docker run restic   → reads the snapshots read-only, encrypts, sends over HTTPS
       4. trap EXIT           → temporary snapshot is always deleted
                                       │
                                       ▼
              rest-server (other machine) --append-only --private-repos
```

## Why it is built this way

| Decision | Reason |
|---|---|
| restic in a container | TrueNAS can't install packages on the host. The image is pinned by **digest**, so a re-pointed tag can't swap in different code. |
| Back up from a ZFS snapshot | Databases (Immich postgres, PocketBase SQLite) are copied at one consistent instant instead of mid-write. |
| One `zfs snapshot` for all datasets | ZFS makes them atomically, so the Immich database and the photo files always match. |
| Container is a job, not a compose service | It runs and exits. As a service it would restart-loop and show as crashed. |
| Least privilege | `--cap-drop ALL --cap-add DAC_READ_SEARCH` (read any file, nothing else), `no-new-privileges`, all data mounts `:ro`. |
| Secrets in an env file, login not in the URL | Passwords never appear on a command line (`ps`) or in logs. File must be `root` + `600` or the script refuses to run. |
| `--append-only` on the receiving side | The server can add backups but can't delete or overwrite them, so a compromised server can't wipe its own history. Pruning is done **from the receiving machine**. |
| Real dataset list kept off GitHub | It maps the home. Only `datasets.list.example` is in the repo. |

## Files

**In the repo:** `restic-backup.sh`, `restic.env.example`, `datasets.list.example`, this README.

**On the server only**, in `/mnt/SSDs/houseos/backup/` (`root:root`):

| File | Mode | What |
|---|---|---|
| `restic.env` | 600 | repository URL, rest-server login, encryption password |
| `datasets.list` | 600 | the real include / exclude / skip rules |
| `pc-cert.pem` | 644 | the receiving machine's TLS certificate (public, used to verify it) |
| `cache/` | 700 | restic's index cache (created by the script) |
| `logs/` | 700 | one log per day, kept 60 days (created by the script) |

## Usage (on the server, as root)

```bash
cd /mnt/SSDs/houseos/home-server-platform
sudo ./backup/restic-backup.sh plan                 # what WOULD be backed up; changes nothing
sudo ./backup/restic-backup.sh                      # run a backup now
sudo ./backup/restic-backup.sh restic snapshots     # list backups
sudo ./backup/restic-backup.sh restic check         # verify repository structure
sudo ./backup/restic-backup.sh restic ls latest /data/SSDs/houseos   # browse a backup
```

Exit codes: `0` OK · `3` backup made but some files were unreadable · anything else = failed.

## One-time setup

1. Create `restic.env` and `datasets.list` from the examples; `chown root:root`, `chmod 600`.
2. `sudo ./backup/restic-backup.sh plan` → fix every WARNING (add a rule for each dataset).
3. `sudo ./backup/restic-backup.sh restic init` → creates the encrypted repository.
4. First backup by hand: `sudo ./backup/restic-backup.sh`.
5. Check the nested datasets made it in, e.g.
   `sudo ./backup/restic-backup.sh restic ls latest /data/SSDs/Applications/immich/postgres_data | head`
6. TrueNAS → System → Advanced → Cron Jobs: run the script daily as `root`, then press
   **Run Now** once and check the log ends in `backup OK`.
7. **The receiving machine must be awake at run time.** A PC that sleeps or hibernates simply
   doesn't answer ("no route to host"). Either pick a time it's reliably on, or add a scheduled
   task on it that wakes it shortly before the run and keeps it awake until the new snapshot
   arrives (Windows: Task Scheduler "Wake the computer" + `SetThreadExecutionState`).

## Retention (pruning)

The server can't delete (append-only), so old backups are removed **on the receiving
machine**, with direct access to the repository folder:

```
restic -r <repository folder> forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
```

## Restore

Always restore into a **new, empty** location, never over live data. Restoring needs
write access (it sets file owners back), so it doesn't use the restricted `restic` mode.

Pick the snapshot by ID (`restic snapshots`) rather than `latest`, so you know exactly
what you restored:

```bash
sudo zfs create SSDs/restore-test
sudo docker run --rm \
  --env-file /mnt/SSDs/houseos/backup/restic.env \
  -v /mnt/SSDs/houseos/backup/pc-cert.pem:/certs/pc-cert.pem:ro \
  -v /mnt/SSDs/restore-test:/restore \
  restic/restic:0.19.1@sha256:136600b6ff6843d61d355f7f71f460a166429f35de6fd11b568fece3c9a4d510 \
  --cacert /certs/pc-cert.pem \
  restore <snapshot-id> --target /restore \
  --include /data/SSDs/houseos \
  --verify
```

Files land in `/mnt/SSDs/restore-test/data/<dataset>/`. `--verify` reads every restored
file back and compares it with the backup. Add one `--include` per path you need.
(restic's "Restored X / Y files" can show X > Y with `--include`: it also counts the parent
folders it creates. Not an error.)

To put data back: stop the app, copy the restored files over its data folder keeping owners
(`cp -a`), start the app. Then `sudo zfs destroy -r SSDs/restore-test`: the restored copy
includes `backup/restic.env`, and while the dataset exists every backup run warns about it.

> A backup is only proven by a restore. Run a drill after setup, after any change to this
> script, and after an app changes where it stores data.

## Restore drill

A drill proves three things, in order:

1. **The repository can be read and decrypted:** `restic snapshots` lists today's backup.
2. **Files come back exact, with the right owners:** the restore above with `--verify`, then
   `ls -ln` on the restored folders. Owners must be the app's numeric uid (PocketBase `1000`,
   Postgres `999`), not `root`, or the app won't start on them.
3. **The apps accept the restored data:** start each one on the restored copy and compare
   with live. Files that restore fine can still be a database that won't open.

Rules for step 3:

- **`--network none`** on every test container: the copy can't reach Tailscale, push, other
  apps, or the internet, so it can't be mistaken for the real thing.
- **Same image as live, by ID:** `docker inspect <live container> --format '{{.Image}}'`.
  Tags can be re-pointed; Immich's vector indexes need the exact extension version.
- **Same mount point and startup arguments as live:** read them, don't guess:
  `docker inspect <live> --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'`
  and `--format '{{json .Config.Cmd}}'`. A wrong mount makes Postgres start **empty** and
  look healthy.
- **Never print the env with the password:** filter it, e.g. `| grep -E '^(POSTGRES_USER|POSTGRES_DB|PGDATA)='`.

### PocketBase (tickets)

```bash
P=/mnt/SSDs/restore-test/data/SSDs/houseos/data/pb_data
# 1. SQLite's own check + row counts; run the same on live with mode=ro (safe while running)
sudo python3 -c "
import sqlite3,sys; c=sqlite3.connect(sys.argv[1])
print('integrity:', c.execute('pragma integrity_check').fetchone()[0])
for (t,) in c.execute(\"select name from _collections where type != 'view' order by name\"):
    print(' ', t, c.execute(f'select count(*) from \"{t}\"').fetchone()[0])" "$P/data.db"
# 2. Does the real app image accept it? (runs the migrations, too)
sudo docker run -d --rm --name pb-restore-test --network none -v "$P:/pb/pb_data" houseos-pocketbase:<tag>
sudo docker exec pb-restore-test wget -qO- http://127.0.0.1:8090/api/health   # "API is healthy."
sudo docker stop pb-restore-test
```

### Immich Postgres (Postgres 18)

Postgres 18 images mount the volume at **`/var/lib/postgresql`** (not `…/data`) with
`PGDATA=/var/lib/postgresql/18/docker`. The TrueNAS app also passes
`-c config_file=/etc/postgresql/postgresql.conf`, which loads the vector extension.

```bash
sudo docker run -d --rm --name pg-restore-test --network none \
  -v /mnt/SSDs/restore-test/data/SSDs/Applications/immich/postgres_data:/var/lib/postgresql \
  -e PGDATA=/var/lib/postgresql/18/docker \
  -e POSTGRES_USER=immich -e POSTGRES_DB=immich -e POSTGRES_PASSWORD=unused \
  <live image ID> <live Cmd args>
until sudo docker exec pg-restore-test pg_isready -U immich -q; do sleep 2; done
sudo docker logs pg-restore-test 2>&1 | tail -15
```

Expected in the logs: `not properly shut down; automatic recovery in progress` → `redo done`
→ `ready to accept connections`. That is Postgres recovering from the snapshot exactly as
after a power cut ("crash-consistent"). It is the **pass** condition, not an error.

Compare restored vs live with the same query on both (`docker exec … psql -U immich -d immich`).
Count only rows created **before the snapshot time**, or phone uploads made since will look
like data loss: `select count(*) from asset where "createdAt" < '<snapshot time>'`, plus
`album`, `"user"`, and `pg_extension` (names + versions must match).

### From the receiving machine ("the server is dead")

The drill above uses the server's own `restic.env`. The real disaster case has only the
receiving machine, its repository folder, and the **paper copy of the encryption password**.
Test that path too: it is the only test of the paper copy.

Use the same restic version as the server, from the official release, hash-checked against
`SHA256SUMS`, in an admin-only folder (it runs elevated, so a user-writable exe would be a
privilege-escalation path). Then, from an admin shell:

```powershell
restic.exe -r <repository folder> --no-lock --no-cache snapshots
restic.exe -r <repository folder> --no-lock --no-cache `
  restore <snapshot-id> --target C:\restore-test --include /data/SSDs/houseos/data/pb_data --verify
```

`--no-lock --no-cache` keeps restic from writing anything into the repository, whose folder
belongs to the rest-server service account. Check the restored `data.db` with the same
integrity + count script as above (WSL sees `C:` as `/mnt/c`), then delete `C:\restore-test`
(it holds user password hashes).

**Windows does not keep Linux owners.** When rebuilding a server from this copy, fix them
before starting the apps: `chown -R 1000:1000 pb_data`, `chown -R 999:999` for Postgres data.

### Restore drill log

| Date | Snapshot | Restored | Result |
|---|---|---|---|
| 2026-11-11 | `6c2edd73` | `SSDs/houseos`, Immich `postgres_data` (537 MiB, 2,228 files verified) | ✅ PocketBase: integrity ok, all 10 tables = live, v4 image healthy. ✅ Immich DB: crash recovery clean, extensions = live. ⚠️ Immich had 0 assets, so photo data not yet proven; re-drill once in use. |
| 2026-11-11 | `6c2edd73` | From the receiving machine, offline: `pb_data` (232 MiB, 27 files verified) | ✅ Repository opened with the stored encryption password; integrity ok, all 10 tables = live. |

## Upgrading restic

1. On the server: `sudo docker pull restic/restic:<new version>`, then
   `sudo docker image inspect --format '{{index .RepoDigests 0}}' restic/restic:<new version>`.
2. Read the restic release notes for breaking changes.
3. Update `RESTIC_IMAGE` in `restic-backup.sh` (and the restore example above) in a PR.

## Known limits

- Encrypted datasets that are locked can't be backed up; the script warns.
- Snapshots give *crash-consistent* databases (like after a power cut). Postgres and SQLite
  recover from that by design; app-native dumps (PocketBase backups, Immich DB dumps) are a
  second layer.
- **Dataset names containing spaces** can't get a rule yet (the parser splits at the space),
  so they warn on every run and are not backed up. Fix pending in the script.
- **Failures before the log file opens** (missing env file, bad permissions, lock held) print
  to stdout, which the cron job hides: no log entry. Fix pending (`die()` → stderr). Until then,
  a day with *no* log file is a failure too.
- Ransomware with admin rights on the receiving machine could still reach its disk. An
  offline or off-site third copy is planned.
