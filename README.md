# home-server-platform

> A self-hosted, modular home-server platform for a two-person household — chores,
> planning, and network monitoring in one place, on hardware you own, reachable only
> over your private network.

Most "household organizer" apps are someone else's cloud. This is the opposite: a small,
secure platform you run at home, where each capability is an independent module unified behind
a single app. It started as a shared ticket system for two people (think *"the dishwasher is
making a grinding noise"* → a tracked ticket, not a lost text message) and grew into a base
that other home-lab services plug into.

It's built as equal parts useful tool and learning project.

## What it does

- **Tickets** — file, assign, comment on, and close household tasks from your phone in seconds.
  Chores, repairs, errands, and bigger planning threads (*"plan Christmas"*) all live as
  tickets with status, priority, categories, and due dates.
- **Per-person time tracking** — see how long tasks actually take, framed as a friendly
  scoreboard rather than a stopwatch.
- **Network monitoring** — the home network's traffic analyzer lives here too, and can turn a
  real security alert into a tracked ticket automatically.
- **Notifications that find you** — push to your phone when something's assigned to you, so the
  system replaces the group text instead of adding another inbox.
- **Media (planned)** — a self-hosted movie/show/music library as a future module.

## How it's built

One frontend, one front door, one private network edge — with independent services behind it:

```
  Your phones ── Tailscale (no ports forwarded, ever) ── Caddy ──┬── Tickets   (PocketBase)
                                                                 ├── Network   (traffic analyzer)
                                                                 └── Media     (Jellyfin, later)
                          all wrapped by one installable app (SvelteKit PWA)
```

| Layer | Choice |
|---|---|
| Frontend | SvelteKit, installable to your phone's home screen (PWA) |
| Tickets backend | PocketBase (SQLite, built-in auth) |
| Network module | [network-traffic-analyzer](https://github.com/coramb2/network-traffic-analyzer) (Python/Flask) |
| Ingress / TLS | Caddy |
| Private access | Tailscale (WireGuard mesh) — the platform never touches the public internet |
| Notifications | Web Push (encrypted, from your own server) |
| Runtime | Docker Compose on Debian/Ubuntu |

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the full design — trust boundaries, the module
contract, auth model, and backup strategy.

## Design principles

- **Self-hosted; you own the data.** No third-party SaaS for core function.
- **Zero WAN exposure.** No router ports opened — remote access is Tailscale-only.
- **Own the fun part, deploy the scary part.** Build the interface; use maintained, audited
  software for auth and storage.
- **Adoption-first.** For a two-person tool, it only works if *both* people reach for it
  instead of texting. Every decision is judged against that friction.
- **A tested backup, or it isn't a backup.**

## Status & roadmap

Early development. Work is organized as small sprints, each ending in something that runs and is
demoable. See **[ROADMAP.md](ROADMAP.md)** for the sprint backlog and the 30-day adoption
checkpoint, and **[docs/sprint-0.md](docs/sprint-0.md)** for the server foundation runbook.

## Repository layout

```
apps/shell/        SvelteKit PWA — the unified frontend
modules/tickets/   PocketBase schema + config
modules/network/   the traffic analyzer (imported)
caddy/             reverse-proxy config
docs/              runbooks and design notes
```

## Contributing & security

This repo is public, but anything describing a real home network is not. If you're forking or
contributing, read **[CONTRIBUTING.md](CONTRIBUTING.md)** first — it covers repo conventions and
the rule for what must never be committed (secrets, network maps), enforced by a gitleaks
pre-commit hook.

## License

To be decided (likely MIT). Until then, all rights reserved by the author.
