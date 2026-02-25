#!/usr/bin/env bash
# Nightly backup script. Loads .env and runs backup.
# Use from cron: 0 2 * * * /path/to/workout-tracker/scripts/backup-db.sh

set -e
cd "$(dirname "$0")/.."

# Load .env if present
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

npx tsx scripts/backup-db.ts
