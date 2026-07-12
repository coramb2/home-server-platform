# Alert bridge

Turns the network analyzer's **security alerts** into **tickets** — the seam that makes
Network and Tickets one system (ARCHITECTURE §9).

It polls the analyzer, and for each **new, unresolved** alert files exactly one ticket:

- **Deduped**: one ticket per analyzer `alert_key`, tracked via the ticket's `ext_key` field —
  re-polls never create duplicates.
- **Categorised**: `category = security`, severity mapped to priority (HIGH→P1, MEDIUM→P2,
  LOW→P3). Title/description carry the type, source IP, and any firewall suggestions.
- **Quiet by default**: tickets are left **unassigned**, so the push sender doesn't notify
  anyone — security noise stays off the household's phones. Set `SECURITY_ASSIGNEE` to a user
  id if you want them pushed to the admin.
- **One-directional**: it only *creates* (never edits/closes), to avoid sync loops. Resolve in
  the analyzer or close the ticket independently.

## Setup

```bash
cd modules/alert-bridge && cp .env.example .env   # fill in PB + analyzer creds
npm install && npm start
```

Requires PocketBase (with a superuser) and the analyzer reachable. Alerts only fire for real
conditions (port scans, threat-intel hits, new devices, etc.), so tickets are rare and
meaningful — not a firehose.

## Deploy

Built by [`Dockerfile`](Dockerfile); wired into the root `compose.yaml`. Holds the analyzer
password + PocketBase admin creds via env — never commit `.env`.
