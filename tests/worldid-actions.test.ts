import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRpContext, verifyProof } from "@/lib/worldid";

vi.hoisted(() => {
  process.env.WORLD_APP_ID = "app_test";
  process.env.WORLD_ACTION_ID = "sign-in";
  process.env.WORLD_RP_ID = "rp_test";
  process.env.WORLD_RP_SIGNING_KEY = `0x${"11".repeat(32)}`;
  process.env.WORLD_ENVIRONMENT = "staging";
});

const action = "evidence-world-one";
const proof = () => ({ action, environment: "staging", responses: [{ nullifier: "test-human" }] });
const portal = vi.fn<typeof fetch>();
beforeEach(() => { portal.mockReset(); vi.stubGlobal("fetch", portal); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("per-case World ID action contract (Portal mocked)", () => {
  it("signs a fresh RP context for the requested case instead of the sign-in action", () => {
    const first = createRpContext(action);
    const second = createRpContext("evidence-world-two");
    expect(first.action).toBe(action);
    expect(second.action).toBe("evidence-world-two");
    expect(first.rp_context.rp_id).toBe("rp_test");
    expect(first.rp_context.signature).toMatch(/^0x[0-9a-f]+$/i);
    expect(first.rp_context.nonce).not.toBe(second.rp_context.nonce);
    expect(first.rp_context.expires_at).toBeGreaterThan(first.rp_context.created_at);
    expect(first).not.toHaveProperty("signingKeyHex");
    expect(createRpContext().action).toBe("sign-in");
  });

  it("rejects a sign-in proof or another world's proof before contacting the Portal", async () => {
    for (const wrong of ["sign-in", "evidence-world-two"]) {
      expect(await verifyProof({ ...proof(), action: wrong }, action)).toEqual({ ok: false, reason: "Proof is for another action." });
    }
    expect(portal).not.toHaveBeenCalled();
  });

  it("rejects the wrong environment or multiple humans without network I/O", async () => {
    expect(await verifyProof({ ...proof(), environment: "production" }, action)).toMatchObject({ ok: false });
    expect(await verifyProof({ ...proof(), responses: [{ nullifier: "one" }, { nullifier: "two" }] }, action)).toMatchObject({ ok: false });
    expect(portal).not.toHaveBeenCalled();
  });

  it("forwards the case-bound result unchanged and requires Portal success", async () => {
    portal.mockResolvedValueOnce(Response.json({ success: true }));
    const result = proof();
    expect(await verifyProof(result, action)).toEqual({ ok: true, nullifier: "test-human" });
    expect(portal).toHaveBeenCalledWith("https://developer.world.org/api/v4/verify/rp_test", expect.objectContaining({
      method: "POST", body: JSON.stringify(result), headers: { "Content-Type": "application/json" },
    }));
  });

  it("preserves an unregistered-action refusal without treating it as success or retrying it", async () => {
    // Deliberately synthetic: only a real simulator run can establish the Portal's actual code.
    portal.mockResolvedValueOnce(Response.json({ code: "test_action_rejected" }, { status: 400 }));
    expect(await verifyProof(proof(), action)).toEqual({ ok: false, reason: "World ID rejected the proof (400, test_action_rejected)." });
    expect(portal).toHaveBeenCalledTimes(1);
  });

  it("does not accept HTTP 200 without an affirmative verification result", async () => {
    portal.mockResolvedValueOnce(Response.json({ success: false }));
    expect(await verifyProof(proof(), action)).toMatchObject({ ok: false });
  });

  it("retries a transient Portal failure while retaining the same per-case proof", async () => {
    vi.useFakeTimers();
    portal.mockResolvedValueOnce(Response.json({}, { status: 503 })).mockResolvedValueOnce(Response.json({ success: true }));
    const result = proof();
    const pending = verifyProof(result, action);
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toMatchObject({ ok: true });
    expect(portal).toHaveBeenCalledTimes(2);
    expect(portal.mock.calls.map((call) => call[1]?.body)).toEqual([JSON.stringify(result), JSON.stringify(result)]);
  });
});
