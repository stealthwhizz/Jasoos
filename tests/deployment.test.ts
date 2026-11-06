import { describe, expect, it } from "vitest";
import { checkDeploymentEnvironment } from "../scripts/check-deploy.mjs";
import { GET } from "@/app/api/health/route";

const configured = {
  ZG_COMPUTE_API_KEY: "test-model-key", SESSION_SECRET: "s".repeat(40),
  WORLD_APP_ID: "app_test", WORLD_RP_ID: "rp_test", WORLD_RP_SIGNING_KEY: "test-rp-key",
  WORLD_ENVIRONMENT: "production", ARKIV_SIGNER_KEY: `0x${"11".repeat(32)}`,
  ASSET_DIR: "/data/assets", FREE_GAME_LIMIT: "3",
};
describe("deployment preflight", () => {
  it("accepts configured production or an explicit demo-player quota bypass", () => {
    expect(checkDeploymentEnvironment(configured)).toEqual([]);
    expect(checkDeploymentEnvironment({ ...configured, FREE_GAME_LIMIT: "0", UNLIMITED_PLAYERS: "demo-human" })).toEqual([]);
  });
  it("refuses staging, ephemeral relative assets, missing signer and creation disabled", () => {
    const failures = checkDeploymentEnvironment({ ...configured, WORLD_ENVIRONMENT: "staging", ASSET_DIR: ".data/assets", ARKIV_SIGNER_KEY: "", FREE_GAME_LIMIT: "0" });
    expect(failures).toHaveLength(4);
    expect(failures.join("\n")).toContain("WORLD_ENVIRONMENT");
    expect(failures.join("\n")).toContain("ASSET_DIR");
    expect(failures.join("\n")).not.toContain(configured.SESSION_SECRET);
  });
  it("rejects a short sealing secret and a pasted address instead of a private key", () => {
    const failures = checkDeploymentEnvironment({ ...configured, SESSION_SECRET: "short-secret", ARKIV_SIGNER_KEY: `0x${"11".repeat(20)}` });
    expect(failures).toHaveLength(2);
    expect(failures.join("\n")).not.toContain("short-secret");
  });
});
it("serves a public, noncached liveness response without external services", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ status: "ok" });
});
