# Workout Tracker

Personal trainer workout tracking for **LifeSport Athletic Club**: clients, sessions, exercises, sets, progress charts, templates, and warmups. PostgreSQL backend, Auth.js (NextAuth v5) credentials login, deployable to Vercel.

## Features

- **Auth:** Auth.js credentials (username/password). Roles: `TRAINER` and `CLIENT`. Middleware protects app routes via session cookie; unauthenticated users are redirected to `/login`.
- **Trainer dashboard:** Client list, manage accounts, exercise catalog, reusable warmup blocks, workout templates.
- **Client sessions:** Log sessions with exercises/sets, RPE, planned sets, session duration, biometrics, calendar view, progress tables and charts.
- **Client portal:** Linked client users see their own profile and history.
- **Exports:** Whoop-oriented session export for specific clients (not a general Excel export).
- **Metrics API:** Server-side volume / E1RM / PR metrics with short-lived cache (`GET /api/clients/[id]/metrics`).

## Setup

```bash
cd workout-tracker
npm install
cp .env.example .env
# Edit .env: DATABASE_URL, DIRECT_URL, AUTH_SECRET (see .env.example)
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run create:trainer   # optional: create a trainer account
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes | Postgres (Neon pooled URL OK for runtime) |
| `DIRECT_URL` | Yes\* | Direct (non-pooled) URL for Prisma migrations |
| `AUTH_SECRET` | Yes in production | `openssl rand -base64 32` |
| `AUTH_URL` | Optional | e.g. `http://localhost:3000` if redirects fail locally |
| `WORKOUT_TRACKER_TRAINER_EMAIL` | For MCP | Trainer the AI tools act as (or use `WORKOUT_TRACKER_TRAINER_ID`) |

\*Required when `DATABASE_URL` uses a pooler (Neon); omit only if you are not behind PgBouncer.

## AI (MCP)

Use Cursor or Claude Desktop against your workouts **without** paying for a separate API — the LLM runs in that app’s plan; this repo only exposes tools.

```bash
# .env: WORKOUT_TRACKER_TRAINER_EMAIL=you@example.com
npm run mcp   # stdio server (Cursor launches this via .cursor/mcp.json)
```

See [mcp/README.md](mcp/README.md) for tools and Claude Desktop config.

**Removed / unused:** `ACCESS_TOKEN` and the old shared-secret access gate (`x-access-token` / `access_token` cookie) are **not enforced**. Auth is Auth.js only. `ACCESS_TOKEN` may still appear in `.env.example` / `getEnv()` as a leftover optional read — setting it has no effect on middleware.

There is **no Excel export** in this codebase. Do not rely on `/api/export/excel` or “Export to Excel” docs from older notes.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next.js dev server |
| `npm test` | Vitest unit tests |
| `npm run lint` | `next lint` (ESLint not preconfigured; may prompt on first run) |
| `npm run build` | Migrate + seed + Next build (local) |
| `npm run vercel-build` | Generate + migrate + Next build (Vercel) |
| `npm run create:trainer` | Interactive trainer account creation |

## Tech stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Prisma** + **PostgreSQL**
- **Auth.js (next-auth v5)** credentials + JWT sessions
- **Tailwind CSS** + LifeSport theme tokens (`src/styles/theme.css`)
- **Vitest** for unit tests
- Server actions for most mutations; a few read/export API routes

## Deploy

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Vercel + Neon.

## Verification

- [ ] `npm install` and env vars set (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`)
- [ ] `npx prisma migrate deploy` + `npm run db:seed` (optional)
- [ ] Sign in as trainer; create a client and a session with exercises/sets
- [ ] Data persists after refresh
- [ ] Client detail shows sessions newest first; charts/progress load
- [ ] `npm test` passes locally (also runs in GitHub Actions CI)
