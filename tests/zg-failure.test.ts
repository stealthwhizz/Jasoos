import { beforeAll, describe, expect, it, vi } from "vitest";
import { fixtureBible } from "@/fixtures/world";

// Real mode pointed at a closed local port: every 0G call fails fast with a connection error.
beforeAll(() => {
  vi.stubEnv("USE_FIXTURES", "false");
  vi.stubEnv("ZG_COMPUTE_BASE_URL", "http://127.0.0.1:9/v1");
  vi.stubEnv("ZG_COMPUTE_API_KEY", "sk-test");
  vi.stubEnv("ZG_CHAT_MODEL", "chat-model");
  vi.stubEnv("ZG_IMAGE_MODEL", "image-model");
  vi.resetModules();
});

describe("0G failure injection", () => {
  it("moderation fails closed with a failed ticker event", async () => {
    const { moderate } = await import("@/lib/engine/moderate");
    const r = await moderate("a quiet street");
    expect(r.allowed).toBe(false);
    expect(r.event?.status).toBe("failed");
    expect(r.event?.model).toBe("chat-model");
  }, 15_000);

  it("dialogue still answers in character and still reveals the clue", async () => {
    const { dialogueTurn } = await import("@/lib/engine/dialogueTurn");
    const npc = fixtureBible.locations[0].npc;
    const r = await dialogueTurn(npc, {
      worldId: "w",
      npcId: npc.id,
      message: "hello?",
      history: [
        { role: "player", text: "hi" },
        { role: "npc", text: "..." },
      ],
    });
    expect(r.event.status).toBe("failed");
    expect(r.clueRevealed).toBe(true);
    expect(r.reply).toContain(npc.clue);
  }, 15_000);

  it("image generation throws ZgError carrying the failed event", async () => {
    const { generateImage } = await import("@/lib/engine/generateImage");
    const { ZgError } = await import("@/lib/zg");
    const err = await generateImage("street", "street", "a road", "flat").catch((e) => e);
    expect(err).toBeInstanceOf(ZgError);
    expect(err.event.status).toBe("failed");
  }, 15_000);
});
