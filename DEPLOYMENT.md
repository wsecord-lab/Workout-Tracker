# Deployment Guide

## SQLite persistence requirement

**Critical:** SQLite stores data in a single file. The database file **must** be on **persistent storage**. If you deploy to a serverless or ephemeral filesystem, data will be lost on each cold start or redeploy.

### Do NOT use

- Vercel (serverless, ephemeral)
- AWS Lambda (ephemeral)
- Firebase (serverless)
- Any platform where the filesystem is reset between invocations

---

## Railway Deployment (Recommended)

This project is configured for Railway with a Dockerfile and persistent volume for SQLite.

### Prerequisites

1. A [Railway](https://railway.app) account (sign up with GitHub)
2. Your code pushed to a GitHub repository
3. (Optional) [Railway CLI](https://docs.railway.app/guides/cli) installed

### Step-by-step

#### 1. Create a new project on Railway

- Go to [railway.app/new](https://railway.app/new)
- Select **"Deploy from GitHub repo"**
- Connect your GitHub account and select the `Workout-Tracker` repository
- Railway will auto-detect the `Dockerfile` and `railway.toml`

#### 2. Add a persistent volume

This is **critical** — without it your database is lost on every deploy.

- In your Railway service, go to **Settings → Volumes**
- Click **"Add Volume"**
- Set **Mount Path** to `/data`
- Give it a name like `sqlite-data`
- Click **Save**

#### 3. Set environment variables

In your Railway service, go to **Variables** and add:

| Variable | Value | Required |
|---|---|---|
| `DATABASE_URL` | `file:/data/db.sqlite` | Yes |
| `SQLITE_DB_PATH` | `/data/db.sqlite` | Recommended |
| `ACCESS_TOKEN` | A long random secret (32+ chars) | Recommended |
| `NODE_ENV` | `production` | Auto-set by Railway |

Generate an access token:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 4. Deploy

Railway auto-deploys when you push to your default branch. You can also trigger a manual deploy from the Railway dashboard.

The Dockerfile's CMD runs `prisma db push` on every start, so your schema is always up to date.

#### 5. Access the app

- Railway gives you a public URL like `https://workout-tracker-production-xxxx.up.railway.app`
- If you set `ACCESS_TOKEN`, set the cookie in your browser (DevTools → Console):
  ```javascript
  document.cookie = "access_token=YOUR_TOKEN_HERE; path=/; max-age=31536000; SameSite=Lax";
  ```
- Refresh the page.

#### 6. Custom domain (optional)

- In Railway: **Settings → Networking → Custom Domain**
- Add your domain and configure DNS (CNAME to Railway's provided target)

---

### Other hosting options

**Fly.io:**

```toml
# fly.toml
[mounts]
  source = "db_data"
  destination = "/data"
```

```bash
fly secrets set DATABASE_URL="file:/data/db.sqlite"
```

**Render / DigitalOcean / Self-hosted VPS:** Use a persistent disk and set `DATABASE_URL` to an absolute path.

### Configuring the DB path

```bash
# Relative to prisma/schema.prisma (./dev.db = prisma/dev.db)
DATABASE_URL="file:./dev.db"

# Absolute path (recommended for production)
DATABASE_URL="file:/data/db.sqlite"
```

Optional: `SQLITE_DB_PATH` overrides the path used by the backup script. If unset, the backup script parses `DATABASE_URL`.

---

## Backups

The backup script copies the SQLite DB to `backups/` with a timestamped filename.

```bash
npm run db:backup
```

Output: `Backed up /path/to/db.sqlite -> ./backups/dev-2026-02-24T12-30-00.db`

### Nightly backups (cron)

Once hosting is chosen, schedule the backup script via cron or your platform’s scheduler.

**Quick install (runs daily at 2:00 AM):**

```bash
./scripts/install-nightly-backup.sh
```

Or: `npm run db:backup:install`

This adds a cron job that loads `.env` and runs the backup. Backups go to `backups/dev-YYYY-MM-DDTHH-MM-SS.db`.

**Manual cron setup:**

```cron
0 2 * * * /absolute/path/to/workout-tracker/scripts/backup-db.sh
```

The shell script loads `.env` from the project root. For production, ensure `DATABASE_URL` (or `SQLITE_DB_PATH`) is set in `.env` or the cron environment.

---

## Access control (optional gate)

Without full authentication, you can protect the app with a shared secret.

Set `ACCESS_TOKEN` to a long random string (e.g. 32+ chars). In production, if `ACCESS_TOKEN` is set, every request must include it via:

- **Header:** `x-access-token: <ACCESS_TOKEN>`
- **Cookie:** `access_token=<ACCESS_TOKEN>`

### Option A: Reverse proxy

Configure your reverse proxy (nginx, Caddy, Cloudflare Access, etc.) to add the header before forwarding:

**nginx example:**

```nginx
location / {
  proxy_set_header x-access-token "your-long-random-secret";
  proxy_pass http://localhost:3000;
}
```

**Cloudflare Access:** Use an Access policy so only allowed users get through; the app can remain open or you can add a second gate.

### Option B: Cookie (one-time setup)

1. Open the app in your browser.
2. Open DevTools (F12) → Console.
3. Run (replace with your actual token):

```javascript
document.cookie = "access_token=YOUR_ACCESS_TOKEN; path=/; max-age=31536000; SameSite=Lax";
```

4. Refresh the page. The cookie will be sent with subsequent requests.

### Behavior

- **Development:** No gate unless `ACCESS_TOKEN` is set (localhost remains open).
- **Production:** If `ACCESS_TOKEN` is set, requests without a valid token receive 401.
- Static assets (`/_next/*`, `/favicon.ico`) are not gated.
