# Design: v2 — Recurring tasks, host metrics, network & unknown-device alerts

**Status:** draft for review · **Author:** Cora (with Claude) · **Date:** 2026-11-03
**Builds on:** [`truenas-monitoring.md`](truenas-monitoring.md) (approved) — this doc extends it
to UniFi, Pi-hole, Tailscale, Mars, and the traffic analyzer, and redesigns recurring tasks.

---

## 1. Why — what's wrong today

| Area | Symptom | Root cause |
|---|---|---|
| Host metrics | Dashboard always says "agent not connected" | `lib/metrics.ts` still calls **Glances**, which the monitoring design rejected (needs the Docker socket = root). The replacement `monitor` service was never built. `Caddyfile.pilot` has no `/api/metrics` route. |
| Network tab | Always "not connected" | `lib/network.ts` calls the traffic analyzer, which isn't in `compose.hexos.yaml`, and Caddy has no `/api/network` route. |
| Recurring | Hidden behind small text link; not in stats | UI: `<a>` in the subtitle. Stats only count `tickets`, ignore recurring. |
| Recurring | No warning before due; finished copies pile up in Done; schedules drift | Cron creates the ticket *on* the due date, sets `next_due = now + interval` (not due + interval), and never hides completed instances. A second copy can be filed while the first is still open. |
| Tickets (security) | Any signed-in user can post as someone else; `done_at`/`done_by` trusted from the browser | Create rules only check "signed in"; completion fields are set client-side. |
| Exposure | PocketBase admin UI reachable on tailnet port 8443, bypassing Caddy | `tailscale/serve.json` second handler. |
| Privilege | Alert bridge logs in as a PocketBase **superuser** | Needs only "create ticket". |

## 2. Goals / non-goals

**Goals**
1. Recurring tasks with a due date, a reminder lead time, per-task recurrence mode, and a
   lifecycle where a completed task disappears until its next reminder window.
2. Recurring is a first-class part of the Tickets screen and the stats.
3. One host-metrics view for **Gaia (TrueNAS)**, **Mars (Ubuntu)**, and the **UniFi gateway**.
4. A read-only Network page: subnets/VLANs & clients (UniFi), DNS (Pi-hole), tailnet devices
   (Tailscale), traffic analyzer.
5. **Unknown-device / unexpected-traffic alerts** filed as deduplicated `security` tickets.

**Non-goals**
- The app never **changes** router, DNS, or tailnet config. Read-only everywhere.
- No public exposure. HouseOS stays tailnet-only on whichever host it lands on (§8).
- No time-series database. Two users, a handful of hosts — an in-memory 24 h buffer is enough.

## 3. Architecture

```
                         ┌──────────── tailnet only ────────────┐
 phone / PC ──HTTPS──► tailscale ─► caddy ─┬─ /            → app screens (static)
                                           ├─ /api/tickets → pocketbase
                                           └─ /api/monitor → monitor   (requires PB login)

 monitor (new, Node, no ports, own monitor.env, unprivileged)
   ├─ pollers ── TrueNAS API (wss, read-only key)          Gaia
   │            node_exporter :9100 (read-only)            Mars
   │            UniFi Network API (view-only account)      gateway + subnets + clients
   │            Pi-hole API (app password)                 DNS
   │            Tailscale API (OAuth client, read scopes)  tailnet devices
   │            traffic analyzer API                       packets / alerts (phase 6)
   ├─ cache: latest snapshot + 24 h ring buffer (1-min points) per metric
   ├─ rules: compare snapshot to baselines → alerts
   └─ writes to PocketBase as a **service user** (not superuser):
        security tickets (dedup by ext_key), known_devices sightings
```

**Decisions**
- **One `monitor` service, not one per source.** Each source is a small module behind one
  interface (`poll() → snapshot`, `checks(snapshot, baseline) → alerts[]`). One process, one
  secrets file, one place to audit. Adding a source = adding a module.
- **Monitor replaces alert-bridge.** Its analyzer poller *is* the bridge's job; dedup by
  `ext_key` stays the same. Delete `modules/alert-bridge` once phase 6 ships.
