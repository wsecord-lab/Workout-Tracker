import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = { key: string; createdAt: Date };
let rows: Row[] = [];
let now = Date.UTC(2026, 9, 2, 12, 0, 0);

const matches = (r: Row, where: { key?: string; createdAt?: { gte?: Date; lt?: Date } }) =>
  (where.key === undefined || r.key === where.key) &&
  (!where.createdAt?.gte || r.createdAt >= where.createdAt.gte) &&
  (!where.createdAt?.lt || r.createdAt < where.createdAt.lt);

vi.mock("@/lib/db", () => ({
  prisma: {
    loginAttempt: {
      count: vi.fn(async ({ where }) => rows.filter((r) => matches(r, where)).length),
      findMany: vi.fn(async ({ where, skip = 0, take }) =>
        rows
          .filter((r) => matches(r, where))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .slice(skip, take === undefined ? undefined : skip + take)
      ),
      createMany: vi.fn(async ({ data }: { data: { key: string }[] }) => {
        for (const d of data) rows.push({ key: d.key, createdAt: new Date(now) });
        return { count: data.length };
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const before = rows.length;
        rows = rows.filter((r) => !matches(r, where));
        return { count: before - rows.length };
      }),
    },
  },
}));

const MINUTE = 60 * 1000;

async function load() {
  return import("./login-limit");
}

async function fail(username: string, ip: string, times: number) {
  const { recordLoginFailure } = await load();
  for (let i = 0; i < times; i++) await recordLoginFailure(username, ip);
}

beforeEach(() => {
  rows = [];
  now = Date.UTC(2026, 9, 2, 12, 0, 0);
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

describe("login limits", () => {
  it("allows 10 wrong passwords before pausing, so forgetting a password is not punished", async () => {
    const { checkLoginAllowed } = await load();
    await fail("will", "1.1.1.1", 9);
    expect(await checkLoginAllowed("will", "1.1.1.1", now)).toEqual({ allowed: true });
    await fail("will", "1.1.1.1", 1);
    expect(await checkLoginAllowed("will", "1.1.1.1", now)).toEqual({
      allowed: false,
      retryAfterMinutes: 15,
    });
  });

  it("lifts the pause once the old failures age out", async () => {
    const { checkLoginAllowed } = await load();
    await fail("will", "1.1.1.1", 10);
    now += 15 * MINUTE;
    expect(await checkLoginAllowed("will", "1.1.1.1", now)).toEqual({ allowed: true });
  });

  it("reports the real wait when failures were spread out", async () => {
    const { checkLoginAllowed } = await load();
    await fail("will", "1.1.1.1", 1);
    now += 10 * MINUTE;
    vi.setSystemTime(now);
    await fail("will", "1.1.1.1", 9);
    // The first failure ages out 5 minutes from now, dropping the count back under 10.
    expect(await checkLoginAllowed("will", "1.1.1.1", now)).toEqual({
      allowed: false,
      retryAfterMinutes: 5,
    });
  });

  it("a successful sign-in resets the counter for that person on that device", async () => {
    const { checkLoginAllowed, clearLoginFailures } = await load();
    await fail("will", "1.1.1.1", 9);
    await clearLoginFailures("will", "1.1.1.1");
    await fail("will", "1.1.1.1", 9);
    expect(await checkLoginAllowed("will", "1.1.1.1", now)).toEqual({ allowed: true });
  });

  it("one person's failures don't lock out someone else on another network", async () => {
    const { checkLoginAllowed } = await load();
    await fail("will", "1.1.1.1", 10);
    expect(await checkLoginAllowed("davis", "2.2.2.2", now)).toEqual({ allowed: true });
    expect(await checkLoginAllowed("will", "2.2.2.2", now)).toEqual({ allowed: true });
  });

  it("caps one machine guessing across many accounts", async () => {
    const { checkLoginAllowed } = await load();
    for (let i = 0; i < 100; i++) await fail(`user${i}`, "6.6.6.6", 1);
    expect((await checkLoginAllowed("someone-new", "6.6.6.6", now)).allowed).toBe(false);
  });

  it("caps many machines guessing one account", async () => {
    const { checkLoginAllowed } = await load();
    for (let i = 0; i < 100; i++) await fail("davis", `10.0.0.${i}`, 1);
    expect((await checkLoginAllowed("davis", "10.0.1.1", now)).allowed).toBe(false);
  });

  it("never stores usernames or IPs in plain text", async () => {
    await fail("will@example.com", "1.1.1.1", 1);
    for (const r of rows) {
      expect(r.key).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("clientIp", () => {
  it("prefers x-real-ip, then the first x-forwarded-for entry", async () => {
    const { clientIp } = await load();
    expect(clientIp(new Headers({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
