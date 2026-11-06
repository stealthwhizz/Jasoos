import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/screen/route";
import { gameStore } from "@/lib/arkiv";
import type { NewScene } from "@/lib/arkiv";

vi.mock("@/lib/worldid", () => ({ requireUser: async () => null }));

const screen = (x: number, y: number): NewScene => ({
  scene_id: `s${x}_${y}`, kind: "street", x, y,
  data: { id: `s${x}_${y}`, kind: "street", title: "road", ambient: "quiet", hotspots: [], coord: { x, y } },
  image_url: "/api/assets/road.png", annotated_url: null,
});

describe("screen persistence", () => {
  it("loads saved screens, supports replay/upsert, and bounds the world to origin + eight screens", async () => {
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
  it("refuses aliases that would create several screens at one coordinate", async () => {
    await expect(gameStore().upsertScene("alias", { ...screen(0, 0), scene_id: "other" })).rejects.toMatchObject({ status: 422 });
  });
});


it("refuses generation without a verified session", async () => {
  const response = await POST(new NextRequest("http://test/api/screen", { method: "POST", body: "{}" }));
  expect(response.status).toBe(401);
});
