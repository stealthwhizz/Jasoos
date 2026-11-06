import { describe, expect, it } from "vitest";
import { checkIdkitResult, checkPortalReply } from "@/lib/worldid/proof";

const expected = { action: "create-world", environment: "staging" as const };
const proof = (over: Record<string, unknown> = {}) => ({
  protocol_version: "4.0",
  nonce: "0x01",
  action: "create-world",
  environment: "staging",
  responses: [{ identifier: "proof_of_human", proof: ["1", "2", "3", "4", "5"], nullifier: "42" }],
  ...over,
});

describe("World ID proof checks", () => {
  it("returns the nullifier for a matching proof", () => {
    expect(checkIdkitResult(proof(), expected)).toEqual({ ok: true, nullifier: "42" });
  });

  it("rejects a proof for another action", () => {
    expect(checkIdkitResult(proof({ action: "other" }), expected).ok).toBe(false);
  });

  it("rejects a simulator (staging) proof when production is expected", () => {
    const r = checkIdkitResult(proof(), { ...expected, environment: "production" });
    expect(r.ok).toBe(false);
  });

  it("rejects proofs with no responses or conflicting nullifiers", () => {
    expect(checkIdkitResult(proof({ responses: [] }), expected).ok).toBe(false);
    const two = proof({ responses: [{ nullifier: "1" }, { nullifier: "2" }] });
    expect(checkIdkitResult(two, expected).ok).toBe(false);
    expect(checkIdkitResult(null, expected).ok).toBe(false);
  });

  it("accepts only a 200 portal reply with success true", () => {
    expect(checkPortalReply(200, { success: true }).ok).toBe(true);
    expect(checkPortalReply(200, { success: false }).ok).toBe(false);
    expect(checkPortalReply(400, { code: "invalid_proof" })).toEqual({
      ok: false,
      reason: "World ID rejected the proof (400, invalid_proof).",
    });
  });
});
