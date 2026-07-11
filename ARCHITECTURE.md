# Architecture

**Project:** home-server-platform · **Author:** Cora · **Status:** Draft (living document)
**Supersedes:** the standalone HouseDesk ticket spec (v0.1), which is now the *tickets module*
of this platform.

---

## 1. Vision

Not a ticket app — a **home-server platform**. Ticketing, network monitoring, and media are
**modules**. The platform's job is to let modules be developed, secured, upgraded, and backed
up **independently**, while presenting them as **one product** with a single face, a single
door, and a single set of conventions.

The two users are a two-person household (both on iPhone 14, both technical, both
neurodivergent). The system succeeds only if using it is **faster and nicer than sending a
text**, and if it's something we're **proud to show off**.

## 2. Principles (the non-negotiables)

1. **Self-hosted, we own the data.** No third-party SaaS for core function.
2. **Zero WAN exposure.** No router port-forwarding, ever. Remote access is Tailscale-only.
   This single decision removes most of the threat model.
3. **Least privilege per module.** Each service runs as its own user/container with only the
   capabilities it needs. The most privileged module (network capture) is the most isolated.
4. **Own the fun part, deploy the scary part.** We build the frontend (aesthetics, UX,
   dashboards). We do **not** hand-roll security-sensitive backends (auth, storage) — those
   are maintained, audited software.
5. **Boring, secure infrastructure.** Docker Compose, pinned image tags, one reverse proxy,
   documented upgrade path. No cleverness in the plumbing.
6. **Adoption-first UX.** Every decision is judged against friction for the *second* user.
7. **Publish the code, never the home.** Code and architecture are public; anything that maps
   our actual network is not (§12).
8. **A tested backup, or it isn't a backup.** Restore drills are exit criteria, not TODOs.

## 3. System diagram

```
        [Cora's iPhone]        [BF's iPhone]      (both: PWA installed to Home Screen)
              |                      |
              +---- Tailscale mesh (zero WAN, device-level auth) ----+
                                     |
                             [ Caddy ]  — single ingress; TLS via Tailscale cert
                                     |
        +----------------+-----------+-----------+--------------------+
        |                |                       |                    |
       / (SPA)     /api/tickets/*          /api/network/*       /api/media/*  (future)
   SvelteKit shell   PocketBase             analyzer (Flask)      Jellyfin
   (the frontend     (SQLite +              (own state files,     (own library db)
    we build)         file storage)          CAP_NET_RAW,
                                             ISOLATED)
                                     |
                      [ nightly backup -> second disk -> weekly restic offsite ]
```

Everything below Caddy is an **independent service**: it can crash, upgrade, and be restored
on its own without touching the others.

## 4. Component decisions (locked)

| Layer | Decision | Why |
|---|---|---|
| Remote access | **Tailscale** (WireGuard mesh) | Zero WAN ports; device-level identity at the edge |
| Ingress / TLS | **Caddy**, one entry for all modules | Simple config; automatic TLS; the whole lab's single door |
| Cert | **Tailscale `*.ts.net` cert** (publicly-trusted LE) | The *only* option that gives iPhone PWA install + Web Push with **no cert warning**. An internal CA on `*.home.lan` requires a trusted profile on every device and breaks iOS push. |
| Frontend (built) | **SvelteKit** PWA, tabbed shell | Best result-per-hour; first-class PWA; approachable to learn |
| Tickets backend | **PocketBase** (single Go binary, SQLite) | Maintained/audited auth (security kept); custom schema incl. native per-person time tracking; backup = one file + one dir; built-in cron for recurring tasks |
| Push | **Web Push (VAPID)** from our own server | Payloads encrypted end-to-end; only Apple's APNs relays ciphertext; **nothing transits a third party** (unlike self-hosted ntfy on iOS) |
| Network backend | **network-traffic-analyzer** (Python/Flask), unchanged | Already least-privilege and API-first; we replace only its *view* |
| Media (future) | **Jellyfin** | Open-source, no phone-home; slots in as another module |
| Host OS | **Debian 12** + Docker Compose (default) | Stable; swap for Ubuntu LTS / Proxmox VM/LXC if the server standard differs |

Notably, this drops PostgreSQL for now (PocketBase = SQLite; analyzer = JSON files), which
simplifies backups. Postgres can return later if a module needs it.

## 5. What "a module" means (the contract)

Any capability is a module if it:

1. Runs as an **independent service** (own container, own user, own least-privilege grant).
2. Owns its **own data store** (no shared database between modules).
3. Exposes an **HTTP API** reachable only through Caddy at `/api/<module>/*`.
4. Is **backed up** by the platform's standard job (§10).
5. Is unified with the rest **only** at three seams: the **Caddy** route, the **Tailscale**
   edge, and a **tab** in the shell frontend. No module reaches into another's internals;
   cross-module actions go through public APIs (see §9).

This contract is the thing that makes new modules (media, home automation, etc.) drop in
without redesign.

## 6. Trust boundaries

- **B1 — WAN / LAN:** No inbound router ports. Reachable only from the Tailnet. Eliminates
  opportunistic internet scanning outright.
- **B2 — Edge / services:** Only Caddy is reachable from the Tailnet. Services live on an
  internal Docker network with no published ports.
- **B3 — Service / service:** Services do not trust each other implicitly. Cross-module calls
  use authenticated APIs, not shared files or DBs.
