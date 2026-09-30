# Scaling & Data Integrity Fixes — Summary

Historical notes from a scaling / tenant-isolation pass. Treat as a changelog of intent, not a live feature checklist — some items below are **obsolete or never shipped** in the current tree.

## Current product (auth & access)

- **Auth:** Auth.js (NextAuth v5), credentials provider, JWT session with `user.id` and `user.role` (`TRAINER` | `CLIENT`).
- **Middleware:** Session-cookie gate for protected prefixes; no `ACCESS_TOKEN` / shared-secret access gate.
- **Tenant isolation:** Trainers scoped via `Client.trainerId` and `assertTrainerOwnsClient` / `assertClientAccess` in `src/lib/authz.ts`.

## Audit (pre-implementation)

- **Models:** `User`, `Client` (profile), `WorkoutSession`, `Exercise`, `Set`, `ClientWeightRecord`. `TrainerClient` links trainer User to client User (for assignments). Early builds lacked `trainerId` on Client (fixed in the schema change below).
- **Sets:** Server actions do per-row create/update/delete (no “replace all”).
- **Analytics:** Metrics can be computed client-side in charts and via server `GET /api/clients/[id]/metrics`.
- **Export (obsolete claim):** Older notes referred to sync Excel at `/api/export/excel`. **That route and UI are not present.** Current export surface is Whoop-oriented (`/api/export/whoop`), not a general Excel dump.

## What Changed

### Schema

- **Client:** `trainerId String?` (FK to User) for multi-trainer tenant isolation.
- **Exercise / Set:** `orderIndex` for stable ordering.
- **ClientMetricsCache:** `(clientId, rangeKey, computedAt, payloadJson)` for server-side metrics cache; invalidated on session/set/exercise writes.

### Auth / RBAC

- **assertTrainerOwnsClient(clientId):** Trainer may access client only if `client.trainerId === session.user.id` or `client.trainerId == null` (legacy).
- **assertClientAccess:** Trainers go through ownership checks; clients only their linked profile.
- Dashboard and client listing filter by the trainer’s clients.

### Server-side validation

- Zod for mutation inputs where added; sanitization/length limits for notes and names.

### Metrics (server-side + cache)

- **GET /api/clients/[id]/metrics?range=7d|30d|90d:** Volume, estimated 1RM (Epley), PRs; cached in `ClientMetricsCache` with short stale-while-revalidate window.

### Export

- **Status:** Excel export described in earlier drafts is **unimplemented / removed** in this repo.
- Whoop CSV/export for allowlisted client names remains a separate, limited path.

### Pagination

- Sessions list uses cursor-style pagination (`getClientSessionsPaginated`).

### Security

- Notes and names rendered as plain text (no `dangerouslySetInnerHTML`). Auth.js session required for app use.

---

## Files Touched (historical)

| Area | Files |
|------|--------|
| Schema | `prisma/schema.prisma`, related migrations |
| Seed | `prisma/seed.ts` |
| Authz | `src/lib/authz.ts` |
| Actions | `src/app/actions/clients.ts`, `accounts.ts`, `sets.ts`, `sessions.ts`, `exercises.ts` |
| Dashboard | `src/app/dashboard/page.tsx` |
| Metrics | `src/lib/metrics.ts`, `src/app/api/clients/[id]/metrics/route.ts` |
| Validation | `src/lib/schemas.ts` |
| Tests | `src/lib/metrics.test.ts`, `schemas.test.ts`, `authz.test.ts`, action tests under `src/` |

---

## How to run

- Migration: `npx prisma migrate deploy` (or `migrate dev` locally)
- Seed: `npx prisma db seed`
- Metrics: `GET /api/clients/:id/metrics?range=30d`
- Tests: `npm test`
