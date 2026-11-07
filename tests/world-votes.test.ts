import { beforeEach, expect, it, vi } from "vitest";

vi.stubEnv("ARKIV_SIGNER_KEY", ""); // in-memory store
const { gameStore } = await import("@/lib/arkiv");
const { listVisibleGames, voteOnGame } = await import("@/lib/games");

const newWorld = (owner: string, title: string) =>
  gameStore().createGame({ owner, title, idea: title, bible: { title } as never, premise: { title } as never });

beforeEach(() => {
  (globalThis as { __ETHJasoosGameStore?: unknown }).__ETHJasoosGameStore = undefined;
});

it("lists a private world only to its owner; legacy worlds count as public", async () => {
  const open = await newWorld("alice", "Open bazaar");
  const secret = await newWorld("alice", "Secret haveli");
  await gameStore().updateGame(secret.id, { visibility: "private" });

  const forBob = await listVisibleGames("bob");
  expect(forBob.map((g) => g.title)).toEqual(["Open bazaar"]);
  expect(forBob[0].visibility).toBe("public");
  expect((await listVisibleGames("alice")).map((g) => g.id).sort()).toEqual([open.id, secret.id].sort());
  await expect(voteOnGame(secret.id, "bob", 1)).rejects.toMatchObject({ status: 404 });
});

it("counts one vote per human, lets them switch or withdraw it, and blocks self-votes", async () => {
  const world = await newWorld("alice", "Monsoon heist");
  expect(await voteOnGame(world.id, "bob", 1)).toEqual({ up: 1, down: 0, mine: 1 });
  expect(await voteOnGame(world.id, "bob", 1)).toEqual({ up: 1, down: 0, mine: 1 }); // no double count
  expect(await voteOnGame(world.id, "carol", -1)).toEqual({ up: 1, down: 1, mine: -1 });
  expect(await voteOnGame(world.id, "bob", -1)).toEqual({ up: 0, down: 2, mine: -1 });
  expect(await voteOnGame(world.id, "bob", 0)).toEqual({ up: 0, down: 1, mine: 0 });
  await expect(voteOnGame(world.id, "alice", 1)).rejects.toMatchObject({ status: 403 });

  const [item] = await listVisibleGames("carol");
  expect(item.votes).toEqual({ up: 0, down: 1, mine: -1 });
});

it("hides worlds whose first screen image is not stored on this server", async () => {
  const { uploadDataUrl, assetAvailable } = await import("@/lib/games");
  const here = await newWorld("alice", "Built here");
  const elsewhere = await newWorld("alice", "Built on another laptop");
  const onBlob = await newWorld("alice", "On Blob");
  const png = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;
  const localUrl = await uploadDataUrl(`test-owner/${here.id}/s0_0/image`, png);
  await gameStore().updateGame(here.id, { thumbnail_url: localUrl });
  await gameStore().updateGame(elsewhere.id, { thumbnail_url: "/api/assets/someone/else/s0_0/image.jpg" });
  await gameStore().updateGame(onBlob.id, { thumbnail_url: "https://abc.public.blob.vercel-storage.com/x/s0_0/image.png" });

  expect((await listVisibleGames("bob")).map((g) => g.title).sort()).toEqual(["Built here", "On Blob"]);
  expect(await assetAvailable("/api/assets/../../etc/passwd")).toBe(false);
  expect(await assetAvailable(null)).toBe(true); // not built yet: the owner's boot flow handles it
  const { deleteGameAssets } = await import("@/lib/games");
  await deleteGameAssets("test-owner", here.id);
});
