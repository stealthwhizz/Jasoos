import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/finale/route";
import { gameStore } from "@/lib/arkiv";
import type { GameBible, Mystery } from "@/lib/universe";
import { generateFinale, seal, unseal } from "@/lib/world-engine";
import type * as WorldEngine from "@/lib/world-engine";
import type * as WorldId from "@/lib/worldid";

// Hoisted above the imports: lib/games reads ASSET_DIR at import time; no signer key = memory store.
vi.hoisted(() => {
  process.env.ASSET_DIR = `${process.env.TMPDIR ?? "/tmp"}/jasoos-test-assets-${process.pid}`;
  delete process.env.ARKIV_SIGNER_KEY;
});

const player = vi.hoisted(() => ({ id: "owner" }));
vi.mock("@/lib/worldid", async (original) => ({
  ...(await original<typeof WorldId>()),
  requireUser: async () => player,
}));

vi.mock("@/lib/world-engine", async (original) => ({
  ...(await original<typeof WorldEngine>()),
  generateFinale: vi.fn(async (_bible: GameBible, outcome: string, reason?: string) => ({
    title: outcome,
    resolution: reason ?? "the truth comes out",
    image: "data:image/png;base64,iVBORw0KGgo=",
    outcome,
  })),
}));

const bibleWithCulprit = (culprit: number) =>
  ({
    title: "Tiffin",
    npcs: [{ name: "Asha" }, { name: "Bilal" }, { name: "Chitra" }],
    story: {
      goal: "Find who wants the tiffin",
      clues: ["a", "b", "c"],
      sealed: seal({ secret: "Bilal hid the ledger in the tiffin.", culprit } satisfies Mystery),
    },
  }) as unknown as GameBible;

const finale = async (body: object) => {
  const res = await POST(
    new NextRequest("http://test/api/finale", { method: "POST", body: JSON.stringify(body) })
  );
  return { status: res.status, json: await res.json() };
};

beforeEach(() => {
  vi.mocked(generateFinale).mockClear();
  player.id = "owner";
});

describe("sealed mystery", () => {
  it("round-trips, hides the plaintext, and rejects a tampered blob", () => {
    const sealed = seal({ secret: "Bilal did it", culprit: 1 });
    expect(unseal<Mystery>(sealed)).toEqual({ secret: "Bilal did it", culprit: 1 });
    expect(Buffer.from(sealed, "base64url").toString("latin1")).not.toContain("Bilal");
    const raw = Buffer.from(sealed, "base64url");
    raw[raw.length - 1] ^= 1;
    expect(() => unseal(raw.toString("base64url"))).toThrow();
  });
});

const newGame = (culprit: number) =>
  gameStore().createGame({
    owner: "owner",
    title: "Tiffin",
    idea: "tiffin",
    bible: bibleWithCulprit(culprit),
    premise: {} as never,
  });

describe("POST /api/finale", () => {
  it("a wrong accusation is a defeat that names the accused, without revealing the culprit", async () => {
    const game = await newGame(1);
    const { status, json } = await finale({ gameId: game.id, accused: 0 });
    expect(status).toBe(200);
    expect(json.finale.outcome).toBe("defeat");
    expect(json.finale.resolution).toContain("Asha");
    expect(json.finale.resolution).not.toContain("Bilal");
  });

  it("stores the victory sealed and replays it to anyone without generating", async () => {
    const game = await newGame(1);
    const won = await finale({ gameId: game.id, accused: 1 });
    expect(won.json).toMatchObject({ finale: { outcome: "victory" }, generated: true });
    expect(won.json.finale.image).not.toMatch(/^data:/);

    const saved = await gameStore().getGame(game.id);
    expect(saved?.finale.victory).toBeUndefined();
    expect(unseal(saved!.sealed_victory!)).toEqual(won.json.finale);

    player.id = "visitor";
    vi.mocked(generateFinale).mockClear();
    const replay = await finale({ gameId: game.id, accused: 1 });
    expect(replay.json).toEqual({ finale: won.json.finale, generated: false });
    expect(generateFinale).not.toHaveBeenCalled();
  });

  it("generates a world's defeat once; later defeats of any kind reuse it", async () => {
    const game = await newGame(2);
    const first = await finale({ gameId: game.id, reason: "time ran out" });
    player.id = "visitor";
    const wrong = await finale({ gameId: game.id, accused: 0 });
    const again = await finale({ gameId: game.id, reason: "time ran out" });
    expect(generateFinale).toHaveBeenCalledTimes(1);
    expect(wrong.json).toEqual({ finale: first.json.finale, generated: false });
    expect(again.json.generated).toBe(false);
  });

  it("rejects a missing game, an unknown game and an accused index outside the 3 characters", async () => {
    const game = await newGame(1);
    expect((await finale({ accused: 1 })).status).toBe(422);
    expect((await finale({ gameId: "0x" + "0".repeat(64), accused: 1 })).status).toBe(404);
    expect((await finale({ gameId: game.id, accused: 3 })).status).toBe(422);
  });
});
