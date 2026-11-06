import { afterEach, describe, expect, it, vi } from "vitest";
import { parseWorldIdConfig, postWorldIdProof } from "@/components/worldIdClient";
const config = {
  fixtures: false,
  app_id: "app_test",
  action: "create-world",
  environment: "staging",
  rp_context: {
    rp_id: "rp_test",
    nonce: "test-nonce",
    signature: "test-signature",
    created_at: 100,
    expires_at: 200,
  },
};
afterEach(() => vi.unstubAllGlobals());
describe("identity client transport", () => {
  it("separates explicit fixture mode from a signed live configuration", () => {
    expect(parseWorldIdConfig({ fixtures: true })).toEqual({ fixtures: true });
    expect(parseWorldIdConfig(config)).toEqual(config);
  });
  it.each([
    null,
    {},
    { fixtures: "true" },
    { ...config, fixtures: undefined },
    { ...config, environment: "unknown" },
    { ...config, rp_context: null },
    { ...config, rp_context: { ...config.rp_context, nonce: "" } },
    { ...config, rp_context: { ...config.rp_context, expires_at: 99 } },
  ])("rejects malformed configuration without opening IDKit: %j", (body) =>
    expect(() => parseWorldIdConfig(body)).toThrow("unavailable"),
  );
  it.each([{}, { verified: false }, null])(
    "does not claim verification on a malformed success response: %j",
    async (body) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
      await expect(postWorldIdProof({ fixture: true })).rejects.toThrow("Verification unavailable");
    },
  );
  it("accepts only explicit server verification success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ verified: true })));
    await expect(postWorldIdProof({ fixture: true })).resolves.toBeUndefined();
  });
  it("preserves server rejection messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "Proof expired" }, { status: 400 })),
    );
    await expect(postWorldIdProof({})).rejects.toThrow("Proof expired");
  });
});
