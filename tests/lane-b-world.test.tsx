// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { World } from "@/components/World";
import type { SceneData } from "@/lib/universe";

const audio = vi.hoisted(() => ({ setMuted: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));
vi.mock("@/lib/image-cache", () => ({ getCachedImage: () => null, preloadSceneImages: async () => undefined, warmSceneImages: vi.fn() }));
vi.mock("@/components/Minimap", () => ({ Minimap: () => null, mergeKnownCell: (a: unknown) => a, streetCellFromScene: () => null, streetsFromScenes: () => [] }));
vi.mock("@/lib/music", () => ({ MusicEngine: class { start() {} setMuted = audio.setMuted; setDucked() {} dispose() {} }, getMusicTheme: () => ({ id: "test", label: "Test" }), pickMusicTheme: () => ({ id: "test", label: "Test" }) }));
vi.mock("@/components/MobileControls", () => ({ MobileControls: () => null, useCoarsePointer: () => false }));
vi.mock("@/components/GameCanvas", () => ({ GameCanvas: ({ scene, onInteract, paused }: { scene: SceneData; paused: boolean; onInteract: (hotspot: SceneData["hotspots"][number]) => void }) => <div>{scene.hotspots.map((hotspot) => <button disabled={paused} key={hotspot.id} onClick={() => onInteract(hotspot)}>Test {hotspot.name}</button>)}</div> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("sends the shown inventory item and updates the danger meter from an offended reply", async () => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  HTMLElement.prototype.scrollTo = vi.fn();
  const npc = { name: "Meera", role: "Baker", persona: "kind", opening: "Hello" };
  const rect = { x: 0, y: 0, w: 1, h: 1 };
  const game = {
    id: "fixture", isOwner: false, premise: { title: "Case", setup: "test" }, bible: {
      story: { goal: "Find the ledger", clues: ["First clue", "Second clue", "Third clue"], sealed: "test" },
      rooms: [{ name: "Bakery", description: "quiet" }], npcs: [npc], failStates: [], heatLabel: "Danger",
    }, scenes: [{ id: "s0_0", kind: "street", title: "Road", ambient: "Quiet", image: "/test.png", clueIndex: 0, npc, hotspots: [
      { id: "key", kind: "item", name: "Brass key", itemName: "Brass key", rect },
      { id: "npc", kind: "npc", name: "Meera", rect },
    ] }], finales: {}, spriteUrl: null, genCalls: 0,
  };
  let sent: Record<string, unknown> | undefined;
  const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/games/fixture") return Response.json(game);
    if (String(input) === "/api/dialogue") {
      sent = JSON.parse(String(init?.body));
      return Response.json({ line: "That was rude", options: ["Apologize", "Leave", "Ask why"], offense: "grave", clueRevealed: true, done: false });
    }
    // Character lines are voiced on 0G via /api/voice; a failure must fall back to the browser voice.
    if (String(input) === "/api/voice") return new Response(null, { status: 502 });
    throw new Error(`Unexpected request ${input}`);
  });
  vi.stubGlobal("fetch", request);
  render(<World mode="load" gameId="fixture" />);
  fireEvent.click(await screen.findByText("Test Brass key"));
  fireEvent.click(screen.getByText("Test Meera"));
  fireEvent.change(await screen.findByLabelText("Inventory item"), { target: { value: "Brass key" } });
  fireEvent.click(screen.getByText("Show item"));
  await waitFor(() => expect(sent?.shownItem).toBe("Brass key"));
  expect(sent?.inventory).toEqual(["Brass key"]);
  await waitFor(() => expect(screen.getByRole("progressbar", { name: "Danger" }).getAttribute("aria-valuenow")).toBe("35"));
  fireEvent.click(screen.getByText("Esc · leave"));
  fireEvent.click(screen.getAllByLabelText("Mute all sound")[0]);
  expect(audio.setMuted).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByText("Case notes"));
  expect(await screen.findByText("First clue")).toBeTruthy();
  // Every voice request carries the line and the character's speaker name, never anything else.
  for (const [input, init] of request.mock.calls) {
    if (String(input) !== "/api/voice") continue;
    expect(Object.keys(JSON.parse(String(init?.body))).sort()).toEqual(["text", "voice"]);
  }
});
