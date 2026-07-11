# home-server-platform

A self-hosted, modular home-server platform for a two-person household.

Each capability — **ticketing**, **network monitoring**, and (later) **media** — is an
independent, least-privilege service. They are unified behind **one frontend**, **one
ingress** (Caddy), and **one private network edge** (Tailscale). **No ports are forwarded
on the router, ever.** Remote access is exclusively over the Tailscale mesh.

Built as equal parts useful tool and learning project by two neurodivergent tech nerds.

## Documents

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — the platform model, stack, trust boundaries,
  Caddy routing, auth, push, backups, and the public/private publishing rule.
- **[ROADMAP.md](ROADMAP.md)** — how we work (sprints + checkpoints), success metrics,
  and the sprint backlog.

## ⚠️ Before you commit anything

This repo is **public**. The code and architecture are meant to be shared; **anything that
describes our actual home network is not.** Read the "Public vs. private" rule in
[ARCHITECTURE.md](ARCHITECTURE.md#12-public-vs-private-what-goes-in-this-repo) before your
first commit. Secrets and runtime data are blocked by [`.gitignore`](.gitignore) and a
[gitleaks pre-commit hook](.pre-commit-config.yaml) — do not disable them.

## Status

Pre–Sprint 0 (scaffolding). See [ROADMAP.md](ROADMAP.md).

## Modules

| Module | Path | Backend | Status |
|---|---|---|---|
| Shell (unified PWA) | `apps/shell` | SvelteKit | Planned (Sprint 1) |
| Tickets | `modules/tickets` | PocketBase | Planned (Sprint 1) |
| Network | `modules/network` | [network-traffic-analyzer](https://github.com/coramb2/network-traffic-analyzer) (Python/Flask) | Existing; integrate Sprint 5 |
| Media | `modules/media` | Jellyfin | Future |
