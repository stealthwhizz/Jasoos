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
