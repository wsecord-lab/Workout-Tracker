#!/usr/bin/env bash
# Installs a cron job to run db backup nightly at 2am.
# Run from project root: ./scripts/install-nightly-backup.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_SCRIPT="$PROJECT_DIR/scripts/backup-db.sh"
CRON_LINE="0 2 * * * $BACKUP_SCRIPT"

# Make backup script executable
chmod +x "$BACKUP_SCRIPT"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "backup-db.sh"; then
  echo "Nightly backup cron job already installed."
  exit 0
fi

# Add cron job (preserve existing crontab)
(crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
echo "Installed nightly backup at 2:00 AM: $CRON_LINE"
echo "To remove: crontab -e (then delete the backup-db.sh line)"
