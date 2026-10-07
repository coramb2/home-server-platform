# home-server-platform

> A self-hosted, modular home-server platform for a two-person household — chores,
> planning, and (soon) network monitoring in one place, on hardware you own, reachable only
> over your private network.

Most "household organizer" apps are someone else's cloud. This is the opposite: a small,
secure platform you run at home, where each capability is an independent module unified behind
a single app called **HouseOS**. It started as a shared ticket system for two people (think
*"the dishwasher is making a grinding noise"* → a tracked ticket, not a lost text message) and
is growing into a base that other home-lab services plug into.

It's built as equal parts useful tool and learning project.

## Status

**Live in production** on a HexOS / TrueNAS SCALE 25.10 home server, reachable only over
Tailscale with HTTPS. Running today: tickets, recurring tasks, the dashboard and scoreboard,
and phone push notifications.

| Module | Status |
|---|---|
| Tickets (board, detail, comments, scoreboard) | ✅ Live |
| Recurring tasks (auto-file tickets on a schedule) | ✅ Live |
| Push notifications (assignments + comments) | ✅ Live |
| Private access over Tailscale (HTTPS) | ✅ Live |
| Backups + restore drill | 🔜 Next |
| Network monitoring (traffic analyzer + alert bridge) | 📋 Planned — bridge code exists, analyzer not yet deployed |
| Media | 📋 Planned — will link to the existing Jellyfin server rather than replace it |
| Host metrics | ⏸ Deferred — the original design needed full Docker access; TrueNAS's own Reporting covers it for now |

## What it does

- **Tickets** — file, assign, comment on, and close household tasks from your phone in seconds.
  Chores, repairs, errands, and bigger planning threads (*"plan Christmas"*) all live as
  tickets with status, priority, categories, and due dates.
- **Recurring tasks** — templates (*"replace HVAC filter every 90 days"*) that a daily
  scheduled job inside PocketBase turns into real tickets when they come due.
- **Per-person time tracking** — see how long tasks actually take, framed as a friendly
  scoreboard rather than a stopwatch.
- **Notifications that find you** — encrypted Web Push to your phone when a ticket is assigned
  to you or someone comments on yours, so the system replaces the group text instead of adding
  another inbox.
- **Installable** — add it to your phone's home screen and it opens like a native app (PWA).

## How it's built

One frontend, one front door, one private network edge — with independent services behind it:

```
 Your devices ── Tailscale (HTTPS, no router ports, ever)
                     │
                     ▼
           ┌─ tailscale container ──────────────────────────┐
           │  :443  → Caddy → HouseOS app screens           │
           │                 └→ /api/tickets → PocketBase   │
           │  :8443 → PocketBase admin dashboard            │
           └────────────────────────────────────────────────┘
                     push notifier ── polls PocketBase,
                                      sends Web Push via Apple/Google
```

| Layer | Choice |
|---|---|
| Frontend | SvelteKit, built to static files, installable to the home screen (PWA) |
| Tickets backend | PocketBase (SQLite, built-in auth, migrations, scheduled hooks) |
| Front door | Caddy — serves the app, routes `/api/tickets` to PocketBase |
| Private access + TLS | Tailscale container (`tailscale serve`); Caddy shares its network, so no host ports are published |
| Notifications | Web Push (VAPID), sent from a small Node worker on your own server |
| Runtime | Docker Compose, deployed as a TrueNAS "Install via YAML" custom app |

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the full design — trust boundaries, the module
contract, auth model, and backup strategy.

## Security model

- **Zero WAN exposure, and zero LAN exposure.** No service publishes a port on the server.
  The only way in is through Tailscale, so even other devices on the home Wi-Fi can't reach it.
- **No public sign-ups.** Accounts are created by the admin; the `users` collection only allows
  superusers to create records.
- **Least privilege.** Every container runs as an unprivileged user where possible (PocketBase
  as UID 1000, Caddy as UID 1001, the notifier as its own user). Tailscale runs in userspace
  mode with no extra capabilities or devices. The notifier logs in with its own dedicated
  account, so it can be revoked without touching anyone's personal login.
- **Secrets never live in the repo.** Each service reads its own env file from outside the
  repository (see below), so a secret can't be committed by accident. A gitleaks pre-commit
  hook backs this up.
