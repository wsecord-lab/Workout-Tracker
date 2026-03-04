# Migration: add_session_name_set_rpe_catalog

## Backfill (one-time, after applying this migration)

After deploying this migration, run the backfill once to populate `ExerciseCatalog` and set `Exercise.catalogExerciseId` from existing `Exercise.name` values:

```bash
npx tsx scripts/backfill-exercise-catalog.ts
```

This script:

1. Inserts distinct `Exercise.name` values into `ExerciseCatalog` (upsert by name).
2. Updates each `Exercise` row to set `catalogExerciseId` to the matching catalog entry.

Safe to run multiple times (idempotent via upsert).
