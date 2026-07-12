# Pilot quickstart (Docker)

Run the platform **today** on any always-on machine with Docker + Tailscale — no
dedicated server needed. You get tickets, the dashboard, and Web Push on both iPhones over a
real HTTPS `ts.net` URL. When the real hardware is ready, the same stack lifts over and the
PocketBase data migrates with it.

**Exit criterion:** both iPhones have the app on their home screen, signed in, and a ticket
assigned to one person buzzes the other's phone.

> Placeholders: `<TS_NAME>` = this box's Tailscale MagicDNS name (e.g. `pilot.tailXXXX.ts.net`).

## 0. Prereqs

- Docker + Compose v2 on the pilot box.
- **Tailscale** on the box **and both iPhones**, same tailnet.
- In the Tailscale admin console: **MagicDNS** and **HTTPS Certificates** enabled (one-time).
- Node 20+ on the box for the one build step (or use the Docker one-liner in step 3).

## 1. Get the code

```bash
git clone https://github.com/coramb2/home-server-platform.git
cd home-server-platform
```

## 2. Secrets & env

```bash
cp .env.example .env
cp apps/shell/.env.example apps/shell/.env

# Generate one VAPID key pair for push:
npx web-push generate-vapid-keys
```

Edit **`.env`** (root) — used by the push service:

```
PB_ADMIN_EMAIL=you@house.local
PB_ADMIN_PASSWORD=<a strong password>
VAPID_PUBLIC_KEY=<public key from above>
VAPID_PRIVATE_KEY=<private key from above>
VAPID_SUBJECT=mailto:you@house.local
```

Edit **`apps/shell/.env`** — baked into the frontend at build time:

```
VITE_VAPID_PUBLIC_KEY=<the same public key>
```

(Leave `VITE_PB_URL` unset/commented — in the stack the app talks to same-origin `/api/tickets`.)

## 3. Build the frontend

```bash
cd apps/shell && npm ci && npm run build && cd ../..
```

No Node on the box? Build it in a container instead:

```bash
docker run --rm -v "$PWD/apps/shell:/app" -w /app node:22-alpine \
  sh -c "npm ci && npm run build"
```

## 4. Bring up the stack

```bash
docker compose -f compose.pilot.yaml up -d --build
docker compose -f compose.pilot.yaml ps      # caddy, pocketbase, push should be Up
```

The stack now listens on `127.0.0.1:8080` (localhost only).

## 5. Create the two accounts

```bash
# superuser (admin) for PocketBase:
docker compose -f compose.pilot.yaml exec pocketbase \
  pocketbase superuser upsert "$PB_ADMIN_EMAIL" "<your PB_ADMIN_PASSWORD>" --dir /pb/pb_data
```

Then create the two household users — either in the PocketBase admin UI once step 6 is up
(`https://<TS_NAME>/api/tickets/_/` → Collections → users → New), or run the seed script from
the box:

```bash
PB_URL=http://127.0.0.1:8080/api/tickets SU_EMAIL="$PB_ADMIN_EMAIL" SU_PASS="<pw>" \
  bash modules/tickets/scripts/seed-dev.sh
```

## 6. Expose it over HTTPS (Tailscale)

```bash
sudo tailscale serve --bg 8080
tailscale serve status          # shows https://<TS_NAME> -> 127.0.0.1:8080
```

That gives a **trusted** `https://<TS_NAME>` on your tailnet — no cert warnings, exactly what
iOS needs for PWA install + push.

## 7. Install on both phones

On **each** iPhone (both on the tailnet):

1. Open `https://<TS_NAME>/` in Safari.
2. Share → **Add to Home Screen**. The HouseOS icon lands next to Messages.
3. Open it from the home screen, sign in.
4. Tap the **bell** in the top bar → allow notifications. (iOS only allows push from the
   home-screen app, so do step 2 first.)

## 8. Test the loop

From one account, file a ticket and assign it to the other person. Their phone should buzz
within seconds. That's the whole thing working.

## Turning it off / logs

```bash
docker compose -f compose.pilot.yaml logs -f push     # watch push deliveries
docker compose -f compose.pilot.yaml down             # stop (data kept in the pb_data volume)
```

## Later: migrate to the real server

1. On the pilot box: `docker compose -f compose.pilot.yaml exec pocketbase \`
   `tar czf - -C /pb pb_data > pb_data_backup.tgz` (or copy the `pb_data` volume).
2. Run [docs/sprint-0.md](sprint-0.md) on the server, restore `pb_data`, and bring up the full
   `compose.yaml` (with Caddy + the Tailscale cert). Point the **same** `ts.net` name at the
   server so the phones don't notice the move.
