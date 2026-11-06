import { afterEach, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({
  put: vi.fn(async (pathname: string) => ({ url: `https://abc123.public.blob.vercel-storage.com/${pathname}` })),
  list: vi.fn(async () => ({ blobs: [{ url: "https://abc123.public.blob.vercel-storage.com/o/g/image.png" }] })),
  del: vi.fn(async () => undefined),
}));
vi.mock("@vercel/blob", () => blob);

const { deleteGameAssets, fetchImageAsBase64, uploadDataUrl } = await import("@/lib/games");
const png = `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`;

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("saves generated images to Vercel Blob at a stable path when the Blob token is set", async () => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token");
  const url = await uploadDataUrl("owner/game/scenes/s0_0/image", png);
  expect(url).toBe("https://abc123.public.blob.vercel-storage.com/owner/game/scenes/s0_0/image.png");
  expect(blob.put).toHaveBeenCalledWith("owner/game/scenes/s0_0/image.png", expect.any(Buffer),
    expect.objectContaining({ access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "image/png" }));
});

it("reads back only Blob URLs, never arbitrary hosts", async () => {
  const fetchMock = vi.fn(async () => new Response("png-bytes"));
  vi.stubGlobal("fetch", fetchMock);
  expect(await fetchImageAsBase64("https://abc123.public.blob.vercel-storage.com/o/g/image.png"))
    .toBe(Buffer.from("png-bytes").toString("base64"));
  expect(await fetchImageAsBase64("https://evil.example.com/image.png")).toBeNull();
  expect(await fetchImageAsBase64("https://abc123.public.blob.vercel-storage.com.evil.com/x.png")).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("deletes a world's Blob images by prefix", async () => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token");
  await deleteGameAssets("o", "g");
  expect(blob.list).toHaveBeenCalledWith({ prefix: "o/g/" });
  expect(blob.del).toHaveBeenCalledWith(["https://abc123.public.blob.vercel-storage.com/o/g/image.png"]);
});

it("keeps using local disk when no Blob token is set", async () => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  vi.stubEnv("ASSET_DIR", "");
  const url = await uploadDataUrl("test-owner/test-game/blob-test", png);
  expect(url).toBe("/api/assets/test-owner/test-game/blob-test.png");
  expect(blob.put).not.toHaveBeenCalled();
  await deleteGameAssets("test-owner", "test-game");
});
