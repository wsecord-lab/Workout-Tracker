#!/bin/sh
set -e

# Railway mounts volumes as root — fix ownership so nextjs user can write
chown -R nextjs:nodejs /data 2>/dev/null || true

# Run prisma db push + start as nextjs user
exec su-exec nextjs sh -c "npx prisma db push --skip-generate && npm start"
