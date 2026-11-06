import { describe, expect, it } from "vitest";
import { codeFor } from "@/lib/engine/notes";
import { isValidSecret } from "@/lib/engine/codec";
import { fixtureBible } from "@/fixtures/world";

describe("hidden note code", () => {
  it("spells the culprit's name in the codec alphabet", () => {
    expect(codeFor(fixtureBible)).toBe("MEE");
  });

  it("is always a valid secret, even for names with few usable letters", () => {
    const b = structuredClone(fixtureBible);
    b.locations[2].npc.name = "Ivy Q";
    expect(codeFor(b)).toBe("YAA");
    expect(isValidSecret(codeFor(b))).toBe(true);
  });
});
