import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.fn();
const mockClientFindUnique = vi.fn();
const mockWorkoutSessionFindMany = vi.fn();

vi.mock("@/auth", () => ({ auth: () => mockAuth() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    client: { findUnique: (...args: unknown[]) => mockClientFindUnique(...args) },
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
    mockAuth.mockResolvedValue({ user: { id: "trainer-1", role: "TRAINER" } });
    mockClientFindUnique.mockResolvedValue({ trainerId: "trainer-1" });
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await callRoute("client-1", { sessionDate: "2026-03-01T00:00:00Z", exerciseName: "Bench Press" });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not a trainer", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1", role: "CLIENT" } });
    const res = await callRoute("client-1", { sessionDate: "2026-03-01T00:00:00Z", exerciseName: "Bench Press" });
    expect(res.status).toBe(403);
  });

  it("returns 403 when trainer does not own client", async () => {
    mockClientFindUnique.mockResolvedValue({ trainerId: "other-trainer" });
    const res = await callRoute("client-1", { sessionDate: "2026-03-01T00:00:00Z", exerciseName: "Bench Press" });
    expect(res.status).toBe(403);
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
    expect(json.performedAt).toBe(new Date("2026-02-10T00:00:00Z").toISOString());
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
});
