# Workout Tracker MVP

Workout tracking for a personal trainer: clients, sessions, exercises, and sets. PostgreSQL backend, deployable to Vercel.

## Setup (exact terminal commands)

```bash
cd workout-tracker
npm install
cp .env.example .env
# Edit .env and add your DATABASE_URL (PostgreSQL, e.g. from Neon)
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verification checklist

- [ ] `npm install`
- [ ] `cp .env.example .env` and set `DATABASE_URL` and `DIRECT_URL` (see `.env.example`; Neon needs pooled + direct URLs for migrations)
- [ ] `npx prisma generate`
- [ ] `npx prisma migrate deploy`
- [ ] `npm run dev`
- [ ] **Deploy:** See [DEPLOYMENT.md](./DEPLOYMENT.md) for Vercel + Neon
- [ ] **Access gate (production):** Set `ACCESS_TOKEN` in env; requests need `x-access-token` header or `access_token` cookie

## Tech stack

- **Next.js 15** (App Router)
- **TypeScript**
- **Prisma ORM** + **PostgreSQL**
- **TailwindCSS** (minimal styling)
- **Server actions** only (no route handlers for mutations)

## File tree

```
workout-tracker/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
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
