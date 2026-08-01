import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockClientAccess = vi.fn();
const mockWorkoutSessionFindMany = vi.fn();

vi.mock("@/lib/authz", () => ({
  getClientAccessForApi: (...args: unknown[]) => mockClientAccess(...args),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    workoutSession: { findMany: (...args: unknown[]) => mockWorkoutSessionFindMany(...args) },
  },
}));

async function callRoute(clientId: string, query: { sessionDate: string; catalogExerciseId?: string; exerciseName?: string }) {
  const params = new URLSearchParams({ sessionDate: query.sessionDate });
  if (query.catalogExerciseId) params.set("catalogExerciseId", query.catalogExerciseId);
  if (query.exerciseName) params.set("exerciseName", query.exerciseName);
  const url = `https://example.com/api/clients/${clientId}/exercises/previous-session-best?${params}`;
  const request = new NextRequest(url);
  const { GET } = await import("./route");
  return GET(request, { params: Promise.resolve({ id: clientId }) });
}

describe("GET /api/clients/[id]/exercises/previous-session-best", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClientAccess.mockResolvedValue({ allowed: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockClientAccess.mockResolvedValue({ allowed: false, status: 401 });
    const res = await callRoute("client-1", { sessionDate: "2026-03-01T00:00:00Z", exerciseName: "Bench Press" });
    expect(res.status).toBe(401);
  });

  it("serves a CLIENT viewing their own history", async () => {
    // Previously a hard 403 for any client. Clients need to see what to beat.
    mockClientAccess.mockResolvedValue({ allowed: true });
    mockWorkoutSessionFindMany.mockResolvedValue([]);
    const res = await callRoute("client-1", { sessionDate: "2026-03-01T00:00:00Z", exerciseName: "Bench Press" });
    expect(res.status).toBe(200);
  });

  it("returns 403 when the caller does not own the client record", async () => {
    mockClientAccess.mockResolvedValue({ allowed: false, status: 403 });
    const res = await callRoute("client-1", { sessionDate: "2026-03-01T00:00:00Z", exerciseName: "Bench Press" });
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown client", async () => {
    mockClientAccess.mockResolvedValue({ allowed: false, status: 404 });
    const res = await callRoute("nope", { sessionDate: "2026-03-01T00:00:00Z", exerciseName: "Bench Press" });
    expect(res.status).toBe(404);
  });

  it("returns 400 when sessionDate is missing", async () => {
    const url = "https://example.com/api/clients/client-1/exercises/previous-session-best?exerciseName=Bench";
    const res = await (await import("./route")).GET(new NextRequest(url), {
      params: Promise.resolve({ id: "client-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when neither catalogExerciseId nor exerciseName provided", async () => {
    const url = "https://example.com/api/clients/client-1/exercises/previous-session-best?sessionDate=2026-03-01T00:00:00Z";
    const res = await (await import("./route")).GET(new NextRequest(url), {
      params: Promise.resolve({ id: "client-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns found: false when no prior session with that exercise", async () => {
    mockWorkoutSessionFindMany.mockResolvedValue([]);
    const res = await callRoute("client-1", { sessionDate: "2026-03-10T00:00:00Z", exerciseName: "Bench Press" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.found).toBe(false);
  });

  it("returns prior session best when client did exercise in a prior session", async () => {
    mockWorkoutSessionFindMany.mockResolvedValue([
      {
        id: "session-1",
        date: new Date("2026-02-10T00:00:00Z"),
        exercises: [
          {
            id: "ex-1",
            name: "Bench Press",
            catalogExerciseId: "cat-1",
            sets: [
              { weightKg: 80, reps: 8, rpe: 8, notes: null, createdAt: new Date("2026-02-10T12:00:00Z") },
              { weightKg: 84, reps: 6, rpe: null, notes: null, createdAt: new Date("2026-02-10T12:05:00Z") },
            ],
          },
        ],
      },
    ]);
    const res = await callRoute("client-1", {
      sessionDate: "2026-03-10T00:00:00Z",
      catalogExerciseId: "cat-1",
      exerciseName: "Bench Press",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.found).toBe(true);
    expect(json.weight).toBe(84);
    expect(json.reps).toBe(6);
    expect(json.setCount).toBe(2);
    expect(json.performedAt).toBe(new Date("2026-02-10T00:00:00Z").toISOString());
  });

  it("counts sets across every matching exercise instance in that session", async () => {
    mockWorkoutSessionFindMany.mockResolvedValue([
      {
        id: "session-1",
        date: new Date("2026-02-10T00:00:00Z"),
        exercises: [
          {
            id: "ex-1",
            name: "Bench Press",
            catalogExerciseId: "cat-1",
            sets: [{ weightKg: 80, reps: 8, rpe: null, notes: null, createdAt: new Date("2026-02-10T12:00:00Z") }],
          },
          {
            id: "ex-2",
            name: "bench press",
            catalogExerciseId: null,
            sets: [
              { weightKg: 84, reps: 6, rpe: null, notes: null, createdAt: new Date("2026-02-10T12:05:00Z") },
              { weightKg: 84, reps: 5, rpe: null, notes: null, createdAt: new Date("2026-02-10T12:10:00Z") },
            ],
          },
        ],
      },
    ]);
    const res = await callRoute("client-1", { sessionDate: "2026-03-10T00:00:00Z", exerciseName: "Bench Press" });
    const json = await res.json();
    expect(json.setCount).toBe(3);
  });

  it("only queries completed sets", async () => {
    mockWorkoutSessionFindMany.mockResolvedValue([]);
    await callRoute("client-1", { sessionDate: "2026-03-10T00:00:00Z", exerciseName: "Bench Press" });

    // Planned sets carry a target in weightKg/reps; counting them would report
    // a "previous best" the client never actually lifted.
    const setsClause = mockWorkoutSessionFindMany.mock.calls[0][0].include.exercises.include.sets;
    expect(setsClause.where).toEqual({ completedAt: { not: null } });
  });

  it("returns found: false when prior session has matching exercise but no sets", async () => {
    mockWorkoutSessionFindMany.mockResolvedValue([
      {
        id: "session-1",
        date: new Date("2026-02-10T00:00:00Z"),
        exercises: [{ id: "ex-1", name: "Bench Press", catalogExerciseId: "cat-1", sets: [] }],
      },
    ]);
    const res = await callRoute("client-1", { sessionDate: "2026-03-10T00:00:00Z", exerciseName: "Bench Press" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.found).toBe(false);
  });

  it("looks past a session that lists the exercise with no completed sets", async () => {
    // The planned-only session must not shadow the real history behind it.
    mockWorkoutSessionFindMany.mockResolvedValue([
      {
        id: "planned-session",
        date: new Date("2026-03-01T00:00:00Z"),
        exercises: [{ id: "ex-0", name: "Bench Press", catalogExerciseId: "cat-1", sets: [] }],
      },
      {
        id: "real-session",
        date: new Date("2026-02-10T00:00:00Z"),
        exercises: [
          {
            id: "ex-1",
            name: "Bench Press",
            catalogExerciseId: "cat-1",
            sets: [{ weightKg: 80, reps: 8, rpe: null, notes: null, createdAt: new Date("2026-02-10T12:00:00Z") }],
          },
        ],
      },
    ]);
    const res = await callRoute("client-1", { sessionDate: "2026-03-10T00:00:00Z", exerciseName: "Bench Press" });
    const json = await res.json();
    expect(json.found).toBe(true);
    expect(json.weight).toBe(80);
    expect(json.setCount).toBe(1);
    expect(json.performedAt).toBe(new Date("2026-02-10T00:00:00Z").toISOString());
  });
});
