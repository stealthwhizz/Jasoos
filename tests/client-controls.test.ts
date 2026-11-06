import { describe, expect, it } from "vitest";
import { getGameKey, getMovementVector } from "@/components/gameControls";

const keyboardEvent = (key: string) => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  isComposing: false,
});

describe("client game controls", () => {
  it("normalizes WASD and E without changing arrow keys", () => {
    expect(getGameKey(keyboardEvent("W"))).toBe("w");
    expect(getGameKey(keyboardEvent("E"))).toBe("e");
    expect(getGameKey(keyboardEvent("ArrowLeft"))).toBe("ArrowLeft");
    expect(getGameKey(keyboardEvent("Tab"))).toBeNull();
  });

  it.each(["altKey", "ctrlKey", "metaKey", "isComposing"] as const)(
    "leaves %s shortcuts and text composition alone",
    (flag) => expect(getGameKey({ ...keyboardEvent("w"), [flag]: true })).toBeNull(),
  );

  it("preserves cardinal and normalized diagonal movement", () => {
    expect(getMovementVector(["ArrowRight"])).toEqual([1, 0]);
    const [horizontal, vertical] = getMovementVector(["ArrowRight", "ArrowUp"]);
    expect(horizontal).toBeCloseTo(Math.SQRT1_2);
    expect(vertical).toBeCloseTo(-Math.SQRT1_2);
    expect(Math.hypot(horizontal, vertical)).toBeCloseTo(1);
  });

  it("cancels opposing directions and ignores non-movement keys", () => {
    expect(getMovementVector(["ArrowRight", "ArrowLeft", "e"])).toEqual([0, 0]);
    expect(getMovementVector([])).toEqual([0, 0]);
  });

  it("does not double-count a direction held by both keyboard and touch", () => {
    expect(getMovementVector(["ArrowRight", "ArrowRight", "ArrowUp"])).toEqual(
      getMovementVector(["ArrowRight", "ArrowUp"]),
    );
  });
});
