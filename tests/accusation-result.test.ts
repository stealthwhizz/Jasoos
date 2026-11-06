import { describe, expect, it } from "vitest";
import { parseAccusationResult } from "@/components/accusationResult";
describe("accusation client result boundary", () => {
  it("accepts a correct result with or without optional finale art", () => {
    expect(parseAccusationResult({ correct: true, secret: "The truth" })).toEqual({
      correct: true,
      secret: "The truth",
    });
    expect(
      parseAccusationResult({
        correct: true,
        secret: "The truth",
        finaleUrl: "/fixtures/finale.svg",
      }),
    ).toEqual({ correct: true, secret: "The truth", finaleUrl: "/fixtures/finale.svg" });
  });
  it("does not expose accidental secret fields on an incorrect result", () =>
    expect(
      parseAccusationResult({
        correct: false,
        secret: "Do not display",
        finaleUrl: "/spoiler.svg",
      }),
    ).toEqual({ correct: false }));
  it.each([null, [], {}, { correct: "true" }, { correct: true }, { correct: true, secret: null }])(
    "rejects malformed replies instead of reporting a wrong guess: %j",
    (body) => expect(() => parseAccusationResult(body)).toThrow("Invalid accusation result"),
  );
});
