import { describe, it } from "vitest";

describe("hidden-note codec", () => {
  it.todo("round-trips a secret through encodeNote and decodeNote");
  it.todo("reports nothing hidden on ordinary text (check value fails)");
  it.todo("fails cleanly when the cover text has too few codebook slots");
  it.todo("records the round-trip failure rate over many generated notes");
});
