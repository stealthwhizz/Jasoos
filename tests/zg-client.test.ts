import { describe, expect, it, vi } from "vitest";
import { generateContentWithRetry, withRequestIds } from "@/lib/zg-client";

vi.hoisted(() => {
  process.env.ZG_COMPUTE_API_KEY = "sk-test";
});

// The 0G router answers like OpenAI, plus an x_0g_trace extension carrying the request ID.
vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        create: async (req: { messages: Array<{ content: string }> }) => {
          await Promise.resolve(); // yield, so the two overlapping runs interleave
          const prompt = req.messages.at(-1)!.content;
          return { choices: [{ message: { content: "ok" } }], x_0g_trace: { request_id: `id-${prompt}` } };
        },
      },
    };
  },
}));

describe("withRequestIds", () => {
  it("returns only the 0G request IDs of calls made inside it, even when requests overlap", async () => {
    const run = (name: string) =>
      withRequestIds(async () => {
        await generateContentWithRetry({ contents: `${name}-1` });
        await generateContentWithRetry({ contents: `${name}-2` });
        return name;
      });
    const [a, b] = await Promise.all([run("a"), run("b")]);
    expect(a.requestIds.map((r) => r.requestId)).toEqual(["id-a-1", "id-a-2"]);
    expect(b.requestIds.map((r) => r.requestId)).toEqual(["id-b-1", "id-b-2"]);
    expect(a.requestIds[0]!.model).toBeTruthy();

    // Calls outside any route request are not logged anywhere.
    await generateContentWithRetry({ contents: "loose" });
    expect(a.requestIds).toHaveLength(2);
  });
});
