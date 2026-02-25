# Deployment Guide

## SQLite persistence requirement

**Critical:** SQLite stores data in a single file. The database file **must** be on **persistent storage**. If you deploy to a serverless or ephemeral filesystem, data will be lost on each cold start or redeploy.

### Do NOT use

- Vercel (serverless, ephemeral)
- AWS Lambda (ephemeral)
- Any platform where the filesystem is reset between invocations

### Recommended hosting patterns

**Option A: Single instance + persistent volume**

- **Railway**: Add a volume, mount at `/data`, set `DATABASE_URL=file:/data/db.sqlite`
- **Render**: Use a persistent disk (if available for your plan)
- **Fly.io**: Use a volume: `fly volumes create db_data`, mount at `/data`
- **DigitalOcean App Platform**: Use a persistent storage component
- **Self-hosted VPS** (DigitalOcean, Linode, etc.): DB file on the server disk

**Option B: Configuring the DB path**

Set `DATABASE_URL` in your environment:

```bash
# Relative to prisma/schema.prisma (./dev.db = prisma/dev.db)
DATABASE_URL="file:./dev.db"

# Absolute path (recommended for production)
DATABASE_URL="file:/var/data/workout-tracker/db.sqlite"
```

Optional: `SQLITE_DB_PATH` overrides the path used by the backup script (e.g. `/var/data/workout-tracker/db.sqlite`). If unset, the backup script parses `DATABASE_URL` to get the file path.

**Example: Fly.io with volume**

```toml
# fly.toml
[mounts]
  source = "db_data"
  destination = "/data"
```

```bash
# Set in Fly secrets
fly secrets set DATABASE_URL="file:/data/db.sqlite"
```

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
