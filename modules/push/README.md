# Push module

Delivers **Web Push** notifications to phones on ticket assignment and new comments.

Web Push can't be sent from the static frontend (it needs the VAPID private key), so this is
a tiny server-side worker: it authenticates to PocketBase, subscribes to `tickets` and
`comments` realtime, and pushes to the assignee's registered devices via the Web Push
protocol. Dead subscriptions (HTTP 404/410) are pruned automatically.

## Why Web Push (not ntfy)

Payloads are end-to-end encrypted and delivered by the browser's own push service (APNs on
iOS 16.4+ for a home-screen PWA). Nothing transits a third party — the security-optimal option.
See [ARCHITECTURE.md](../../ARCHITECTURE.md) §11.

## Setup

```bash
# 1. generate one VAPID key pair for the whole platform
npx web-push generate-vapid-keys
#    → put PUBLIC in apps/shell/.env  (VITE_VAPID_PUBLIC_KEY)
#    → put BOTH  in modules/push/.env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)

# 2. run it (PocketBase must be up with a superuser)
cd modules/push && npm install && npm start
```

Then in the app, sign in and tap the **bell** in the top bar to enable alerts (grants
notification permission and registers the device). On iPhone the app must be **installed to the
Home Screen** first (iOS requirement for Web Push).

## Deploy

Built by [`Dockerfile`](Dockerfile); add as a service in the root `compose.yaml` alongside
PocketBase. Holds the VAPID **private** key via env — never commit it.
