# Scaling & Data Integrity Fixes — Summary

## Audit (pre-implementation)

- **Auth:** NextAuth v5 (Auth.js), credentials provider, JWT session with `user.id` and `user.role` (TRAINER | CLIENT).
- **Models:** `User`, `Client` (profile), `WorkoutSession`, `Exercise`, `Set`, `ClientWeightRecord`. `TrainerClient` links trainer User to client User (for assignments), not to Client profile. No `trainerId` on Client → no tenant isolation; dashboard shows all clients.
- **Sets:** Server actions only do per-row create/update/delete (no "replace all"). Overwrite risk: wrong `exerciseId` from client or missing ordering; adding `orderIndex` and strict validation reduces risk.
- **Analytics:** E1RM, volume, PRs computed client-side in `WeightCharts.tsx` from fetched sessions.
- **Export:** Sync Excel in `/api/export/excel`; can time out on very large data.

## What Changed

### Schema
- **Client:** Added `trainerId String?` (FK to User) for multi-trainer tenant isolation. Existing clients get `trainerId` set in seed/migration to first trainer.
- **Exercise:** Added `orderIndex Int @default(0)` for stable ordering within a session.
- **Set:** Added `orderIndex Int @default(0)` for stable ordering within an exercise.
- **ClientMetricsCache:** New table `(clientId, rangeKey, computedAt, payloadJson)` for server-side metrics cache. Invalidated on session/set/exercise writes for that client.

### Auth / RBAC
- **assertTrainerOwnsClient(clientId):** Trainer may access client only if `client.trainerId === session.user.id` or `client.trainerId == null` (legacy).
- **assertClientAccess:** For TRAINER role, now calls `assertTrainerOwnsClient(clientId)` so trainers see only their clients.
- Dashboard, `listClientsBasic`, `listUnlinkedClients`, `listClientAccounts`, createClientLoginAndLink (when linking existing client), and export filter by trainer’s clients.

### Server-side validation
- Zod used for mutation inputs where added (e.g. set create/update, session create). Existing validators in `lib/validations` and `lib/sanitize` retained; server actions validate and never trust client input.
- Input length limits and sanitization (notes, names) enforced server-side.

### Metrics (server-side + cache)
- **GET /api/clients/[id]/metrics?range=7d|30d|90d:** Returns total volume, estimated 1RM (Epley) per exercise, PRs. Computed from DB; result stored in `ClientMetricsCache` by `(clientId, rangeKey)`. Cache invalidated on any session/set/exercise change for that client. Stale-while-revalidate: if cache age < 5 min, return cache; else recompute and update cache.

### Export
- Export remains synchronous; UI shows “Preparing export…” and disables button while request is in flight to avoid double submission and give feedback.
- Optional row limits (e.g. max 5000 per sheet) documented to avoid timeouts; no queue or async job for now.

### Pagination
- Sessions list already uses cursor-style pagination via `getClientSessionsPaginated` (take + 1, hasMore). No change to API; client page already uses `LoadMoreSessions`.

### Security
- Notes and names rendered as plain text (no `dangerouslySetInnerHTML`). Input length and sanitization enforced. Optional lightweight rate limit on login route.

---

## Files Touched

| Area | Files |
|------|--------|
| Schema | `prisma/schema.prisma`, `prisma/migrations/20260306000000_add_trainer_tenant_order_metrics/migration.sql` |
| Seed | `prisma/seed.ts` (trainerId on new clients, updateMany for legacy null trainerId) |
| Authz | `src/lib/authz.ts` (assertTrainerOwnsClient, assertClientAccess uses it for TRAINER) |
| Actions | `src/app/actions/clients.ts`, `src/app/actions/accounts.ts`, `src/app/actions/sets.ts`, `src/app/actions/sessions.ts`, `src/app/actions/exercises.ts` |
| Dashboard | `src/app/dashboard/page.tsx` (filter clients by trainerId) |
| Export | `src/app/api/export/excel/route.ts` (filter by trainerId), `src/components/ExportToExcelCard.tsx` (progress UI + fetch-based download) |
| Metrics | `src/lib/metrics.ts`, `src/app/api/clients/[id]/metrics/route.ts`, cache invalidation in set/session/exercise actions |
| Validation | `src/lib/schemas.ts` (Zod schemas for set/session/clientId) |
| Tests | `src/lib/metrics.test.ts`, `src/lib/schemas.test.ts`, `src/lib/authz.test.ts`, `src/app/actions/sets.test.ts` |

---

## How to run

- Migration: `npx prisma migrate dev --name add-trainer-tenant-metrics-cache`
- Seed: `npx prisma db seed` (sets `trainerId` for existing clients)
- Metrics: `GET /api/clients/:id/metrics?range=30d`
- Export: Use “Export to Excel” from Manage Accounts; UI shows progress and disables button while exporting.