- **Browser never talks to sources.** It sees only the monitor's summary JSON.
- **Monitor endpoints require a PocketBase login.** Being inside the tailnet isn't enough for
  security data. Monitor validates the `Authorization` header by calling PocketBase
  `auth-refresh` (result cached 60 s). Today's Caddy metrics route has no auth; this fixes it.
- **Service user instead of superuser.** New auth collection `services` with one record
  `monitor`. Ticket create rule allows it; it can't read users, delete, or change schema.
- Node (like `push`) so the whole backend is one language you already read.

## 4. Repeating tickets (revised 2026-11-04 — replaces the template design)

**Decision (Cora):** recurring is not a separate thing. Any ticket can *optionally* repeat.
The earlier template → instance design (separate `recurring_tasks` list + hourly cron) was
dropped: two screens, two forms, and a cron to keep in sync for what is really one setting.

### 4.1 Model — a chain of tickets

Each occurrence is an ordinary ticket. History (who did it, comments, on-time) stays per
occurrence, which was the reason for templates in the first place.

`tickets` new fields

| Field | Type | Set by | Notes |
|---|---|---|---|
| repeat_days | number 0–3650 | person | 0 / empty = doesn't repeat |
| repeat_mode | `fixed` \| `after_completion` | person | fixed: from the due date. after: from the day it's done |
| remind_days | number 0–365 | person | next one appears this many days before it's due |
| show_from | date | **server** | hidden from the board until then; = due − remind_days for server-filed occurrences, empty otherwise |
| series | text | **server** | id of the first ticket; shared by every occurrence |
| assignee | relation, **many** | person | was one person; now any number ("Everyone" = all) |

`ext_key` on a successor = `repeat:<previous ticket id>`. The partial unique index makes a
second successor impossible, even under a race. People can't set `ext_key`, `series` or
`show_from` (hooks overwrite them).

### 4.2 Lifecycle (`pb_hooks/repeat.pb.js`, logic in `repeat_lib.js`)

```
 Open … ──Done──► server files the next ticket (Open, due = next, show_from = next − remind)
   ▲                 │ hidden until show_from ("Upcoming" filter) → then on the board
   └──reopen─────────┘ successor deleted if untouched (still Open, no comments); else kept
```