- **Pinned versions.** Images and binaries are pinned; upgrades happen on purpose.

## Deploying

### On HexOS / TrueNAS SCALE (current production)

The deployment uses **[`compose.hexos.yaml`](compose.hexos.yaml)**. In outline:

1. Create a dedicated, **unshared** dataset for the app and clone this repo into it.
2. Create the data folders the compose file expects, owned by the right container users.
3. Create the two env files (below) next to the repo, `chmod 600`.
4. In TrueNAS: **Apps → Discover Apps → ⋮ → Install via YAML**, with a small wrapper:
   ```yaml
   include:
     - path: /mnt/<pool>/houseos/home-server-platform/compose.hexos.yaml
   services: {}   # required on TrueNAS 25.10+
   ```
5. Approve the `houseos` machine in Tailscale and disable its key expiry.

**To update:** `git pull` on the server, then **Apps → houseos → Edit → Save**. When the app
screens or a Dockerfile change, bump the image tag in `compose.hexos.yaml` (e.g.
`houseos-caddy:v2` → `v3`) to force a rebuild.

**Secrets (outside the repo, never committed):**

| File | Used by | Contains |
|---|---|---|
| `houseos.env` | tailscale | `TS_AUTHKEY` — one-time join key, only needed on first start |
| `push.env` | push | Notifier's PocketBase login, VAPID public + private keys, `VAPID_SUBJECT` |

The VAPID **public** key is also passed into the Caddy build in `compose.hexos.yaml`. That's
intentional: every browser receives it.

### On a generic Docker host

[`compose.pilot.yaml`](compose.pilot.yaml) and [`docs/pilot-quickstart.md`](docs/pilot-quickstart.md)
run the core stack on any always-on machine with Docker and Tailscale.
[`compose.yaml.example`](compose.yaml.example) and [`docs/sprint-0.md`](docs/sprint-0.md)
describe the original full-platform design for a Debian host (written before the hardware was
chosen; some steps, like `ufw`, don't apply to TrueNAS).

## Checkpoints

Each working milestone is tagged, so there's always a known-good version to return to:

| Tag | Milestone |
|---|---|
| `step-3-pocketbase` | Ticket database running on the server |
| `step-4-caddy` | Front door + app screens |
| `step-5-tailscale` | Private tunnel, HTTPS, temporary ports closed |
| `step-6-push` | Phone notifications |

## Design principles

- **Self-hosted; you own the data.** No third-party SaaS for core function.
- **Private by default.** Remote access is Tailscale-only; nothing is opened on the router or the LAN.
- **Own the fun part, deploy the scary part.** Build the interface; use maintained, audited
  software for auth and storage.
- **Adoption-first.** For a two-person tool, it only works if *both* people reach for it
  instead of texting. Every decision is judged against that friction.
- **A tested backup, or it isn't a backup.**

## Roadmap

Next up: nightly backups with a tested restore, then a round of small improvements —
moving the `users` access rules into a migration, running the scheduler on local time,
an assignee picker on the new-ticket form, and an "upcoming recurring tasks" view.
See **[ROADMAP.md](ROADMAP.md)** for the full sprint backlog and the 30-day adoption checkpoint.

## Repository layout

```
apps/shell/            SvelteKit PWA — the HouseOS frontend
modules/tickets/       PocketBase: Dockerfile, migrations (schema), hooks (recurring tasks)
modules/push/          Web Push notifier (Node)
modules/alert-bridge/  turns network-analyzer alerts into tickets (not yet deployed)
caddy/                 Caddy Dockerfile (builds the shell in) + Caddyfiles
tailscale/             tailscale serve config (which port goes where)
docs/                  runbooks and design notes
compose.hexos.yaml     production deployment on HexOS / TrueNAS
compose.pilot.yaml     minimal stack for any Docker host
compose.yaml.example   original full-platform template
```

## Contributing & security

This repo is public, but anything describing a real home network is not. If you're forking or
contributing, read **[CONTRIBUTING.md](CONTRIBUTING.md)** first — it covers repo conventions and
the rule for what must never be committed (secrets, network maps), enforced by a gitleaks
pre-commit hook.

## License

To be decided (likely MIT). Until then, all rights reserved by the author.