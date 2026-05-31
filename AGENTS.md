# Tapmeza — Agent Context

This file is the source of truth for any AI coding agent (Antigravity, Cursor, Codex, Claude, etc.) working in this repo. Read it before doing anything. Keep it accurate as the project evolves.

---

## What Tapmeza is

Tapmeza is a multi-tenant QR ordering SaaS for hospitality venues (hotels, restaurants, beach clubs). A customer scans a QR code at their table, sun lounge, or hotel room; a mobile web page opens showing the correct menu for that spot; they order without installing anything or logging in. Venue staff watch incoming orders on a tablet in real time and advance each order through its lifecycle.

Primary market: Zanzibar/Tanzania. Connectivity is often flaky — the Customer App flow must degrade gracefully and never hang silently. Venues may price in TZS or USD.

---

## Components

One codebase, three surfaces. Internal names:

1. **Customer App** — the mobile ordering page reached by scanning a QR code (`/o/[venueSlug]/[qrToken]`). No auth, no install. Shows the correct menu for the scanned spot, lets the customer place an order and track its status. Mobile-first; must work on a mid-range Android phone over 3G.
2. **Staff App** — staff-authed tablet view (`/staff`). Receives incoming orders in real time, marks them as received, and advances each order through its lifecycle (`received → preparing → ready → delivered`, plus cancel).
3. **Admin Portal** — staff-authed surface (`/admin`) for configuring everything: restaurants/venues, menus (categories, items, pricing, availability), zones, QR points/locations, and viewing order history.

---

## Stack

- Next.js 15 (App Router), TypeScript (strict), Tailwind.
- Supabase (Postgres + Auth + Realtime + Storage).
- Google OAuth for Staff App / Admin Portal auth only.
- Deploy target: Vercel.
- Package manager: `pnpm`.

---

## Architecture

- **Base URL** comes from `NEXT_PUBLIC_APP_URL`. Never hardcode the domain.
- A QR code encodes `https://{NEXT_PUBLIC_APP_URL}/o/{venueSlug}/{qrToken}`. `qrToken` is an opaque random token per location — **not** a guessable table number.
- **Customer order placement is the security-critical path.** The customer is unauthenticated, so orders are inserted by a server-side route handler using the Supabase **service role key** (server-only env var). RLS stays fully locked; the service role is only ever used inside server code, never exposed to the client. The route validates the `qrToken`, resolves the venue + location, confirms every ordered item belongs to that venue and is currently available, and **recomputes the order total server-side** — never trust a client-supplied price or total.
- **Realtime** drives the Staff App via Supabase Realtime subscriptions. The **Customer App** order-status view uses polling (`GET /api/orders/{id}/status` every few seconds) rather than realtime, because it is more robust on poor mobile connections — show a clear "reconnecting…" state if a poll fails, never a dead spinner.
- **Money is stored as integer minor units** (e.g. cents/senti), with a `currency` per venue. Never use floats for money.

---

## Data Model

All tables: `uuid` primary keys, `created_at timestamptz default now()`, RLS enabled.

- `venues` — `id`, `slug` (unique), `name`, `currency` (default `'TZS'`), `timezone` (default `'Africa/Dar_es_Salaam'`), `active`.
- `venue_members` — links an `auth.users` id to a `venue_id` with `role` (`owner` | `staff`). Drives all Staff App / Admin Portal access.
- `zones` — `venue_id`, `name` (e.g. "Restaurant", "Pool", "Rooms"), `sort`.
- `locations` — `venue_id`, `zone_id`, `label` (e.g. "Table 4", "Lounge 7", "Room 210"), `qr_token` (unique, random), `active`.
- `menu_categories` — `venue_id`, `name`, `sort`.
- `menu_items` — `venue_id`, `category_id`, `name`, `description`, `price_minor` (integer), `image_url` (nullable), `available` (bool), `available_from` (time, nullable), `available_until` (time, nullable).
- `menu_item_zones` — join table: which zones a `menu_item` is offered in (a pool menu differs from a room-service menu).
- `orders` — `venue_id`, `location_id`, `status` (`received` | `preparing` | `ready` | `delivered` | `cancelled`), `currency`, `total_minor` (integer, server-computed), `guest_note` (nullable — hospitality-standard column name for the note the unauthenticated customer leaves), `settlement` (`pay_at_venue` | `charge_to_room`, default `pay_at_venue`).
- `order_items` — `order_id`, `menu_item_id`, `name_snapshot`, `unit_price_minor_snapshot`, `qty`. Snapshot name and price at order time so later menu edits don't rewrite history.
- `order_events` — **append-only** lifecycle log: `order_id`, `status`, `actor` (nullable staff user id), `at`. Never updated or deleted; the current `orders.status` is the latest event's status.

