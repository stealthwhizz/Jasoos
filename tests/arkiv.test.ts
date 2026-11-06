import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  fitString,
  openMystery,
  packManifest,
  sealMystery,
  unpackManifest,
} from "@/lib/arkiv/codec";
import { createMemoryBackend } from "@/lib/arkiv/memory";
import { oneAccusationAtATime } from "@/lib/arkiv";
import { fixtureManifest } from "@/fixtures/world";

const { mystery } = fixtureManifest.bible;

describe("what goes on chain", () => {
  it("the packed manifest never contains the culprit or the secret", () => {
    const text = gunzipSync(packManifest(fixtureManifest)).toString("utf8");
    expect(text).not.toContain(mystery.secret);
    expect(text).not.toContain("culpritNpcId");
  });

  it("the sealed mystery opens with the right key only", () => {
    const sealed = sealMystery(mystery, "server-secret");
    expect(Buffer.from(sealed).toString("utf8")).not.toContain(mystery.secret);
    expect(openMystery(sealed, "server-secret")).toEqual(mystery);
    expect(() => openMystery(sealed, "wrong-secret")).toThrow();
  });

  it("round-trips the manifest with its mystery restored", () => {
    const back = unpackManifest(
      packManifest(fixtureManifest),
      openMystery(sealMystery(mystery, "k"), "k"),
      "0xabc",
    );
    expect(back.bible).toEqual(fixtureManifest.bible);
    expect(back.worldId).toBe("0xabc");
    expect(back.notes).toEqual(fixtureManifest.notes);
  });

  it("the packed manifest fits one entity (128 KiB of bytes)", () => {
    expect(packManifest(fixtureManifest).byteLength).toBeLessThan(128 * 1024);
  });

  it("cuts titles to Arkiv's 128-byte string limit without breaking characters", () => {
    expect(Buffer.byteLength(fitString("é".repeat(100)))).toBeLessThanOrEqual(128);
    expect(fitString("short")).toBe("short");
  });
});

describe("one accusation per human per case", () => {
  it("refuses a second accusation from the same human, allows others", async () => {
    const db = createMemoryBackend();
    await db.recordAccusation({ worldKey: "w1", humanHash: "alice", culpritId: "x" }, false);
    expect(await db.hasAccused("w1", "alice")).toBe(true);
    expect(await db.hasAccused("w1", "bob")).toBe(false);
    expect(await db.hasAccused("w2", "alice")).toBe(false);
  });

  it("lets only one of two parallel accusations through the check", async () => {
    const db = createMemoryBackend();
    const attempt = () =>
      oneAccusationAtATime("w1", "alice", async () => {
        if (await db.hasAccused("w1", "alice")) return "refused";
        await new Promise((r) => setTimeout(r, 20)); // a slow chain write
        await db.recordAccusation({ worldKey: "w1", humanHash: "alice", culpritId: "x" }, true);
        return "recorded";
      });
    const results = await Promise.all([attempt(), attempt()]);
    expect(results.sort()).toEqual(["recorded", null].sort());
    expect(await attempt()).toBe("refused");
  });
});
