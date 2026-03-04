# Deployment: Vercel + PostgreSQL

## Prerequisites

- Node 20.x (pinned in `package.json` engines for Vercel)
- GitHub account
- [Neon](https://neon.tech) account (free tier) or any Postgres provider

---

## 1. Create PostgreSQL database (Neon)

1. Go to [console.neon.tech](https://console.neon.tech)
2. Create a project
3. Copy the **connection string** (pooled recommended for serverless)
4. It looks like: `postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`

---

## 2. Local setup and verification

```bash
# Clone and install
cd workout-tracker
npm install

# Create .env with your DATABASE_URL
cp .env.example .env
# Edit .env and paste your Neon DATABASE_URL

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
     - `DATABASE_URL` = your Neon connection string (paste from step 1)
     - (optional) `ACCESS_TOKEN` for the access gate
4. Click **Deploy**

---

## 5. Run migrations on production

Migrations run automatically via the build command (`prisma migrate deploy && next build`).

Or run manually after first deploy:

```bash
DATABASE_URL="your-production-url" npx prisma migrate deploy
```

---

## Environment variables for Vercel

| Variable       | Required | Description                                      |
|----------------|----------|--------------------------------------------------|
| `DATABASE_URL` | Yes      | PostgreSQL connection string from Neon/Supabase  |
| `ACCESS_TOKEN` | No       | Shared secret for access gate (see below)        |

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
