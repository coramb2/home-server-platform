# Tickets module

The household ticket system's backend: **PocketBase** (single Go binary, SQLite), pinned to
**v0.39.6**.

## Schema

Defined as migrations in [`pb_migrations/`](pb_migrations/) — validated against v0.39.6.

**`tickets`**

| Field | Type | Notes |
|---|---|---|
| `title` | text (req) | the one required field for quick-add |
| `description` | editor | rich text |
| `status` | select (req) | Backlog · Open · In Progress · Waiting · Done |
| `priority` | select | P1–P4 |
| `category` | select | repair · planning · project · errand · it-server · fun · security |
| `assignee` | relation → users | who owns it |
| `created_by` | relation → users | who filed it |
| `due_date` | date | surfaced in calendar later |
| `done_at` | date | set when moved to Done |
| `done_by` | relation → users | who completed it |
| `attachments` | file (≤10, images/PDF) | e.g. photo of the broken appliance |
| `created` / `updated` | autodate | |

**Time tracking** needs no extra table: *time to complete, per person* = `done_at − created`,
attributed to `done_by`.

**`comments`** — `ticket` (relation, cascade-delete), `author` (relation → users), `body`,
timestamps. Authors may edit/delete only their own.

Access rules: any authenticated user may read/write (the platform sits behind Tailscale +
PocketBase auth; see [ARCHITECTURE.md](../../ARCHITECTURE.md) §8).

## Run locally (dev)

```bash
# from repo root, using a locally downloaded pocketbase binary:
pocketbase serve --dir=modules/tickets/pb_data \
                 --migrationsDir=modules/tickets/pb_migrations \
                 --hooksDir=modules/tickets/pb_hooks
# admin UI: http://127.0.0.1:8090/_/   API: http://127.0.0.1:8090/api/
```

`pb_data/` is gitignored (it's runtime data). Migrations are the source of truth for schema.

## Deploy

Built by [`Dockerfile`](Dockerfile) and wired up in the root `compose.yaml`. Runs as a non-root
user, no published ports — reachable only via Caddy at `/api/tickets/*`.
