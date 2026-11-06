// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { GameCanvas } from "@/components/GameCanvas";
import type { PlayerState } from "@/lib/types/client";

vi.mock("@/lib/image-cache", () => ({ getCachedImage: () => ({ naturalWidth: 1600, naturalHeight: 900 }), preloadImage: async () => ({ naturalWidth: 1600, naturalHeight: 900 }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("keeps the entire scene visible and movement functional at 375×812", () => {
  let frame: FrameRequestCallback = () => undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const drawImage = vi.fn();
  const context = new Proxy({ drawImage, measureText: () => ({ width: 20 }) }, { get(target, key) { return key in target ? target[key as keyof typeof target] : vi.fn(); } });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
  const positions: PlayerState[] = [];
  const view = render(<GameCanvas scene={{ id: "s0_0", kind: "street", title: "Road", ambient: "quiet", image: "/test.png", hotspots: [] }} sprite={null} paused={false} onInteract={vi.fn()} onPosition={(value) => positions.push({ ...value })} />);
  Object.defineProperties(view.container, { clientWidth: { value: 375 }, clientHeight: { value: 812 } });
  const now = performance.now();
  act(() => frame(now + 120));
  const [, x, y, width, height] = drawImage.mock.calls[0];
  expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0);
  expect(x + width).toBeLessThanOrEqual(375); expect(y + height).toBeLessThanOrEqual(812);
  fireEvent.keyDown(window, { key: "ArrowRight" });
  act(() => frame(now + 240));
  expect(positions.at(-1)!.x).toBeGreaterThan(positions[0].x);
  expect(positions.at(-1)!.moving).toBe(true);
  fireEvent.blur(window);
  act(() => frame(now + 360));
  expect(positions.at(-1)!.moving).toBe(false);
});
