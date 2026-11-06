import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchClientJson } from "@/components/clientRequest";

afterEach(() => vi.unstubAllGlobals());

describe("client JSON requests", () => {
  it("returns successful data and preserves the request options", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ reply: "Ask again." }));
    vi.stubGlobal("fetch", fetchMock);
    const options = { method: "POST", body: "{}" };
    const result = await fetchClientJson("/api/dialogue", "Try again.", options);
    expect(result.response.ok).toBe(true);
    expect(result.body).toEqual({ reply: "Ask again." });
    expect(fetchMock).toHaveBeenCalledWith("/api/dialogue", options);
  });

  it("preserves HTTP error feedback and moderation evidence for the caller", async () => {
    const body = { error: "Creation paused.", event: { requestId: "fixture-request" } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body, { status: 503 })));
    const result = await fetchClientJson("/api/worlds", "Try again.");
    expect(result.response.status).toBe(503);
    expect(result.response.ok).toBe(false);
    expect(result.body).toEqual(body);
  });

  it("converts transport failures into actionable feedback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(
      fetchClientJson("/api/verify", "Verification unavailable. Try again."),
    ).rejects.toThrow("Verification unavailable. Try again.");
  });

  it("handles non-JSON gateway responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad Gateway", { status: 502 })));
    await expect(fetchClientJson("/api/worlds", "Could not start. Try again.")).rejects.toThrow(
      "Could not start. Try again.",
    );
  });

  it.each([{ body: null }, { body: [] }, { body: "unexpected" }])(
    "rejects invalid JSON response shapes: $body",
    async ({ body }) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
      await expect(fetchClientJson("/api/status", "Retry status.")).rejects.toThrow(
        "Retry status.",
      );
    },
  );
});
