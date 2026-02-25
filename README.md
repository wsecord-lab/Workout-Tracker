# Workout Tracker MVP

Local-first workout tracking for a personal trainer: clients, sessions, exercises, and sets. Data persists in SQLite.

## Setup (exact terminal commands)

```bash
cd workout-tracker
npm install
cp .env.example .env
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verification checklist

- [ ] `npm install`
- [ ] `cp .env.example .env` (required; app reads `DATABASE_URL`)
- [ ] `npx prisma generate`
- [ ] `npm run dev`
- [ ] **Backup script:** `npm run db:backup` → creates `backups/dev-YYYY-MM-DDTHH-MM-SS.db`
- [ ] **Access gate (production):** Set `ACCESS_TOKEN` in env; requests need `x-access-token` header or `access_token` cookie. See [DEPLOYMENT.md](./DEPLOYMENT.md).

## Tech stack

- **Next.js 15** (App Router)
- **TypeScript**
- **Prisma ORM** + **SQLite** (`prisma/dev.db`)
- **TailwindCSS** (minimal styling)
- **Server actions** only (no route handlers for mutations)

## File tree

```
workout-tracker/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── dev.db          (created after db push)
├── src/
│   ├── app/
│   │   ├── actions/
│   │   │   ├── clients.ts
│   │   │   ├── exercises.ts
│   │   │   ├── sessions.ts
│   │   │   └── sets.ts
│   │   ├── clients/
│   │   │   ├── ClientForm.tsx
│   │   │   ├── DeleteClientButton.tsx
│   │   │   ├── new/
│   │   │   │   └── page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       ├── edit/
│   │   │       │   └── page.tsx
│   │   │       ├── AddSessionButton.tsx
│   │   │       ├── AddExerciseForm.tsx
│   │   │       ├── AddSetForm.tsx
│   │   │       ├── ExerciseRow.tsx
│   │   │       ├── SessionBlock.tsx
│   │   │       ├── SetRow.tsx
│   │   │       └── ProgressTables.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   └── lib/
│       ├── db.ts
│       ├── progress.ts
│       └── validations.ts
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
└── tsconfig.json
```

## App verification

- [ ] Can create a client and see it in list
- [ ] Can edit and delete a client
- [ ] Can create a session
- [ ] Can add exercises to session
- [ ] Can add multiple sets
- [ ] Data persists after refresh
- [ ] Data persists after server restart
- [ ] Client detail shows sessions newest first
- [ ] Progress table correctly selects best set per session (highest weightKg; tie-breaker highest reps)
