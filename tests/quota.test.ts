import { describe, it } from "vitest";

describe("daily creation quota", () => {
  it.todo("counts only live creation entities for one human hash");
  it.todo("ignores creations older than 24 hours");
  it.todo("POST /api/worlds returns 429 at CREATION_LIMIT_PER_DAY");
});
