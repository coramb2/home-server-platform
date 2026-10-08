#!/usr/bin/env bash
# restic-backup.sh - nightly encrypted backup of Gaia's ZFS datasets to the PC.
#
# Runs on the TrueNAS host as root (TrueNAS cron job). It:
#   1. reads which datasets to back up from datasets.list
#   2. takes ONE atomic ZFS snapshot of all of them (consistent point in time)
#   3. runs restic in a throwaway container that reads the snapshot (read-only)
#   4. always deletes the temporary snapshot, even if the backup fails
#
# Usage:
#   restic-backup.sh            run the backup
#   restic-backup.sh plan       show what would be backed up; changes nothing
#   restic-backup.sh restic ARGS...   run any restic command with the same settings
#                                     (e.g. "restic snapshots", "restic init")
#
# Secrets and the real dataset list live OUTSIDE the repo, in $BACKUP_DIR.

# ── Section 1: safety settings ───────────────────────────────────────────────
set -euo pipefail    # stop on errors, unset variables, and failures inside pipes
umask 077            # anything this script creates is readable by root only

BACKUP_DIR="${BACKUP_DIR:-/mnt/SSDs/houseos/backup}"
ENV_FILE="$BACKUP_DIR/restic.env"
LIST_FILE="$BACKUP_DIR/datasets.list"
CA_CERT="$BACKUP_DIR/pc-cert.pem"
CACHE_DIR="$BACKUP_DIR/cache"
LOG_DIR="$BACKUP_DIR/logs"
LOCK_FILE="${LOCK_FILE:-/run/restic-backup.lock}"
POOL="SSDs"
# Pinned by digest: the tag is only a label, the sha256 is the exact image.
RESTIC_IMAGE="restic/restic:0.19.1@sha256:136600b6ff6843d61d355f7f71f460a166429f35de6fd11b568fece3c9a4d510"
SNAP="restic-$(date +%Y%m%d-%H%M%S)"
MODE="${1:-run}"

log()  { printf '%s  %s\n' "$(date '+%F %T')" "$*"; }
die()  { log "ERROR: $*"; exit 1; }

[[ $EUID -eq 0 ]] || die "must run as root (use sudo)"
case "$MODE" in run|plan|restic) ;; *) die "unknown mode '$MODE' (use: run | plan | restic ...)";; esac

for f in "$ENV_FILE" "$LIST_FILE" "$CA_CERT"; do
  [[ -f "$f" ]] || die "missing $f"
done
[[ "$(stat -c '%a %U' "$ENV_FILE")" == "600 root" ]] \
  || die "$ENV_FILE must be owned by root with mode 600"
mkdir -p "$CACHE_DIR" "$LOG_DIR"

# ── Section 2: lock, log file, the shared container command ─────────────────
# Only one copy may run at a time (a slow backup must not overlap the next one).
exec 9>"$LOCK_FILE"
flock -n 9 || die "another restic-backup is already running"

# Everything printed from here on also goes to a dated log file; keep 60 days.
if [[ "$MODE" == "run" ]]; then
  exec > >(tee -a "$LOG_DIR/$(date +%F).log") 2>&1
  find "$LOG_DIR" -name '*.log' -mtime +60 -delete
fi

# The one docker command every mode shares: no extra privileges, cert + cache only.
restic_container() {
  docker run --rm --hostname gaia \
    --env-file "$ENV_FILE" \
    --cap-drop ALL --cap-add DAC_READ_SEARCH \
    --security-opt no-new-privileges \
    -v "$CA_CERT:/certs/pc-cert.pem:ro" \
    -v "$CACHE_DIR:/cache" \
    "$@"
}

if [[ "$MODE" == "restic" ]]; then
  shift
  restic_container "$RESTIC_IMAGE" --cacert /certs/pc-cert.pem --cache-dir /cache "$@"
  exit $?
fi