- **fixed:** next = due + N; skip forward while ≤ today (missed cycles aren't queued).
  No due date → behaves like after_completion.
- **after_completion:** next = today + N.
- "today" = container's local date (`TZ=America/New_York`). Dates stored at 12:00 UTC and
  displayed in UTC, so a date is the same calendar day in every US zone.
- No cron: appearing is just `show_from <= now`, evaluated by the board and by the push service.
- Editing repeat settings affects the *next* filing; turning repeat off ends the series.

**Notifications (push service):** each newly-added assignee is told once; a hidden occurrence
is silent until `show_from`, then its assignees get "Coming up · due <date>". Comments notify
every assignee except the author.

**Migration `1752192007`:** each `recurring_tasks` template → a repeating ticket (active →
Open, paused → Backlog), `ext_key = migrated:<template id>`. The old collection is locked to
superusers, not deleted; drop it in a cleanup PR once v2 is verified.

### 4.3 UI

- Board: filter chips (All · Mine · Open · In Progress · Waiting · Done · Repeating ·
  Upcoming · Backlog) stored in `?f=` so dashboard tiles deep-link. Whole card is clickable
  (stretched link). Cards show ↻ interval, due/overdue chip, assignee avatars.
- Ticket page: assignee pills + Everyone; **Repeats** switch with every-N-days (+ presets),
  schedule mode, show-early days, and a preview of the next due date.
- Dashboard: tiles link to the filtered board; "Coming up · next 7 days"; host-metrics bar
  removed until Phase 4.
- Users can list each other (`users.listRule = @request.auth.collectionName = 'users'`);
  emails stay hidden by PocketBase's `emailVisibility`.

**Deferred:** on-time-rate tile, due/overdue pushes (would need a cron), hiding old Done
occurrences.

## 5. Host metrics

| Host | Source | Collects | Access |
|---|---|---|---|
| Gaia | TrueNAS API over `wss://`, cert pinned | pool status / free, last scrub, per-drive temp + SMART, apps running/stopped, CPU, RAM, net, uptime, alerts | API key on a **read-only** role |
| Mars | `node_exporter` container | CPU, RAM, disk, md RAID 1 status (`node_md_*`), temps, uptime | bind to Mars's LAN IP:9100; UniFi firewall allows **only the monitor host** → Mars:9100 |
| Gateway | UniFi API | WAN up/down, latency, throughput, gateway CPU/mem, firmware update pending | view-only account (§6.1) |

The dashboard gets a host strip with one card per host (status, CPU, RAM, storage, temp,
uptime) and a 24 h sparkline. Thresholds turn into `it-server` tickets per the existing
severity mapping (failing drive, pool > 85 %, RAID degraded, WAN down > 5 min).

## 6. Network page & alerts

### 6.1 Sources

- **UniFi:** networks (subnet, VLAN ID, purpose), clients (MAC, IP, hostname, network, first
  and last seen, fingerprint), APs/switches, IPS/threat events if enabled.
  **Account:** a dedicated local account with the **View Only** role. Use an Integration API
  key only if it can be confirmed read-only on your UniFi OS version; otherwise use the account.
  Kam creates it; it lives only in `monitor.env`.
- **Pi-hole:** queries, % blocked, top blocked domains, queries per client. v6 uses an *app
  password*; v5 uses an API token. Confirm the version.
- **Tailscale:** OAuth client with `devices:core:read` only. Lists devices, key expiry, last
  seen, new devices.
- **Traffic analyzer:** phase 6, see the caveat in §6.3.

### 6.2 Known-devices baseline → unknown-device alerts

New collection **`known_devices`**: `mac`, `name`, `owner` (→ users), `expected_network`
(VLAN/subnet), `kind` (phone, laptop, IoT, server…), `approved` (bool), `first_seen`,
`last_seen`, `notes`. Seeded once by importing the current UniFi client list, which you
already mapped. After that, monitor upserts `last_seen`.

| Check | Fires when | Ticket |
|---|---|---|
| Unknown device | client MAC not in `known_devices` | `security` P2, P1 on the main/trusted subnet. Dedup `unifi:new:<mac>`. |
| Wrong subnet | approved device appears on a network ≠ `expected_network` | P2. Dedup `unifi:vlan:<mac>:<net>`. |
| IoT talking out | a device of kind IoT shows in Pi-hole querying domains outside an allowlist | P3, digest (one ticket per device per day) |
| DNS bypass | a known client is active in UniFi but makes **zero** Pi-hole queries for 24 h | P3. It may use hard-coded DNS or DoH. |
| IPS event | UniFi threat event | per the severity map |
| New tailnet device | device not in the approved list | P1 (unchanged from the monitoring design) |

The ticket has **Approve device** and **Block (opens UniFi)** actions. Approve adds or updates
`known_devices` and closes the ticket. Block only deep-links to UniFi; the app never blocks
anything itself (read-only).

**MAC randomization (the false-positive risk):** iOS and Android use a private MAC per Wi-Fi
network, and newer iOS can *rotate* it. Without mitigation, the "unknown device" check would
fire again and again for your own phones. Mitigations:
1. Set **Private Wi-Fi Address → Fixed** (iOS) / "Use device MAC" (Android) on the home SSID
   for household devices.
2. Treat locally-administered MACs (second hex digit 2, 6, A, E) as "possibly randomized":
   before alerting, match on hostname + UniFi fingerprint and ask "is this your phone?" at P3
   instead of P1.
3. Guests belong on a guest network. Unknown devices on the guest VLAN go to the dashboard
   only, with no ticket.

**Recommendation for Kam (router config, outside the app):** a UniFi rule that blocks or
redirects outbound port 53 from every network except the Pi-hole. This makes the DNS-bypass
check rarely fire, which is the point.

### 6.3 Traffic analyzer caveat

A packet analyzer running on Gaia or Mars sees **only that host's traffic**, not the whole
network. Seeing everything needs a **mirrored switch port** (UniFi port mirroring) into a
dedicated NIC, and the container needs `NET_RAW`/`NET_ADMIN` plus host networking. That is the
most privileged component in the stack. Decide where it runs and how it's mirrored before
building it; that's why it is phase 6.

## 7. Security model (deltas)

| Change | Where |
|---|---|
| `tickets.createRule`: `@request.auth.id != '' && @request.body.created_by = @request.auth.id` | migration |
| `comments.createRule`: `… && @request.body.author = @request.auth.id` | migration |
| `done_at` / `done_by` set only by hook; update rule rejects them in the body (`@request.body.done_by:isset = false`) | migration + hook |
| Security-ticket access per monitoring design: `users.is_admin`, non-admins view-only | migration |
| Monitor API requires a PocketBase session | monitor |
| Service user replaces superuser for automation | migration + monitor |
| Remove port 8443 PocketBase exposure; use the admin UI via SSH port-forward | `serve.json` |
| All source credentials read-only, only in `monitor.env` (root 600), never in git | ops |
| Monitor container: non-root, read-only rootfs, `cap_drop: [ALL]`, no published ports | compose |

**Threat note:** the monitor holds read keys to the router, NAS, DNS, and tailnet. It can't
change anything, but it is a full map of the home network. It stays inside the tunnel, has no
ports, and has no write keys.

## 8. Hosting (open — ask Kam)

The design is host-agnostic: one compose stack, data in one dataset/directory, Tailscale
sidecar as the front door. Whatever is decided:

- **Keep HouseOS tailnet-only.** Do not put it behind the Cloudflare Tunnel. A public hostname
  plus a page full of network inventory is the wrong trade even with Cloudflare Access in
  front.
- The ts.net address doesn't change when home subnets change. Tailscale is an overlay.
- Moving to Mars means redoing the backup job (it snapshots ZFS datasets on Gaia) and the
  restore drill.
- Whichever host runs `monitor` needs firewall reachability to Mars:9100, the UniFi gateway,
  the Pi-hole, and (outbound) the Tailscale API.

## 9. Delivery plan — each phase is one PR = one GitHub checkpoint

| Phase | PR | Exit criterion |
|---|---|---|
| **0** | *(no code)* Find the ts.net URL, `git pull` + `up -d --build` on Gaia; do the 30-min restore drill while you're there | Both of you log in from your phones |
| **1** | Ticket security fixes (§7 rules, completion hook, partial unique `ext_key`), fix the 4 type errors | Can't post as the other user; done_by set by server |
| **2+3** | ✅ Tickets v2 (PR `feat/tickets-v2`): repeat on tickets, multi-assignee, users visible, clickable board/dashboard | Done → next filed; reopen takes it back; both users assignable |
| **4** | `monitor` skeleton (auth, cache, service user) + TrueNAS source; rewrite `metrics.ts`; Caddy route | Gaia card live on dashboard |
| **5** | UniFi source + `known_devices` + Network page (subnets, clients) + unknown-device / wrong-subnet tickets | A test device joining files exactly one ticket; Approve closes it |
| **6** | Pi-hole + Tailscale + Mars `node_exporter` + gateway health | All three host cards live; DNS panel |
| **7** | Traffic analyzer (after the mirror-port decision); delete alert-bridge | Analyzer alert → one security ticket |

Phase 1 comes first because it's small and teaches PocketBase hooks and rules, which Phase 2
depends on.

## 10. Open questions

1. **Host:** Gaia or Mars? *(Kam)*
2. **UniFi:** UniFi OS / Network version; can Kam create a View Only local account? Is IPS /
   CyberSecure enabled? *(Kam)*
3. **Pi-hole:** v5 or v6? Which host runs it now (Gaia app or Mars)?
4. **Subnets:** what are the networks/VLANs now (main, IoT, guest, servers)? Needed for
   `expected_network` and for P1 vs P3 alert severity.
5. **Reminder period:** confirm the meaning. This doc assumes "how many days before the due
   date it shows up" plus pushes on appear / due / overdue. Did you also want repeated nags?
6. **Rename:** HouseOS → ? It's cheap to do before Phase 4 adds more names.
