// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EvidenceBox } from "@/components/EvidenceBox";
import { Decoder } from "@/components/Decoder";
import { DialogueBox } from "@/components/DialogueBox";
import { MobileControls } from "@/components/MobileControls";
import { encodeNote } from "@/lib/engine/codec";
import { CODEBOOK } from "@/lib/engine/codebook";
import type { EvidenceResponse, WidgetConfig } from "@/lib/types/client";
import type { NpcDef } from "@/lib/universe";

vi.mock("@worldcoin/idkit", () => ({
  proofOfHuman: () => ({}),
  IDKitRequestWidget: ({ open, handleVerify, onSuccess, onError }: { open: boolean; handleVerify: (proof: unknown) => Promise<void>; onSuccess: () => void; onError: (code: string) => void }) => open && <button onClick={async () => { try { await handleVerify({ action: "evidence-fixture" }); onSuccess(); } catch { onError("widget-failed"); } }}>Approve simulator proof</button>,
}));
const request = vi.fn<typeof fetch>();
beforeEach(() => {
  request.mockReset(); vi.stubGlobal("fetch", request);
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  HTMLElement.prototype.scrollTo = vi.fn();
  HTMLElement.prototype.setPointerCapture = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const cover = CODEBOOK.slice(0, 20).map(([word]) => word).join(" ");
const note = encodeNote("MEE", cover, "KEY")!;
function EvidenceFixture() {
  const [evidence, setEvidence] = useState<EvidenceResponse | null>(null);
  return <><EvidenceBox gameId="fixture" evidence={evidence} onUnlock={setEvidence} /><Decoder note={{ text: note }} evidenceKey={evidence?.key} /></>;
}
const config: WidgetConfig = { app_id: "app_test", action: "evidence-fixture", environment: "staging", rp_context: {} as WidgetConfig["rp_context"] };

it("opens fixture evidence, fills the key, and decodes the culprit; a wrong key reveals nothing", async () => {
  const user = userEvent.setup();
  request.mockResolvedValueOnce(Response.json({ dev: true })).mockResolvedValueOnce(Response.json({ key: "KEY", unlocks: 1 }));
  render(<EvidenceFixture />);
  await user.click(screen.getByText("Use Decoder"));
  expect(screen.getByText("Nothing hidden.")).toBeTruthy();
  await user.click(screen.getByText("Open with World ID"));
  await screen.findByText("Evidence key:");
  expect((screen.getByLabelText("Decoder key") as HTMLInputElement).value).toBe("KEY");
  await user.click(screen.getByText("Use Decoder"));
  expect(screen.getByText("Hidden message: MEE")).toBeTruthy();
  await user.clear(screen.getByLabelText("Decoder key")); await user.type(screen.getByLabelText("Decoder key"), "XXX");
  await user.click(screen.getByText("Use Decoder"));
  expect(screen.getByText("Nothing hidden.")).toBeTruthy();
});

it("restores an existing unlock without asking for another proof", async () => {
  request.mockResolvedValueOnce(Response.json(config)).mockResolvedValueOnce(Response.json({ key: "KEY", evidenceNote: "Initials M-E-E", unlocks: 2 }));
  render(<EvidenceFixture />);
  fireEvent.click(screen.getByText("Open with World ID"));
  await screen.findByText("Initials M-E-E");
  expect(screen.queryByText("Approve simulator proof")).toBeNull();
  expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({});
});

it("uses the per-case widget configuration and keeps a failed write sealed with its reason", async () => {
  request.mockResolvedValueOnce(Response.json(config))
    .mockResolvedValueOnce(Response.json({ error: "Proof missing" }, { status: 400 }))
    .mockResolvedValueOnce(Response.json({ error: "Could not persist unlock" }, { status: 503 }));
  const onUnlock = vi.fn();
  render(<EvidenceBox gameId="fixture" evidence={null} onUnlock={onUnlock} />);
  fireEvent.click(screen.getByText("Open with World ID"));
  fireEvent.click(await screen.findByText("Approve simulator proof"));
  expect((await screen.findByRole("alert")).textContent).toBe("Could not persist unlock");
  expect(onUnlock).not.toHaveBeenCalled();
  expect(JSON.parse(String(request.mock.calls[2][1]?.body))).toEqual({ proof: { action: "evidence-fixture" } });
});

const npc = { name: "Meera", role: "Baker", opening: "Hello", persona: "kind" } as NpcDef;
it("reply chips and keys send suggestions, while Show item sends the selected inventory value", async () => {
  const say = vi.fn(); const user = userEvent.setup();
  render(<DialogueBox npc={npc} history={[]} options={["Ask about the ledger", "Offer tea", "Ask who visited", "Ignored fourth"]} thinking={false} speaking={false} voiceOn={false} onToggleVoice={vi.fn()} onSay={say} onClose={vi.fn()} inventory={["Brass key"]} />);
  await user.click(screen.getByText("Ask about the ledger"));
  expect(say).toHaveBeenLastCalledWith("Ask about the ledger");
  fireEvent.keyDown(window, { key: "2" }); expect(say).toHaveBeenLastCalledWith("Offer tea");
  expect(screen.queryByText("Ignored fourth")).toBeNull();
  await user.selectOptions(screen.getByLabelText("Inventory item"), "Brass key");
  await user.click(screen.getByText("Show item"));
  expect(say).toHaveBeenLastCalledWith("What can you tell me about this Brass key?", "Brass key");
  say.mockClear(); screen.getByLabelText("Inventory item").focus(); fireEvent.keyDown(screen.getByLabelText("Inventory item"), { key: "1" }); expect(say).not.toHaveBeenCalled();
});

it("shows narrow-screen D-pad/E controls and clears movement on release, cancel, blur and overlays", async () => {
  const touchInputRef = { current: { x: 0, y: 0 } }; const interact = vi.fn();
  const near = { id: "npc", name: "Meera", kind: "npc", hint: "talk", rect: { x: 0, y: 0, w: 1, h: 1 } } as const;
  const view = render(<MobileControls touchInputRef={touchInputRef} nearHotspot={near} paused={false} onInteract={interact} />);
  const right = await screen.findByLabelText("Move right");
  fireEvent.pointerDown(right, { pointerId: 1 }); expect(touchInputRef.current.x).toBe(1);
  fireEvent.pointerUp(right); expect(touchInputRef.current.x).toBe(0);
  fireEvent.pointerDown(right, { pointerId: 1 }); fireEvent.pointerCancel(right); expect(touchInputRef.current.x).toBe(0);
  fireEvent.pointerDown(right, { pointerId: 1 }); fireEvent.blur(window); expect(touchInputRef.current.x).toBe(0);
  fireEvent.click(screen.getByLabelText("Interact with Meera")); expect(interact).toHaveBeenCalledWith(near);
  fireEvent.pointerDown(right, { pointerId: 1 });
  view.rerender(<MobileControls touchInputRef={touchInputRef} nearHotspot={near} paused onInteract={interact} />);
  await waitFor(() => expect(touchInputRef.current.x).toBe(0));
  expect(screen.queryByLabelText("Move right")).toBeNull();
});
