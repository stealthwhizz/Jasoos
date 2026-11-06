import { beforeEach, expect, it, vi } from "vitest";
import { gameStore } from "@/lib/arkiv";
import { getOrGenerateScreen } from "@/lib/games";
import { generateScreen } from "@/lib/world-engine";
import type { GameBible, SceneData } from "@/lib/universe";

vi.hoisted(() => {
  delete process.env.ARKIV_SIGNER_KEY;
  process.env.ASSET_DIR = `${process.env.TMPDIR ?? "/tmp"}/screen-tests-${process.pid}`;
});
vi.mock("@/lib/world-engine", async (original) => ({
  ...await original<typeof import("@/lib/world-engine")>(),
  generateScreen: vi.fn(async (_bible, x, y): Promise<SceneData> => ({
    id: `s${x}_${y}`, kind: "street", coord: { x, y }, title: "road", ambient: "quiet", hotspots: [], image: "data:image/png;base64,iVBORw0KGgo=",
  })),
}));
const owner = { id: "owner" };
let gameId: string;
const bible = { title: "Saved bible", story: { goal: "saved" }, rooms: [] } as unknown as GameBible;
beforeEach(async () => {
  vi.restoreAllMocks(); vi.mocked(generateScreen).mockClear();
  gameId = (await gameStore().createGame({ owner: owner.id, title: "case", idea: "case", bible, premise: {} as never })).id;
});

it("persists before returning and replays to a visitor without another generation", async () => {
  const first = await getOrGenerateScreen({ gameId, x: 0, y: 0, bible: { title: "untrusted" } as GameBible }, owner);
  expect(first.generated).toBe(true);
  expect(first.scene.image).not.toMatch(/^data:/);
  expect(generateScreen).toHaveBeenCalledWith(bible, 0, 0, null, null, [0]);
  expect(await gameStore().listScenes(gameId)).toHaveLength(1);
  expect((await getOrGenerateScreen({ gameId, x: 0, y: 0 }, { id: "visitor" })).generated).toBe(false);
  expect(generateScreen).toHaveBeenCalledTimes(1);
});

it("coalesces simultaneous requests, including persistence", async () => {
  const results = await Promise.all([1, 2].map(() => getOrGenerateScreen({ gameId, x: 0, y: 0 }, owner)));
  expect(results.map((result) => result.generated)).toEqual([true, false]);
  expect(generateScreen).toHaveBeenCalledTimes(1);
});

it("permits origin plus eight additional screens and refuses the next before inference", async () => {
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) await getOrGenerateScreen({ gameId, x, y }, owner);
  expect(generateScreen).toHaveBeenCalledTimes(9);
  await expect(getOrGenerateScreen({ gameId, x: 2, y: 0 }, owner)).rejects.toMatchObject({ status: 422 });
  expect(generateScreen).toHaveBeenCalledTimes(9);
});

it("checks legacy over-cap worlds before calling the model", async () => {
  const existing = Array.from({ length: 8 }, (_, index) => ({ scene_id: `legacy${index}`, kind: "street", data: { hotspots: [] } }));
  vi.spyOn(gameStore(), "listScenes").mockResolvedValue(existing as never);
  await expect(getOrGenerateScreen({ gameId, x: 1, y: 1 }, owner)).rejects.toMatchObject({ status: 422 });
  expect(generateScreen).not.toHaveBeenCalled();
});

it("rejects visitors, missing worlds, missing ids and fractional coordinates before inference", async () => {
  await expect(getOrGenerateScreen({ gameId, x: 0, y: 0 }, { id: "visitor" })).rejects.toMatchObject({ status: 403 });
  await expect(getOrGenerateScreen({ gameId: "missing", x: 0, y: 0 }, owner)).rejects.toMatchObject({ status: 404 });
  await expect(getOrGenerateScreen({ gameId: "", x: 0, y: 0 }, owner)).rejects.toMatchObject({ status: 422 });
  await expect(getOrGenerateScreen({ gameId, x: 0.5, y: 0 }, owner)).rejects.toMatchObject({ status: 422 });
  expect(generateScreen).not.toHaveBeenCalled();
});

it("releases the queue after a generation failure so a retry can complete", async () => {
  vi.mocked(generateScreen).mockRejectedValueOnce(new Error("temporary"));
  await expect(getOrGenerateScreen({ gameId, x: 0, y: 0 }, owner)).rejects.toThrow("temporary");
  expect((await getOrGenerateScreen({ gameId, x: 0, y: 0 }, owner)).generated).toBe(true);
});
