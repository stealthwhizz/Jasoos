import { describe, expect, it } from "vitest";
import { readAsset, saveAsset } from "@/lib/engine/assets";

describe("asset store", () => {
  it("saves base64 bytes and reads them back by URL with the right type", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const url = await saveAsset(png.toString("base64"));
    expect(url).toMatch(/^\/api\/assets\/[0-9a-f-]{36}\.png$/);
    const asset = await readAsset(url);
    expect(asset?.type).toBe("image/png");
    expect(asset?.bytes.equals(png)).toBe(true);
  });

  it("refuses anything that is not a saved asset file name", async () => {
    for (const bad of ["../../package.json", "..%2Fpackage.json", "x.png", ""]) {
      expect(await readAsset(bad)).toBeNull();
    }
  });
});
