import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/screen/route";
import { gameStore } from "@/lib/arkiv";
import type { NewScene } from "@/lib/arkiv";
import type { GameBible } from "@/lib/universe";
import { generateScreen } from "@/lib/world-engine";
import type * as WorldEngine from "@/lib/world-engine";

const player = vi.hoisted(() => ({ current: null as { id: string } | null }));
vi.mock("@/lib/worldid", () => ({ requireUser: async () => player.current }));
vi.mock("@/lib/world-engine", async (original) => ({
  ...(await original<typeof WorldEngine>()),
  generateScreen: vi.fn(async (_b: GameBible, x: number, y: number) => ({ id: `s${x}_${y}`, kind: "street", hotspots: [] })),
}));

const screen = (x: number, y: number): NewScene => ({
  scene_id: `s${x}_${y}`, kind: "street", x, y,
  data: { id: `s${x}_${y}`, kind: "street", title: "road", ambient: "quiet", hotspots: [], coord: { x, y } },
  image_url: "/api/assets/road.png", annotated_url: null,
});

const bible = { story: { goal: "g" }, rooms: [] } as unknown as GameBible;
const newGame = () =>
  gameStore().createGame({ owner: "owner", title: "t", idea: "i", bible, premise: {} as never });
const request = (body: object) =>
  POST(new NextRequest("http://test/api/screen", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  player.current = { id: "owner" };
  vi.mocked(generateScreen).mockClear();
});

describe("screen persistence", () => {
  it("saves origin + eight street screens, replays upserts, and refuses a ninth new one", async () => {
    const store = gameStore();
    const id = `screens-${crypto.randomUUID()}`;
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) await store.upsertScene(id, screen(x, y));
    const saved = await store.listScenes(id);
    expect(saved).toHaveLength(9);
    expect(saved.find((s) => s.scene_id === "s1_1")?.data.coord).toEqual({ x: 1, y: 1 });
    expect((await store.upsertScene(id, screen(1, 1))).created).toBe(false);
    await expect(store.upsertScene(id, screen(2, 0))).rejects.toMatchObject({ status: 422 });
    expect(await store.listScenes(id)).toHaveLength(9);
  });

  it("saves screens beyond the first ring: the overworld is unbounded", async () => {
    const id = `far-${crypto.randomUUID()}`;
    await gameStore().upsertScene(id, screen(0, 0));
    expect((await gameStore().upsertScene(id, screen(3, -2))).created).toBe(true);
  });

  it("refuses aliases that would create several screens at one coordinate", async () => {
    await expect(gameStore().upsertScene("alias", { ...screen(0, 0), scene_id: "other" })).rejects.toMatchObject({ status: 422 });
  });
});

describe("POST /api/screen", () => {
  it("refuses generation without a verified session", async () => {
    player.current = null;
    expect((await request({})).status).toBe(401);
  });

  it("lets only the world's owner generate", async () => {
    const game = await newGame();
    player.current = { id: "visitor" };
    expect((await request({ gameId: game.id, bible, x: 1, y: 0 })).status).toBe(403);
    expect(generateScreen).not.toHaveBeenCalled();
  });

  it("stops at the screen cap before any 0G call", async () => {
    const game = await newGame();
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) await gameStore().upsertScene(game.id, screen(x, y));
    expect((await request({ gameId: game.id, bible, x: 2, y: 0 })).status).toBe(409);
    expect(generateScreen).not.toHaveBeenCalled();
  });

  it("generates for the owner under the cap", async () => {
    const game = await newGame();
    const res = await request({ gameId: game.id, bible, x: 1, y: 0 });
    expect(res.status).toBe(200);
    expect(generateScreen).toHaveBeenCalledTimes(1);
  });
});
