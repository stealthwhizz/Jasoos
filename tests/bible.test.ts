import { describe, expect, it } from "vitest";
import { parseBible } from "@/lib/engine/bible";
import { fixtureBible } from "@/fixtures/world";

const clone = () => JSON.parse(JSON.stringify(fixtureBible));

describe("world bible validation", () => {
  it("accepts a valid bible", () => {
    expect(parseBible(clone())).toEqual(fixtureBible);
  });

  it("slugs ids and the culprit reference consistently", () => {
    const b = clone();
    b.locations[2].npc.id = "NPC Meera";
    b.mystery.culpritNpcId = "npc meera";
    expect(parseBible(b)?.mystery.culpritNpcId).toBe("npc-meera");
  });

  it("rejects missing fields, wrong location count, duplicates, and unknown culprit", () => {
    const missing = clone();
    delete missing.artStyle;
    const two = clone();
    two.locations.pop();
    const dupe = clone();
    dupe.locations[1].id = "cafe";
    const ghost = clone();
    ghost.mystery.culpritNpcId = "npc-nobody";
    for (const bad of [null, "text", missing, two, dupe, ghost]) expect(parseBible(bad)).toBeNull();
  });
});
