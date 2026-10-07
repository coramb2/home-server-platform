# Design: Server monitoring & security checks

**Status:** approved design, not yet built · **Depends on:** backups (Recover must exist before Detect)

## Goal

Show the server's health and security posture on the dashboard, and turn the things that need
action into tickets — without giving any component more power than it needs, and without
burying real problems under noise.

## Components

```
TrueNAS API ─┐  (read-only key, wss://, pinned cert)
Tailscale API┼─► monitor service ──► /api/metrics ──► dashboard   (via Caddy, tunnel only)
Pi-hole API ─┘  (polls every 30s,  └─► files tickets in PocketBase (deduped by ext_key)
                 caches a summary)
```

- **monitor** is a new service in `compose.hexos.yaml`, like `push`: no ports, own env file
  (`monitor.env`), runs as an unprivileged user.
- The browser never talks to TrueNAS, Tailscale, or Pi-hole directly. It only sees the summary.
- Replaces the original Glances design, which required the Docker socket (root-equivalent).

## Dashboard

| Section | Shows | Source |
|---|---|---|
| Storage | pool status, used/free, last scrub result | TrueNAS |
| Drives | temperature and SMART health per drive | TrueNAS |
| Apps | running/stopped for each app | TrueNAS |
| System | CPU, RAM, network throughput, uptime | TrueNAS |
| Security | open security tickets, resolved this week, mean time to resolve (MTTR), posture checks below | monitor + PocketBase |

## Tickets

| | Household (incl. `it-server`) | `security` |
|---|---|---|
| Filed by | people, plus server-health alerts | security checks, plus people by hand |
| Household stats & scoreboard | counted | excluded; own stats incl. MTTR |
| Admin (Cora) | full access | full access |
| Other users | full access | **view only** (no edit, close, assign, comment) |
| Notifications | assignee | admin always; other users only for **P1** |

- Server-health alerts (failing drive, full pool) → `it-server`, assigned to admin.
- One ticket per alert, deduplicated via `ext_key`. Persisting alerts never re-file.
- Severity mapping: CRITICAL/ALERT/EMERGENCY → P1 · ERROR → P2 · WARNING → P3 ·
  INFO/NOTICE → dashboard only, no ticket.

### Access rules (enforced in PocketBase, not just the UI)

- `users.is_admin` (bool), set only by a superuser.
- `users` update rule must reject any change to `is_admin` by a regular user —
  otherwise anyone could promote themselves.
- `tickets` update/delete: `category != "security" || @request.auth.is_admin = true`.
- `comments` create: same check against the parent ticket's category.
- UI hides edit controls for non-admins on security tickets (courtesy; rules are the lock).

## Security checks

Organized by the NIST Cybersecurity Framework (CSF 2.0) functions. Every check must have a
**response** written next to it before it ships: a check nobody knows how to act on is noise.

### Phase 1 — TrueNAS (same read-only key)

| Check | CSF | Fires when | Response |
|---|---|---|---|
| TrueNAS update available | Protect | update pending > 7 days | review release notes, update |
| App update available | Protect | any app has an update | update app; check changelog for security fixes |
| Failed logins (web UI / SSH) | Detect | ≥ 5 failures in 10 min | check source; rotate password if unexpected |
| Exposure drift | Protect | a service (SSH, SMB, NFS, FTP) or SMB guest access differs from the approved baseline | confirm intended, or turn it off |
| SSH password auth enabled | Protect | enabled | switch to key-only |
| Certificate expiry | Protect | < 21 days left | renew |
| Backup freshness | Recover | newest snapshot or backup older than expected | check backup job |
| TrueNAS security-class alerts | Detect | any | per alert |

### Phase 2 — Tailscale (separate read-only API key)

| Check | CSF | Fires when | Response |
|---|---|---|---|
| New device joined | Detect | device not in approved list | confirm it's yours, or remove it |
| Device key expiring | Protect | < 14 days (except the server, which has expiry disabled) | re-authenticate device |
| Access policy changed | Detect | tailnet policy file changed | review the change |

### Phase 3 — the platform watching itself

| Check | CSF | Fires when | Response |
|---|---|---|---|
| New superuser created | Detect | `_superusers` count changes | verify; delete if not yours (P1) |
| New user account | Detect | `users` count changes | verify |
| Failed HouseOS logins | Detect | threshold exceeded | investigate |
| Vulnerable container images | Identify | image scan finds a high/critical CVE | rebuild with patched base image |

### Phase 4 — the network

| Check | CSF | Fires when | Response |
|---|---|---|---|
| New client on the network | Detect | unknown device appears (Pi-hole) | identify it |
| Suspicious DNS / traffic | Detect | traffic analyzer alert | per alert (existing alert bridge) |

## Principles

- **Least privilege per source.** Every key is read-only and lives in `monitor.env`. The
  monitor can see everything and change nothing — which also makes it a high-value target,
  so it stays inside the tunnel with no ports.
- **Baseline, then drift.** Exposure checks compare against a baseline you approve, so they
  fire on *changes*, not on things you deliberately turned on.
- **Thresholds and dedup over raw events.** One ticket per problem, not one per occurrence.
- **Encrypted transport only.** TrueNAS is reached over `wss://` with its certificate pinned.
