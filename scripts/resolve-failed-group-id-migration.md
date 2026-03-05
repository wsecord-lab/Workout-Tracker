# One-time fix: failed migration 20260308000000_add_exercise_group_id

If deployment failed with **P3018** and "column groupId already exists", do this **once** before redeploying:

1. **Mark the failed migration as rolled back** so Prisma can re-apply it (the migration SQL is now idempotent with `IF NOT EXISTS`):

   ```bash
   DATABASE_URL="your-production-database-url" npx prisma migrate resolve --rolled-back 20260308000000_add_exercise_group_id
   ```

   Use the same `DATABASE_URL` as in your Vercel project (e.g. from Vercel → Project → Settings → Environment Variables).

2. **Redeploy** (e.g. push to git or trigger deploy in Vercel). `prisma migrate deploy` will run the migration again; it will succeed because the migration now uses `ADD COLUMN IF NOT EXISTS`.

After that, you can delete this file if you want.
