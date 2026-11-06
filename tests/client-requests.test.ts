import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchClientJson } from "@/components/clientRequest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("client JSON requests", () => {
  it("returns successful data and preserves the request options", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ reply: "Ask again." }));
    vi.stubGlobal("fetch", fetchMock);
    const options = { method: "POST", body: "{}" };
    const result = await fetchClientJson("/api/dialogue", "Try again.", options);
    expect(result.response.ok).toBe(true);
    expect(result.body).toEqual({ reply: "Ask again." });
    expect(fetchMock).toHaveBeenCalledWith("/api/dialogue", {
      ...options,
      signal: expect.any(AbortSignal),
    });
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

describe("client request deadlines", () => {
  it("aborts a stalled network request and cleans up its deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () => reject(new Error("Aborted")), {
              once: true,
            });
          }),
      ),
    );
    const pending = fetchClientJson("/api/status", "Retry status.", undefined, 50);
    const assertion = expect(pending).rejects.toThrow("Retry status.");
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps the deadline active while a response body stalls", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => ({
        json: () =>
          new Promise((_resolve, reject) =>
            options.signal.addEventListener("abort", () => reject(new Error("Body aborted")), {
              once: true,
            }),
          ),
      })),
    );
    const pending = fetchClientJson("/api/dialogue", "Question saved.", undefined, 50);
    const assertion = expect(pending).rejects.toThrow("Question saved.");
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("forwards caller cancellation without mutating the caller's signal", async () => {
    const parent = new AbortController();
    let child: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options) => {
        child = options.signal;
        return new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () => reject(new Error("Aborted")), {
            once: true,
          }),
        );
      }),
    );
    const pending = fetchClientJson("/api/status", "Cancelled.", { signal: parent.signal });
    const assertion = expect(pending).rejects.toThrow("Cancelled.");
    expect(child).not.toBe(parent.signal);
    parent.abort();
    await assertion;
    expect(child?.aborted).toBe(true);
  });
  it("removes the timer after success and leaves the caller signal active", async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ verified: true })));
    await fetchClientJson("/api/verify", "Retry.", { signal: parent.signal });
    expect(parent.signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
