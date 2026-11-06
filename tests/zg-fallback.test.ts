import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// 0G points at a closed port, so it fails fast; a fake OpenAI server answers instead.
let server: Server;
beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-request-id", "req_backup_1");
    if (req.url?.endsWith("/images/generations")) {
      res.end(JSON.stringify({ created: 0, data: [{ b64_json: "aGk=" }] }));
      return;
    }
    res.end(
      JSON.stringify({
        id: "c1",
        object: "chat.completion",
        created: 0,
        model: "gpt-test",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "hello" } }],
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;

  vi.stubEnv("USE_FIXTURES", "false");
  vi.stubEnv("ZG_COMPUTE_BASE_URL", "http://127.0.0.1:9/v1");
  vi.stubEnv("ZG_COMPUTE_API_KEY", "sk-test");
  vi.stubEnv("ZG_CHAT_MODEL", "chat-model");
  vi.stubEnv("ZG_IMAGE_MODEL", "image-model");
  vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");
  vi.stubEnv("OPENAI_BASE_URL", `http://127.0.0.1:${port}/v1`);
  vi.stubEnv("OPENAI_CHAT_MODEL", "gpt-test");
  vi.resetModules();
});
afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

describe("OpenAI backup", () => {
  it("answers when 0G fails, and logs both attempts", async () => {
    const { zgCall, requestLog } = await import("@/lib/zg");
    const before = requestLog.length;
    const r = await zgCall("dialogue", { messages: [{ role: "user", content: "hi" }] });
    expect(r.data).toBe("hello");
    expect(r.event).toMatchObject({ status: "ok", model: "openai/gpt-test", requestId: "req_backup_1" });
    const attempts = requestLog.slice(before);
    expect(attempts.map((e) => [e.model, e.status])).toEqual([
      ["chat-model", "failed"],
      ["openai/gpt-test", "ok"],
    ]);
  }, 15_000);

  it("generates images through the backup", async () => {
    const { zgCall } = await import("@/lib/zg");
    const r = await zgCall("image", { prompt: "a street", size: "1280x720" });
    expect(r.data).toBe("aGk=");
    expect(r.event.model).toBe("openai/gpt-image-1");
  }, 15_000);

  it("uses only the backup when no 0G key is set", async () => {
    vi.stubEnv("ZG_COMPUTE_API_KEY", "");
    const { zgCall, requestLog } = await import("@/lib/zg");
    const before = requestLog.length;
    await zgCall("dialogue", { messages: [{ role: "user", content: "hi" }] });
    expect(requestLog.slice(before).map((e) => e.model)).toEqual(["openai/gpt-test"]);
    vi.stubEnv("ZG_COMPUTE_API_KEY", "sk-test");
  }, 15_000);
});
