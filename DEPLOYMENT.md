# Deployment: Vercel + PostgreSQL

## Prerequisites

- Node 20.x (pinned in `package.json` engines for Vercel)
- GitHub account
- [Neon](https://neon.tech) account (free tier) or any Postgres provider

---

## 1. Create PostgreSQL database (Neon)

1. Go to [console.neon.tech](https://console.neon.tech)
2. Create a project
3. Copy **both** connection strings from Neon (or use one twice if you do not use pooling):
   - **Pooled** → use as `DATABASE_URL` (recommended for Next.js serverless).
   - **Direct** (non-pooled) → use as `DIRECT_URL` for Prisma migrations.
4. Example hosts look like `ep-xxx.pooler.neon.tech` (pooled) vs `ep-xxx.us-east-2.aws.neon.tech` (direct).

If `DATABASE_URL` points at a pooler (PgBouncer), `prisma migrate deploy` can fail with **P1002** while waiting for a Postgres advisory lock. Setting `DIRECT_URL` to the direct connection fixes that.

---

## 2. Local setup and verification

```bash
# Clone and install
cd workout-tracker
npm install

# Create .env with DATABASE_URL and DIRECT_URL (see .env.example)
cp .env.example .env
# Edit .env: pooled Neon URL → DATABASE_URL; direct Neon URL → DIRECT_URL

# Generate Prisma client
npx prisma generate

# Run migrations (creates tables)
npx prisma migrate deploy

# Seed with sample data (optional)
npx prisma db seed

# Build and run locally
npm run build
npm run dev
```

---

## 3. Push to GitHub

```bash
git add -A
git commit -m "Configure for Vercel + Postgres"
git push origin main
```

---

## 4. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. **Import** your `workout-tracker` repo
3. Configure:
   - **Framework Preset:** Next.js
   - **Build Command:** `npm run build` (default)
   - **Install Command:** `npm install` (default)
   - **Environment variables:**
     - `DATABASE_URL` = Neon **pooled** connection string (runtime)
     - `DIRECT_URL` = Neon **direct** connection string (migrations during build)
     - (optional) `ACCESS_TOKEN` for the access gate
4. Click **Deploy**

---

## 5. Run migrations on production

Migrations run automatically during the Vercel build (`npm run vercel-build`, which runs `prisma migrate deploy` before `next build`). Seed data is **not** applied on Vercel builds; run `npx prisma db seed` locally or against production when you need demo accounts.

Or run migrations manually:

```bash
DATABASE_URL="your-pooled-url" DIRECT_URL="your-direct-url" npx prisma migrate deploy
```

---

## Environment variables for Vercel

| Variable       | Required | Description                                                                 |
|----------------|----------|-----------------------------------------------------------------------------|
| `DATABASE_URL` | Yes      | PostgreSQL URL for the app (pooled Neon URL is OK).                         |
| `DIRECT_URL`   | Yes\*    | Same DB over a **direct** (non-pooled) URL so migrations can take advisory locks. Use the same value as `DATABASE_URL` only when you are not behind PgBouncer. |
| `ACCESS_TOKEN` | No       | Shared secret for access gate (see below)                                   |

\*Required for Neon pooled setups; omitting it breaks `prisma migrate deploy` on Vercel with P1002.

---

## Access control (optional)

Set `ACCESS_TOKEN` in Vercel env vars. In production, requests must include:

- Header: `x-access-token: <value>`  
- Or cookie: `access_token=<value>`

To set the cookie once in the browser console:
```javascript
document.cookie = "access_token=YOUR_TOKEN; path=/; max-age=31536000; SameSite=Lax";
```

---

## Backups

PostgreSQL backups are managed by your provider:

- **Neon:** Point-in-time recovery, automatic backups on paid plans
- **Supabase:** Daily backups
- For `pg_dump` backup scripts, see your provider's docs