- **B4 — The capture module is special:** the analyzer holds `CAP_NET_RAW`/`CAP_NET_ADMIN`
  and sees all traffic. It is the highest-value target: keep it isolated, treat the
  frontend→analyzer path as **read-mostly**, and never let the shell inherit those caps.

## 7. Caddy routing map

```
<your-machine>.<your-tailnet>.ts.net {
    # SPA shell (static build) at the root
    handle /api/tickets/* {
        reverse_proxy pocketbase:8090
    }
    handle /api/network/* {
        reverse_proxy analyzer-dashboard:8080
    }
    # handle /api/media/*   { reverse_proxy jellyfin:8096 }   # future
    handle {
        root * /srv/shell
        try_files {path} /index.html
        file_server
    }
}
```

A concrete placeholder lives in [`caddy/Caddyfile.example`](caddy/Caddyfile.example). The real
Caddyfile (with your actual `ts.net` hostname) is **not committed** (§12).

## 8. Auth model (defense in depth)

- **Outer boundary — Tailscale (device-level):** only enrolled devices reach the platform at
  all. This is the primary access control and is stronger than a password on the open web.
- **App layer — PocketBase (per-user):** individual accounts for the two users, strong unique
  passwords (password manager), TOTP enabled, **registration disabled** after both accounts
  exist.
- **Per-module authorization:** default is "both users are trusted." Where a module exposes
  sensitive actions (e.g., firewall-rule suggestions, raw packet data), restrict them to the
  admin account rather than exposing to both.
- We do **not** hand-roll sessions/password hashing. PocketBase owns that.

## 9. Cross-module integration: network → tickets

The analyzer already models alerts with open/resolved state and allowlisting. Integration is a
**ticket sink** added alongside its existing reporters: on a curated alert, `POST` to the
tickets API with a `security` label.

**Rules (to avoid an alert-spam firehose that kills adoption):**

- File a ticket **only** for *new, non-allowlisted, above-threshold* conditions (reuse the
  analyzer's existing dedup/allowlist state).
- **One ticket per ongoing condition**, not per packet; auto-resolve when the condition clears.
- Route security tickets to their **own board/label that does not notify** the household user
  by default. Network incidents are the admin's domain; chores are the shared domain.
- **One-directional** to start (analyzer → tickets). Add bidirectional resolution sync later,
  if ever — it invites loops.

## 10. Data, backup & recovery

- **System of record:** each module owns its store — PocketBase (`pb_data/`: SQLite +
  attachments), analyzer (its JSON state files), Jellyfin (its db) later.
- **Backup job (standard, per §5.4):** nightly local dump of every module's data to a second
  disk; **weekly `restic` encrypted push offsite** (3-2-1).
- **Backed up = data + config to reboot from:** include the `compose.yaml`, pinned image
  tags, and Caddyfile — **not** just data. A restore must reproduce a *running* system, not
  an orphaned database.
- **Restore drill is an exit criterion** (ROADMAP Sprint 4) and recurs as a scheduled ticket.
  An untested backup is a hope.

## 11. Notifications

- **Channel:** Web Push (VAPID) from the shell's service worker. Assignment and comment events
  push to the other person's phone with the app closed.
- **iOS specifics:** requires the PWA **installed to the Home Screen** (iOS 16.4+). This is why
  §4's Tailscale cert decision is mandatory, and why "install to Home Screen" is a Sprint-1
  onboarding step, not optional.
- **Why not ntfy:** self-hosted ntfy on iOS must forward through `ntfy.sh` to reach APNs,
  leaking topic name + timing to a third party. Web Push keeps payloads encrypted and on our
  own server. ntfy stays a documented fallback only if Web Push proves unreliable on iOS.

## 12. Public vs. private: what goes in this repo

**This repo is public.** Publish the code; never publish anything that maps the home.

**Public — commit freely**
- SvelteKit frontend source
- PocketBase schema/migrations (structure, **not** data)
- `Caddyfile.example`, `compose.yaml.example`, `.env.example` (placeholders only)
- Analyzer source code (already public)
- All docs / runbook (sanitized), architecture, diagrams

**Private — never commit** (blocked by `.gitignore` + gitleaks)
- **Secrets:** `.env`, VAPID **private** key, PocketBase admin creds, `restic` password, any
  API tokens, `DASHBOARD_PASSWORD`, `DASHBOARD_SECRET_KEY`
- **Network map:** real internal IPs/subnets, your `*.ts.net` / MagicDNS hostnames, Tailnet
  ACLs, firewall specifics
- **Analyzer runtime data:** `device_names.json`, `known_devices.json`, `security_alerts.json`,
  `alert_state.json`, `*.pcap`, `reports/` — these *are* a map of the home network
- **App data & backups:** `pb_data/`, SQLite files, backup archives

**Mechanism**
- `.gitignore` blocks the above; ship `.example` templates instead.
- `gitleaks` runs as a **pre-commit hook** so a secret cannot be committed by accident.
- History of the analyzer repo was scanned (2026-07-11): **clean** — only placeholder/test
  values, no real network data or secrets. No history rewrite required.

## 13. Versioning discipline

- Pin image tags (never `latest`); record versions in `compose.yaml`.
- Review module release notes monthly; snapshot/dump **before** any upgrade.
- Every sprint ends committed and demoable.
