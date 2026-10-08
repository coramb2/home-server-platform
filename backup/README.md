# Backups (restic)

Nightly, encrypted, off-machine backup of the server's ZFS datasets to a
[rest-server](https://github.com/restic/rest-server) on another machine on the LAN.

```
TrueNAS cron (root, nightly)
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
6. TrueNAS → System → Advanced → Cron Jobs: run the script nightly as `root`.

## Retention (pruning)

The server can't delete (append-only), so old backups are removed **on the receiving
machine**, with direct access to the repository folder:

```
restic -r <repository folder> forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
```

## Restore

Always restore into a **new, empty** location, never over live data. Restoring needs
write access, so it doesn't use the restricted `restic` mode:

```bash
sudo zfs create SSDs/restore-test
sudo docker run --rm \
  --env-file /mnt/SSDs/houseos/backup/restic.env \
  -v /mnt/SSDs/houseos/backup/pc-cert.pem:/certs/pc-cert.pem:ro \
  -v /mnt/SSDs/restore-test:/restore \
  restic/restic:0.19.1@sha256:136600b6ff6843d61d355f7f71f460a166429f35de6fd11b568fece3c9a4d510 \
  --cacert /certs/pc-cert.pem \
  restore latest --target /restore --include /data/SSDs/houseos
```

Files land in `/mnt/SSDs/restore-test/data/SSDs/houseos/`. Compare, copy back what's
needed with the app stopped, then `sudo zfs destroy SSDs/restore-test`.

> A backup is only proven by a restore. Run a restore drill after setup and after any
> change to this script.

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
- Ransomware with admin rights on the receiving machine could still reach its disk. An
  offline or off-site third copy is planned.
