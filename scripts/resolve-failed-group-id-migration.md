# One-time fix: failed migration 20260308000000_add_exercise_group_id (P3009)

If Vercel deploy fails with **P3009** (failed migrations in target database), use the automated repair script.

## Option 1: Automated repair (recommended)

Run with the **same DATABASE_URL that Vercel uses** (from Vercel → Settings → Environment Variables):

```bash
DATABASE_URL="postgresql://..." npm run fix:migration
```

Or if your local `.env` already has the production `DATABASE_URL`:

```bash
npm run fix:migration
```

The script will:
1. Check if the `groupId` column exists on the `Exercise` table.
2. If it exists: mark the migration as **applied** (clears failed state).
3. If it does not: mark the migration as **rolled back** (so it will re-run on next deploy; the migration SQL uses `IF NOT EXISTS` so it will succeed).
4. Run `prisma migrate deploy` to confirm.

Then redeploy on Vercel; the build should pass.

## Option 2: Manual resolve

If the `groupId` column **already exists** in production:

```bash
DATABASE_URL="postgresql://..." npx prisma migrate resolve --applied 20260308000000_add_exercise_group_id
```

If the column **does not exist**:

```bash
DATABASE_URL="postgresql://..." npx prisma migrate resolve --rolled-back 20260308000000_add_exercise_group_id
```

Then redeploy.

## Why this happened

The migration added the `groupId` column. It failed in production (e.g. timeout or partial apply), so Prisma recorded it as failed and now refuses to run further migrations (P3009). The repair clears that state so deploy can succeed. The migration file uses `ADD COLUMN IF NOT EXISTS`, so it is safe to re-apply.
