import { describe, expect, it } from "vitest";
import { parseGallery } from "@/components/galleryData";

const world = {
  worldKey: "fixture-case",
  title: "Case",
  premise: "A mystery",
  thumbnailUrl: "/fixtures/street.svg",
  createdAt: "2026-11-06",
  visits: 0,
};
describe("gallery response boundary", () => {
  it("preserves valid records and distinguishes an empty archive", () => {
    expect(parseGallery([world])).toEqual([world]);
    expect(parseGallery([])).toEqual([]);
  });
  it.each([
    null,
    {},
    { error: "Unavailable" },
    "not an array",
    [null],
    [{}],
    [{ ...world, title: 1 }],
    [{ ...world, worldKey: "" }],
    [{ ...world, visits: -1 }],
    [{ ...world, visits: Infinity }],
  ])("rejects malformed responses without inventing records: %j", (value) => {
    expect(() => parseGallery(value)).toThrow("invalid response");
  });
});
