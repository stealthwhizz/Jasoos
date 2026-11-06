import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gameStore } from "@/lib/arkiv";

const state = vi.hoisted(() => ({ count: 0, writes: [] as Array<Record<string, unknown>>, pages: [] as number[], deleted: [] as string[], rows: [] as Array<{ $key: string; record: { value: `0x${string}` } }> }));
vi.hoisted(() => { process.env.ARKIV_SIGNER_KEY = `0x${"11".repeat(32)}`; });
vi.mock("@arkiv-network/sdk", async (original) => ({
  ...await original<typeof import("@arkiv-network/sdk")>(),
  createPublicClient: () => ({
    count() { return { from() { return this; }, where() { return this; }, async fetch() { return BigInt(state.count); } }; },
    select() {
      let offset = 0; let limit = 0;
      return {
        from() { return this; }, where() { return this; }, orderBy() { return this; },
        limit(n: number) { if (n > 100) throw new Error("node maximum 100"); limit = n; return this; },
        offset(n: number) { offset = n; return this; },
        async fetch() { state.pages.push(offset); return { entities: state.rows.slice(offset, offset + limit) }; },
      };
    },
  }),
  createWalletClient: () => ({
    async createEntity(_schema: unknown, attributes: Record<string, unknown>) {
      state.writes.push(attributes); state.count++;
      return { entityKey: `0x${"ab".repeat(32)}` };
    },
    async deleteEntity({ entityKey }: { entityKey: string }) { state.deleted.push(entityKey); } }),
}));

beforeEach(() => {
  state.pages = []; state.deleted = []; state.writes = []; state.count = 0;
  const value = `0x${gzipSync(JSON.stringify({ title: "saved", scene_id: "room", data: {} })).toString("hex")}` as const;
  state.rows = Array.from({ length: 205 }, (_, i) => ({ $key: `0x${i.toString(16).padStart(64, "0")}`, record: { value } }));
});

describe("Arkiv node page limit", () => {
  it("lists all games and scenes beyond two pages without requesting more than 100", async () => {
    expect(await gameStore().listGames()).toHaveLength(205);
    expect(state.pages).toEqual([0, 100, 200]);
    state.pages = [];
    expect(await gameStore().listScenes("world")).toHaveLength(205);
    expect(state.pages).toEqual([0, 100, 200]);
  });
  it("collects every scene key before deletion and removes the parent last", async () => {
    const parent = `0x${"ff".repeat(32)}`;
    await gameStore().deleteGame(parent);
    expect(state.pages).toEqual([0, 100, 200]);
    expect(state.deleted).toEqual([...state.rows.map((r) => r.$key), parent]);
  });
});


it("serializes live accusation checks and writes the exact public contract once", async () => {
  const accusation = { gameId: "world", humanHash: "human", accused: 1, correct: true };
  expect(await Promise.all([gameStore().recordAccusation(accusation), gameStore().recordAccusation(accusation)])).toEqual([true, false]);
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]).toMatchObject({ entityType: "accusation", gameId: "world", humanHash: "human", correct: true });
  expect(state.writes[0].accused).toBeDefined();
});