**RLS rules:** Staff App and Admin Portal reads/writes are allowed only where a `venue_members` row links the authenticated user to that `venue_id`. The Customer App has no authenticated access; all Customer App reads (menu) and writes (order) go through server route handlers using the service role, which validate the `qrToken` first.

---

## Build Phases

### Phase 1 — Scaffold + Customer App order flow + Staff App
1. Scaffold the Next.js 15 App Router project, Tailwind, Supabase client/server helpers, env wiring.
2. Create the schema above as Supabase migrations with RLS policies.
3. Seed one demo venue ("Tapmeza Beach Club", TZS), two zones (Restaurant, Pool), a few locations with QR tokens, one menu with categories and items tagged to zones.
4. **Customer App** at `/o/[venueSlug]/[qrToken]`: resolve location → zone → render the menu filtered by that zone and by current local time against `available_from/until`. Cart with quantities and a note field. "Place order" posts to the server route; show an order-confirmation/status screen that polls for status changes.
5. **Staff App** at `/staff`: staff-authed tablet view subscribed via Realtime to active orders for their venue. New order triggers a sound + visual highlight. Each order card shows location label, items, qty, note, and elapsed time, with buttons to advance status (`received → preparing → ready → delivered`) and a cancel action. Every status change writes an `order_events` row.

### Phase 2 — Admin Portal
- `/admin`: Google OAuth login, venue context from `venue_members`.
- Manage zones, menu categories, and menu items (incl. image upload to Supabase Storage, availability toggle, daypart times, zone tagging).
- Manage locations and **generate printable QR codes** (one per location, encoding the correct URL) using the `qrcode` library; provide a print-friendly sheet.
- Order history with basic filters (date, status, zone).

### Phase 3 — Settlement seam (no live payments in this build)
- Orders settle as `pay_at_venue` or `charge_to_room` only. **Do not integrate any payment provider.** Build a clean, isolated `lib/settlement/` seam (a single interface and a `manualSettlement` implementation) so a real provider (e.g. ClickPesa/Selcom/DPO/M-Pesa or Stripe) can be added later without touching order logic. Leave a clear `// PHASE 2: payment provider` marker at the seam.

---

## Hard Constraints (non-negotiable)

- **Customers never authenticate and never install an app.** If you find yourself adding a Customer App login, stop — that is wrong.
- **Never expose the Supabase service role key to the client.** It lives only in server route handlers / server actions.
- **Never trust client-supplied prices or totals.** Recompute server-side from `menu_items` at order time.
- RLS enabled on every table; verify a non-member cannot read another venue's orders or menu.
- All money as integer minor units; format for display per the venue's `currency`. No floats.
- `order_events` is append-only — no updates or deletes.
- No silent failures anywhere in the Customer App: explicit error and retry states for menu load, order placement, and status polling.
- Multi-tenant and config-driven; no venue-, menu-, or table-specific values baked into code.
- TypeScript strict mode. No `any`. `noUncheckedIndexedAccess: true`.

---

## Implementation Notes

