# Contributing & repository conventions

Thanks for looking at the project. This file covers how the repo is organized, how to work on a
module, and — most importantly — the rule for what must never be committed.

## Security: what goes in this repo, and what never does

**This repo is public. The code and architecture are meant to be shared; anything that describes
a real home network is not.** Secrets and runtime data are blocked by [`.gitignore`](.gitignore)
and a [gitleaks pre-commit hook](.pre-commit-config.yaml) — please don't disable them.

**Safe to commit**
- Application and module source code
- PocketBase schema/migrations (structure, not data)
- `*.example` templates: `Caddyfile.example`, `compose.yaml.example`, `.env.example`
- Documentation and diagrams

**Never commit**
- **Secrets** — `.env`, VAPID *private* key, PocketBase admin credentials, `restic` password,
  API tokens, `DASHBOARD_PASSWORD`, `DASHBOARD_SECRET_KEY`
- **Anything that maps a real network** — internal IPs/subnets, your Tailscale/MagicDNS
  hostnames, Tailnet ACLs, firewall specifics
- **Traffic-analyzer runtime data** — `device_names.json`, `known_devices.json`,
  `security_alerts.json`, `alert_state.json`, `*.pcap`, `reports/`
- **App data & backups** — `pb_data/`, SQLite files, backup archives

Instead of committing real config, commit a `*.example` with placeholders and keep the real file
local (it's gitignored).

### Arm the secret scanner before your first commit

```bash
pip install pre-commit        # or: pipx install pre-commit / brew install pre-commit
pre-commit install            # runs gitleaks on every commit
pre-commit run --all-files    # scan the whole tree now
```

## Repository layout

```
apps/shell/        SvelteKit PWA — the unified frontend
modules/tickets/   PocketBase schema, hooks, and config
modules/network/   the traffic analyzer (imported as a subtree)
caddy/             reverse-proxy config
docs/              runbooks and design notes
```

## The module contract

A capability is a "module" if it: runs as its own least-privilege service, owns its own data
store, exposes an HTTP API reachable only through Caddy at `/api/<module>/*`, is covered by the
standard backup job, and integrates with the rest **only** at three seams — the Caddy route, the
Tailscale edge, and a tab in the shell. Modules never reach into each other's internals;
cross-module actions go through public APIs. Full details in [ARCHITECTURE.md](ARCHITECTURE.md).

## Working style

- Work happens in small **sprints**, each ending in something that runs and is demoable
  ([ROADMAP.md](ROADMAP.md)).
- Pin dependency/image versions; don't use `latest`.
- Keep commits scoped and descriptive.
