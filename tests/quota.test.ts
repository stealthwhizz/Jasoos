import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryBackend } from "@/lib/arkiv/memory";
import { fixtureManifest } from "@/fixtures/world";

vi.mock("@/lib/worldid", () => ({ getHumanHash: async () => "human-under-test" }));

const HOUR = 60 * 60 * 1000;

describe("daily creation quota", () => {
  it("counts only live creation entities for one human hash", async () => {
    const db = createMemoryBackend();
    await db.publishWorld(fixtureManifest, "alice");
    await db.publishWorld(fixtureManifest, "alice");
    await db.publishWorld(fixtureManifest, "bob");
    expect(await db.countCreations("alice")).toBe(2);
    expect(await db.countCreations("bob")).toBe(1);
    expect(await db.countCreations("carol")).toBe(0);
  });

  it("ignores creations older than 24 hours, and says when the next slot opens", async () => {
    let now = 1_000_000;
    const db = createMemoryBackend(() => now);
    await db.publishWorld(fixtureManifest, "alice");
    now += 2 * HOUR;
    await db.publishWorld(fixtureManifest, "alice");
    expect(await db.nextSlotAt("alice")).toEqual(new Date(1_000_000 + 24 * HOUR));
    now = 1_000_000 + 24 * HOUR + 1;
    expect(await db.countCreations("alice")).toBe(1);
    now += 2 * HOUR;
    expect(await db.countCreations("alice")).toBe(0);
    expect(await db.nextSlotAt("alice")).toBeNull();
  });

  it("counts jobs still running, so parallel requests cannot exceed the limit", async () => {
    const { reserveCreation } = await import("@/lib/arkiv");
    const human = `parallel-${Math.random()}`;
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => reserveCreation(human, 3)));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    // Releasing one (a failed job) frees exactly one slot.
    const first = results.find((r) => r.allowed);
    if (first?.allowed) {
      first.release();
      first.release(); // a second release is a no-op
    }
    expect((await reserveCreation(human, 3)).allowed).toBe(true);
    expect((await reserveCreation(human, 3)).allowed).toBe(false);
  });

  describe("POST /api/worlds", () => {
    beforeEach(() => {
      vi.stubEnv("CREATION_LIMIT_PER_DAY", "3");
    });

    it("returns 429 with Retry-After once the daily limit is used", async () => {
      const { POST } = await import("@/app/api/worlds/route");
      const call = () =>
        POST(new Request("http://x/api/worlds", { method: "POST", body: '{"prompt":"a market"}' }));
      const statuses = [];
      for (let i = 0; i < 4; i++) statuses.push((await call()).status);
      expect(statuses).toEqual([202, 202, 202, 429]);
      const blocked = await call();
      expect(blocked.headers.get("Retry-After")).toBeTruthy();
      expect((await blocked.json()).error).toMatch(/Daily limit reached \(3\/3\)/);
    });
  });
});
