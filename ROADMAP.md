# Roadmap

**Project:** home-server-platform · **Status:** living document

## How we work

- **Sprints** are one to a few evenings each. Every sprint ends in something that **works, is
  committed, and can be demoed** — no half-merged limbo.
- Each sprint has an explicit **exit criterion**. If it isn't met, the sprint isn't done.
- **Checkpoints** are decision gates (not work): the big one is the **30-day adoption
  checkpoint** with an explicit go / no-go.
- Default host assumption: **Debian 12 + Docker Compose**. Swap points to Ubuntu LTS / Proxmox
  are noted where they matter (Sprint 0).

## Success metrics (judged at the 30-day checkpoint)

The only signal that matters is whether the **second user** uses it unprompted.

- ✅ **≥3 tickets filed by the household user, unprompted** (this is the real metric; total
  count is vanity — it can be front-loaded by the admin).
- ✅ **Day-7 leading read:** by day 7, has the household user opened the app unprompted at least
  twice? If **no**, intervene immediately (don't wait 23 days) — simplify quick-add, verify
  push is actually landing.
- ✅ **≥70%** of filed tickets reach Done or get activity within 7 days.
- ✅ **Zero** "why didn't you just text me" moments that ended in reverting to texting.
- ✅ **One successful restore drill** completed.
- **Decision:** continue → later sprints, adjust, or sunset gracefully.

## Sprint backlog

### Sprint 0 — Foundation & repo hygiene
*Blocked on: home server reachable on the network.*

- **0.1** Base OS (Debian 12): static IP / DHCP reservation, SSH **key-only**, automatic
  security updates (`unattended-upgrades`).
  *(Swap: Ubuntu LTS — same steps. Proxmox — do this inside the VM/LXC that will host Docker.)*
- **0.2** `ufw` default-deny inbound; allow SSH (LAN/tailnet only) and 443.
- **0.3** Docker + Compose v2.
- **0.4** Tailscale on the server **and both iPhones**; note the `*.ts.net` hostname (kept
  private).
- **0.5** Second disk / NAS backup target mounted and writable.
- **0.6** Create the monorepo; pull `network-traffic-analyzer` in as a **git subtree** (keeps
  its history). Add `.gitignore`, `.env.example`, and the `gitleaks` pre-commit hook. Confirm
  the history scan stays clean.
- **0.7** Caddy skeleton serving a placeholder page over the **Tailscale cert**.
- **Exit:** both iPhones load `https://<your-ts.net>/` with a valid cert and **no warning**;
  repo is public with secrets/data ignored and gitleaks active.

### Sprint 1 — Tickets backend + minimal shell
- **1.1** PocketBase behind `/api/tickets`. Schema: `tickets` (title, description, status,
  assignee, category, priority, created_at, done_at, done_by), `users` (the two of you),
  `comments`, `attachments`.
- **1.2** Create the two accounts; **disable registration**; enable TOTP.
- **1.3** SvelteKit shell installable to the Home Screen; **Tickets** tab.
- **1.4** Quick-add: **title only**, everything else sane defaults (unassigned, Household board,
  no due date). Friction budget: **≤30 seconds, phone in hand.**
- **1.5** Board view (Backlog / Open / In Progress / Waiting / Done) + close action.
- **Exit:** both users logged in over TLS from the Home-Screen PWA; first real ticket filed and
  closed.

### Sprint 2 — Web Push + onboarding
- **2.1** Web Push (VAPID) from the service worker: assignment + comment → push to the other
  phone **with the app closed**.
- **2.2** Shared-vocabulary pass: agree what each status means (e.g., "Waiting" = blocked on the
  other person / an external party); write it in the board description.
- **2.3** Onboarding session: the **household user files the first requests assigned to the
  admin**, and they get completed fast — he experiences the tool working *for* him before he's
  ever asked to do a chore through it.
- **Exit:** filing a ticket buzzes the other phone within seconds; the household user has filed
  ≥1 ticket unprompted.

### Sprint 3 — Time-tracking scoreboard + design pass
- **3.1** Per-person time-to-done, computed from `created_at` / `done_at` / `done_by`.
- **3.2** A **celebratory** scoreboard (streaks, totals, "fastest fix") — **not** a surveillance
  stopwatch. Framing matters: both users are neurodivergent; make it opt-in dopamine, never
  time-pressure. (Consider tracking from *In Progress → Done* as well as *created → Done*, so
  backlog age doesn't distort the numbers.)
- **3.3** Aesthetic polish pass — the show-off moment.
- **Exit:** a screen you'd actually screenshot and share; time metrics visible per person.

### Sprint 4 — Ops hardening (non-negotiable)
- **4.1** Nightly local backup: `pb_data/` (SQLite + attachments) + analyzer state + config
  (`compose.yaml`, pinned tags, Caddyfile) to the second disk.
- **4.2** Weekly `restic` encrypted push offsite.
- **4.3** **Restore drill** — actually restore to a scratch instance and confirm it runs. An
  untested backup is a hope.
- **4.4** Runbook: upgrade procedure, account/CLI commands, restore steps, export steps.
- **Exit:** a restore from backup succeeded on a scratch instance.

### Sprint 5 — Network module
- **5.1** Rebuild the analyzer view as a **Network** tab against its existing Flask API
  (`/api/runs`, `/api/stats`, `/api/device-trend`). Retire its standalone template UI; keep the
  API.
- **5.2** Ticket sink: curated alert → `security`-labelled ticket, deduped, own board, **no
  notification** to the household user (see ARCHITECTURE §9).
- **Exit:** one real or simulated alert creates **exactly one** security ticket; live stats
  render in the tab.

### Sprint 6+ — Quality of life & new modules
- Recurring tickets (HVAC filter, smoke-detector batteries, and the **restore drill as a
  recurring ticket**) — PocketBase cron.
- Christmas / trip planning board (list view for collaborative planning).
- **Media module: Jellyfin** as its own service + tab. Note: media is the one module with real
  hardware implications (transcoding is CPU/GPU-heavy) — size the server for *that*, not for the
  near-zero load of tickets + capture.
- Optional: custom "submit a work order" intake form (tailnet-only; the analyzer already proves
  the API-integration pattern).

## Carried risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Household user abandons the tool | High | Fatal | Sprint 1–2 onboarding built around *his* utility first; day-7 + 30-day checkpoints |
| Backup never tested → unrecoverable loss | Medium | High | Restore drill is a Sprint 4 exit criterion + recurring ticket |
| Alert-spam firehose kills adoption | Medium | High | Curated/deduped ticket sink; separate board; no notify (§9) |
| Push doesn't land on iOS | Medium | High | Web Push validated in Sprint 2, not deferred; ntfy documented fallback |
| Scope creep into endless custom build | Medium | Medium | Sprints have exit criteria; build the frontend, deploy the backends |
| Upgrade breaks a module | Medium | Medium | Pinned tags; dump/snapshot before upgrade; per-module isolation |
