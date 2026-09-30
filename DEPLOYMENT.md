# Deployment: Vercel + PostgreSQL

## Prerequisites

- Node 20.x (pinned in `package.json` `engines`)
- GitHub account
- [Neon](https://neon.tech) account (free tier) or any Postgres provider

---

## 1. Create PostgreSQL database (Neon)

1. Go to [console.neon.tech](https://console.neon.tech)
2. Create a project
3. Copy **both** connection strings:
   - **Pooled** → `DATABASE_URL` (recommended for Next.js serverless)
   - **Direct** (non-pooled) → `DIRECT_URL` for Prisma migrations
4. Hosts look like `ep-xxx.pooler.neon.tech` (pooled) vs `ep-xxx….aws.neon.tech` (direct)

If `DATABASE_URL` points at a pooler (PgBouncer), `prisma migrate deploy` can fail with **P1002** (advisory lock). Set `DIRECT_URL` to the direct connection to fix that.

---

## 2. Local setup and verification

```bash
cd workout-tracker
npm install

cp .env.example .env
# Set DATABASE_URL, DIRECT_URL, AUTH_SECRET

npx prisma generate
npx prisma migrate deploy
npx prisma db seed   # optional sample data

npm run create:trainer   # create a trainer login if needed
npm run dev
```

Confirm you can sign in at `/login`, then optionally `npm run build` locally.

---

## 3. Push to GitHub

```bash
git add -A
git commit -m "Configure for Vercel + Postgres"
git push origin main
```

CI (`.github/workflows/ci.yml`) runs Vitest and TypeScript `tsc --noEmit` on pushes/PRs.

---

## 4. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. **Import** your `workout-tracker` repo
3. Configure:
   - **Framework Preset:** Next.js
   - **Build Command:** `npm run vercel-build` (generate + migrate + `next build`; preferred over plain `npm run build`, which also seeds)
   - **Install Command:** `npm install`
   - **Environment variables:**

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Postgres URL for the app (Neon pooled OK) |
| `DIRECT_URL` | Yes\* | Direct (non-pooled) URL for migrations |
| `AUTH_SECRET` | Yes | Auth.js secret (`openssl rand -base64 32`) |
| `AUTH_URL` | Recommended | Public site URL, e.g. `https://your-app.vercel.app` |

\*Required for Neon pooled setups; omitting it breaks `prisma migrate deploy` on Vercel with P1002.

4. Click **Deploy**

### Auth (required)

Access is gated by **Auth.js** (credentials provider + JWT session cookie). Users must sign in at `/login`. Middleware redirects unauthenticated requests away from protected routes (`/`, `/clients`, `/dashboard`, `/charts`, `/settings`, `/manage-account`).

Create at least one trainer (locally with `npm run create:trainer`, or via seed / DB) before relying on production login.

### Obsolete: `ACCESS_TOKEN` access gate

The old shared-secret gate (`ACCESS_TOKEN` + `x-access-token` header / `access_token` cookie) is **not used**. Do not set `ACCESS_TOKEN` expecting it to protect the app. Auth.js is the only access control.

### Obsolete: Excel export

There is **no** `/api/export/excel` route and no “Export to Excel” product feature. Session export that exists today is the Whoop-oriented `/api/export/whoop` path for specific clients.

---

## 5. Migrations on production

Migrations run during the Vercel build when using `npm run vercel-build` (`prisma migrate deploy` before `next build`). Seed data is **not** applied on Vercel builds; run `npx prisma db seed` against production only when you intentionally want demo data.

Manual migrate:

```bash
DATABASE_URL="your-pooled-url" DIRECT_URL="your-direct-url" npx prisma migrate deploy
```

---

## Backups

PostgreSQL backups are managed by your provider:

- **Neon:** Point-in-time recovery / automatic backups (plan-dependent)
- **Supabase:** Daily backups on supported plans
- Local/scripted dumps: `npm run db:backup` (see `scripts/backup-db.ts`)
