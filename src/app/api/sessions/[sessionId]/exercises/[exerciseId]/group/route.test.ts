import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetSessionAccessForApi = vi.fn();
const mockExerciseFindFirst = vi.fn();
const mockExerciseUpdate = vi.fn();

vi.mock("@/lib/authz", () => ({
  getSessionAccessForApi: (...args: unknown[]) => mockGetSessionAccessForApi(...args),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    exercise: {
      findFirst: (...args: unknown[]) => mockExerciseFindFirst(...args),
      update: (...args: unknown[]) => mockExerciseUpdate(...args),
    },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function callRoute(sessionId: string, exerciseId: string, body: { groupId: string | null }) {
  const { POST } = await import("./route");
  const request = new NextRequest("https://example.com", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  return POST(request, { params: Promise.resolve({ sessionId, exerciseId }) });
}

describe("POST /api/sessions/[sessionId]/exercises/[exerciseId]/group", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionAccessForApi.mockResolvedValue({ allowed: true, clientId: "client-1" });
    mockExerciseFindFirst.mockResolvedValue({ id: "ex-1" });
    mockExerciseUpdate.mockResolvedValue({});
  });

  it("returns 403 when session access denied", async () => {
    mockGetSessionAccessForApi.mockResolvedValue({ allowed: false });
    const res = await callRoute("session-1", "ex-1", { groupId: "g1" });
    expect(res.status).toBe(403);
    expect(mockExerciseFindFirst).not.toHaveBeenCalled();
  });

  it("assigns group and returns 200 when allowed", async () => {
    const res = await callRoute("session-1", "ex-1", { groupId: "g1" });
    expect(res.status).toBe(200);
    expect(mockExerciseUpdate).toHaveBeenCalledWith({
      where: { id: "ex-1" },
      data: { groupId: "g1" },
    });
  });

  it("ungroups when groupId is null", async () => {
    const res = await callRoute("session-1", "ex-1", { groupId: null });
    expect(res.status).toBe(200);
    expect(mockExerciseUpdate).toHaveBeenCalledWith({
      where: { id: "ex-1" },
      data: { groupId: null },
    });
  });

  it("returns 404 when exercise not in session", async () => {
    mockExerciseFindFirst.mockResolvedValue(null);
    const res = await callRoute("session-1", "ex-1", { groupId: "g1" });
    expect(res.status).toBe(404);
  });
});
