import PocketBase from 'pocketbase';

// Dev: set VITE_PB_URL=http://127.0.0.1:8090 in apps/shell/.env
// Prod: Caddy routes /api/tickets/* to PocketBase and strips the prefix
//       (handle_path), so a same-origin '/api/tickets' base resolves correctly.
const url = import.meta.env.VITE_PB_URL ?? '/api/tickets';

export const pb = new PocketBase(url);
pb.autoCancellation(false);
