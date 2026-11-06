import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/games/[id]/evidence/route";
import { gameStore } from "@/lib/arkiv";
import { seal } from "@/lib/world-engine";
import type { GameBible } from "@/lib/universe";

const auth = vi.hoisted(() => ({ user: { id: "human" } as { id: string } | null, valid: true }));
vi.hoisted(() => { delete process.env.ARKIV_SIGNER_KEY; });
vi.mock("@/lib/worldid", async (original) => ({
  ...await original<typeof import("@/lib/worldid")>(),
  requireUser: async () => auth.user,
  devSignInAllowed: false,
  worldIdConfigured: true,
  createRpContext: (action: string) => ({ action }),
  verifyProof: vi.fn(async (proof, action) => proof?.action === action && auth.valid
    ? { ok: true, nullifier: "verified" } : { ok: false, reason: "Proof is for another action." }),
}));

let id: string;
const request = (body?: object) => new Request("http://test/evidence", { method: "POST", body: body ? JSON.stringify(body) : undefined });
const post = (body?: object) => POST(request(body), { params: Promise.resolve({ id }) });
beforeEach(async () => {
  vi.restoreAllMocks();
  auth.user = { id: "human" }; auth.valid = true;
  const game = await gameStore().createGame({ owner: "human", title: "test", idea: "test", premise: {} as never,
    bible: { story: { sealed: seal({ culprit: 1, key: "ABC", evidenceNote: "fallback" }) } } as GameBible });
  id = game.id;
});

describe("evidence unlock", () => {
  it("requires a session for both methods", async () => {
    auth.user = null;
    expect((await post()).status).toBe(401);
    expect((await GET(request(), { params: Promise.resolve({ id }) })).status).toBe(401);
  });
  it("issues a per-case action and rejects a different action", async () => {
    expect(await (await GET(request(), { params: Promise.resolve({ id }) })).json()).toEqual({ dev: false, action: `evidence-${id}` });
    expect((await post({ proof: { action: "sign-in" } })).status).toBe(400);
    expect(await gameStore().hasUnlock(id, "human")).toBe(false);
  });
  it("records the unlock, returns the key, and reopens without another proof", async () => {
    const first = await post({ proof: { action: `evidence-${id}` } });
    expect(first.status).toBe(200);
    expect(await gameStore().hasUnlock(id, "human")).toBe(true);
    expect(await first.json()).toEqual({ key: "ABC", evidenceNote: "fallback", unlocks: 1 });
    expect(await (await post()).json()).toEqual({ key: "ABC", evidenceNote: "fallback", unlocks: 1 });
  });
  it("returns 503 without revealing the key when persistence fails", async () => {
    vi.spyOn(gameStore(), "unlockEvidence").mockRejectedValue(new Error("write failed"));
    const response = await post({ proof: { action: `evidence-${id}` } });
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("key");
  });
});
