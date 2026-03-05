#!/usr/bin/env bash
# One-time fix for failed migration 20260308000000_add_exercise_group_id (P3009/P3018).
# Run with the DATABASE_URL that Vercel uses (from Vercel → Settings → Environment Variables).
#
# Usage:
#   DATABASE_URL="postgresql://..." ./scripts/resolve-group-id-migration.sh
#   # or
#   export DATABASE_URL="postgresql://..."
#   ./scripts/resolve-group-id-migration.sh

set -e
cd "$(dirname "$0")/.."

if [ -z "$DATABASE_URL" ]; then
  echo "Error: Set DATABASE_URL to your production URL (the one in Vercel env vars)."
  echo "Example: DATABASE_URL=\"postgresql://...\" $0"
  exit 1
fi

echo "Marking migration as rolled back so it can be re-applied on next deploy..."
npx prisma migrate resolve --rolled-back 20260308000000_add_exercise_group_id
echo "Done. Redeploy (e.g. push to git) and the migration will run again with IF NOT EXISTS."
