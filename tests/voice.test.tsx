// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DialogueBox } from "@/components/DialogueBox";
import { voiceFor } from "@/lib/zg-voice";
import type { NpcDef } from "@/lib/universe";

const npc = { name: "Ravi", role: "Spice seller", persona: "wary", opening: "Hello", voice: "aditya" } as NpcDef;

class FakeRecorder {
  static isTypeSupported = () => true;
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

const request = vi.fn<typeof fetch>();
beforeEach(() => {
  request.mockReset();
  vi.stubGlobal("fetch", request);
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) },
  });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("records the player's voice, transcribes it on 0G and sends it as their line", async () => {
  request.mockResolvedValue(Response.json({ text: "What did you see tonight?", requestIds: [{ model: "whisper-large-v3", requestId: "req-1" }] }));
  const onSay = vi.fn();
  const onZgRequests = vi.fn();
  render(
    <DialogueBox npc={npc} history={[]} options={[]} thinking={false} speaking={false} voiceOn mood={undefined}
      inventory={[]} onToggleVoice={vi.fn()} onSay={onSay} onClose={vi.fn()} onZgRequests={onZgRequests} />
  );
  fireEvent.click(screen.getByRole("button", { name: "Speak to Ravi" }));
  fireEvent.click(await screen.findByRole("button", { name: "Stop and send voice" }));
  await waitFor(() => expect(onSay).toHaveBeenCalledWith("What did you see tonight?"));
  expect(onZgRequests).toHaveBeenCalledWith([{ model: "whisper-large-v3", requestId: "req-1" }]);
  const [url, init] = request.mock.calls[0]!;
  expect(url).toBe("/api/transcribe");
  expect((init?.body as FormData).get("audio")).toBeInstanceOf(Blob);
});

it("shows the reason and sends nothing when transcription fails", async () => {
  request.mockResolvedValue(Response.json({ error: "Couldn't hear that. Try again or type instead." }, { status: 502 }));
  const onSay = vi.fn();
  render(
    <DialogueBox npc={npc} history={[]} options={[]} thinking={false} speaking={false} voiceOn mood={undefined}
      inventory={[]} onToggleVoice={vi.fn()} onSay={onSay} onClose={vi.fn()} />
  );
  fireEvent.click(screen.getByRole("button", { name: "Speak to Ravi" }));
  fireEvent.click(await screen.findByRole("button", { name: "Stop and send voice" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Couldn't hear that. Try again or type instead.");
  expect(onSay).not.toHaveBeenCalled();
});

it("gives each character type a stable 0G voice", () => {
  expect(voiceFor("aditya")).toBe("Imposing_Manner");
  expect(voiceFor("Priya")).toBe("Wise_Woman");
  expect(voiceFor(undefined)).toBe("English_expressive_narrator");
  expect(voiceFor("someone-new")).toBe(voiceFor("someone-new"));
});
