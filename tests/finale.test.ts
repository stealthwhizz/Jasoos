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

describe("POST /api/finale accusations", () => {
  it("a wrong accusation is a defeat that names the accused, without revealing the culprit", async () => {
    const { status, json } = await finale({ bible: bibleWithCulprit(1), accused: 0 });
    expect(status).toBe(200);
    expect(json.finale.outcome).toBe("defeat");
    expect(json.finale.resolution).toContain("Asha");
    expect(json.finale.resolution).not.toContain("Bilal");
  });

  it("the right accusation wins", async () => {
    const { json } = await finale({ bible: bibleWithCulprit(1), accused: 1 });
    expect(json.finale.outcome).toBe("victory");
    expect(json.generated).toBe(true);
  });

  it("rejects an accused index outside the 3 characters", async () => {
    const { status } = await finale({ bible: bibleWithCulprit(1), accused: 3 });
    expect(status).toBe(422);
  });

  it("judges by the saved bible, not one swapped in by the client", async () => {
    const game = await gameStore().createGame({
      owner: "owner",
      title: "Tiffin",
      idea: "tiffin",
      bible: bibleWithCulprit(2),
      premise: {} as never,
    });
    const { json } = await finale({ bible: bibleWithCulprit(0), accused: 0, gameId: game.id });
    expect(json.finale.outcome).toBe("defeat");
  });

  it("stores the owner's victory sealed and replays it to a visitor without generating", async () => {
    const game = await gameStore().createGame({
      owner: "owner",
      title: "Tiffin",
      idea: "tiffin",
      bible: bibleWithCulprit(1),
      premise: {} as never,
    });
    const won = await finale({ bible: game.bible, accused: 1, gameId: game.id });
    expect(won.json.finale.image).not.toMatch(/^data:/);

    const saved = await gameStore().getGame(game.id);
    expect(saved?.finale.victory).toBeUndefined();
    expect(unseal(saved!.sealed_victory!)).toEqual(won.json.finale);

    player.id = "visitor";
    vi.mocked(generateFinale).mockClear();
    const replay = await finale({ bible: game.bible, accused: 1, gameId: game.id });
    expect(replay.json).toEqual({ finale: won.json.finale, generated: false });
    expect(generateFinale).not.toHaveBeenCalled();
  });
});