- Env vars: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), Google OAuth client id/secret via Supabase Auth.
- Suggested structure: `app/o/[venueSlug]/[qrToken]/` (Customer App), `app/staff/` (Staff App), `app/admin/` (Admin Portal), `app/api/orders/route.ts` (place order), `app/api/orders/[id]/status/route.ts` (Customer App poll), `lib/supabase/` (server + browser clients), `lib/settlement/`, `supabase/migrations/`.
- Daypart filtering uses the venue `timezone` (default `Africa/Dar_es_Salaam`, EAT/UTC+3), not the server clock.
- Staff App realtime: subscribe to `orders` filtered by `venue_id` and active statuses; on insert/update, refresh the relevant card.
- Mobile-first Customer App UI; large tap targets (min 44px); works on a mid-range Android phone over 3G.

---

## Acceptance criteria (Phase 1)

- Scanning a seeded location's QR opens the correct zone menu in the Customer App.
- Placing an order makes it appear in the Staff App within ~2 seconds.
- Advancing status in the Staff App updates the Customer App status screen on its next poll.
- A user who is not a member of the venue cannot read its orders (verify via SQL as the wrong user).

---

## House rules for the agent

Read these before acting. They override your defaults.

- **Ask before destructive actions.** Never run `supabase db reset`, `rm -rf`, `git push --force`, or anything that drops data without explicit confirmation in chat.
- **Never commit secrets.** `.env.local`, service role keys, OAuth client secrets, and the contents of `.env*` (except `.env.example`) are gitignored and must stay that way. If you see a secret in a diff you're about to commit, stop.
- **Small, reviewable diffs.** Prefer many small focused changes over a sweeping rewrite. One concern per commit; one concern per PR-sized change.
- **Ask before adding a dependency.** No new npm packages without confirming in chat first. If a dep is genuinely needed, explain why and what the lighter alternative is.
- **Match the existing patterns.** Before writing new code, read the surrounding files. Match their structure, naming, and style. Don't introduce a new pattern unless asked.
- **No mock modes, no demo flags, no `if (DEMO)` branches.** Production-first. Seed data lives in `supabase/seed.sql`, not in code.
- **Be honest about uncertainty.** If you don't know whether something will work, say so. Don't fabricate APIs, file paths, function names, or Supabase behaviour. If you need to check a doc, check it.
- **No silent error swallowing.** Every `catch` must do something the user can see — log, surface, retry, or rethrow. Never `catch {}`.
- **Surface every failure in the Customer App.** No dead spinners. Menu load fails → show an error with a retry button. Order POST fails → tell the customer, let them retry. Status poll fails → show "reconnecting…" not infinite loading.
- **Use `pnpm`**, not npm or yarn.
- **Stop and ask when blocked.** If a task is underspecified or you've hit a wall, stop and ask one focused question rather than guessing.
- **Update this file when something changes.** If a build decision shifts (new dependency, schema change, architecture pivot), update AGENTS.md in the same change.

---

## Glossary

- **Customer App** — the QR-reached mobile ordering page used by the venue's patron. Unauthenticated. Internal name only; not user-facing branding.
- **Staff App** — the tablet view used by venue staff to receive and progress orders. Authenticated. Internal name only.
- **Admin Portal** — the console used by venue owners/managers to configure menus, zones, and locations. Authenticated. Internal name only.
- **Venue** — a tenant. A hotel, restaurant, or beach club.
- **Zone** — a service area within a venue ("Restaurant", "Pool", "Rooms"). Drives which menu items are visible.
- **Location** — a specific scannable spot (Table 4, Lounge 7, Room 210). Has a unique `qr_token`.
- **QR token** — opaque random string identifying a location. Not a table number. Not guessable.
- **Settlement** — how the order is paid for. Phase 1: `pay_at_venue` or `charge_to_room`. No payment processor.
- **Daypart** — time-of-day availability window for a menu item (e.g. breakfast 06:00–10:30). Evaluated in the venue's local timezone.
- **TZS / senti** — Tanzanian Shilling and its minor unit. Storage uses minor units as integers.
