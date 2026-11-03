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

## 4. Recurring tasks v2

### 4.1 Model

Recurring stays **template → ticket instance**. The alternative, one record that toggles
done/not-done, loses history: no per-person stats, no comments per occurrence, no on-time rate.

`recurring_tasks` (changes in **bold**)

| Field | Type | Notes |
|---|---|---|
| title, description, category, priority, assignee | — | copied onto each instance |
| interval_days | number ≥1 | |
| **schedule_mode** | select `fixed` \| `after_completion` | fixed: trash every Tue. after_completion: HVAC filter 90 days after the last change. |
| next_due | date | due date of the **upcoming / current** cycle |
| **remind_days** | number ≥0 | lead time: instance appears on the board (and pushes) this many days before `next_due`. 0 = appears on the due date. |
| **current_ticket** | relation → tickets | the open instance, or empty |
| **last_completed** | date | replaces `last_created` |
| active | bool | paused templates create nothing |

`tickets`: add **`recurring`** (relation → recurring_tasks). Stops parsing `ext_key` to find
the template.

### 4.2 Lifecycle

```
            now ≥ next_due − remind_days                  status → Done
 SCHEDULED ─────────────────────────────► ON BOARD ──────────────────────► SCHEDULED
 (hidden)    hourly cron creates 1 ticket   (Open/…; due chip;               (next cycle)
             due_date = next_due            "due"/"overdue" badge)
             push → assignee                 never a 2nd copy while open
```

**Create (cron, hourly):** for each active template with no `current_ticket` and
`now ≥ next_due − remind_days`: create ticket `{status: Open, due_date: next_due, recurring: id,
ext_key: "recurring:<id>:<next_due>"}`, set `current_ticket`. Wrapped in one transaction.
`ext_key` gets a **partial unique index**
(`CREATE UNIQUE INDEX … ON tickets (ext_key) WHERE ext_key != ''`) so a double run can't
duplicate. It must be partial because PocketBase stores empty text as `''`, which would
collide.

**Complete (server hook on ticket update → Done):**
- Server sets `done_at = now`, `done_by = @request.auth.id` for **all** tickets (the browser no
  longer sends them).
- If `recurring` is set:
  - `fixed`: `next = due_date + interval`; while `next ≤ now`, add interval again. Missed
    cycles are skipped rather than queued up.
  - `after_completion`: `next = done_at + interval`.
  - Set template `next_due = next`, `last_completed = done_at`, clear `current_ticket`.

**Reopen (Done → anything else) on a recurring instance:** the instance's own `due_date` is the
cycle it belonged to, so restore `next_due = ticket.due_date` and `current_ticket = ticket`.
No extra bookkeeping field needed.

**Board:** hide `recurring != "" && status = "Done"`. History stays in the database and in
stats. A "show completed" toggle reveals them.

**Notifications:** push to the assignee (anyone if unassigned) when the instance appears, on
the due date, and once when it goes overdue. Not daily nagging.

**Edits:** changing interval, mode, or reminder applies from the next cycle. The open instance
keeps its due date.

**Dates:** date-only values (`due_date`, `next_due`) are stored at **12:00 UTC**. That falls on
the same calendar date in every US time zone, which fixes the "Nov 10 shows as Nov 9" bug.
Container gets `TZ=America/New_York` so logs and cron read in local time.

### 4.3 UI

- Tickets header gets a real **segmented control**: `Board | Recurring (n)`, the same size as
  the Add button. Removes the subtitle link.
- Recurring list: one card per template showing title, "every 7 days · fixed", next due,
  "appears 2 days before", assignee, and a state chip (`scheduled` / `on board` / `overdue` /
  `paused`). Inline **Complete now** acts on the current instance.
- Create/edit form adds **Repeat mode** and **Remind me _n_ days before**.
- Board cards for instances get a ↻ badge and a due/overdue chip.
- **Stats** (household, excluding `security`):
  - Tiles: *Due this week (recurring)*, *Overdue*, *On-time rate* (completed with
    `done_at ≤ due_date` ÷ completed, last 90 days).
  - Per-person completions include recurring instances.
- Dashboard: "Coming up" list, the next 7 days of recurring due dates.

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
| **2** | Recurring schema + lifecycle hook + hourly cron | Script test: appear at due − remind; complete hides it; fixed vs after-completion compute the right next due; reopen restores |
| **3** | Recurring UI + stats tiles + segmented control | Screenshot-worthy board; recurring visible in stats |
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
