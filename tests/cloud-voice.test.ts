// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { narrate, setCloudVoice, setSoundMuted } from "@/lib/sfx";

const request = vi.fn<typeof fetch>();
const revoke = vi.fn(); const createUrl = vi.fn(() => "blob:test-audio");
const browserSpeak = vi.fn();
const playing: FakeAudio[] = [];
class FakeAudio {
  onplay: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  play = vi.fn(async () => { this.onplay?.(); });
  constructor() { playing.push(this); }
}
beforeEach(() => {
  request.mockReset(); revoke.mockClear(); createUrl.mockClear(); browserSpeak.mockClear(); playing.length = 0;
  vi.stubGlobal("fetch", request); vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} });
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { cancel: vi.fn(), speak: browserSpeak, getVoices: () => [] } });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createUrl });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
  setCloudVoice(true); setSoundMuted(false);
});
afterEach(() => { setSoundMuted(true); setCloudVoice(false); vi.unstubAllGlobals(); });

it("aborts cloud narration on mute and ignores audio arriving afterwards", async () => {
  let finish!: (response: Response) => void;
  request.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  narrate("A clue", "npc-0", vi.fn());
  const signal = request.mock.calls[0][1]?.signal;
  setSoundMuted(true);
  expect(signal?.aborted).toBe(true);
  finish(new Response("audio"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(createUrl).not.toHaveBeenCalled();
  expect(browserSpeak).not.toHaveBeenCalled();
});

it("releases the temporary audio URL and pauses playback when muted", async () => {
  request.mockResolvedValue(new Response("audio", { headers: { "x-0g-model": "speech", "x-0g-request-id": "request-1" } }));
  const onRequest = vi.fn();
  narrate("A clue", "npc-0", vi.fn(), { onRequest });
  await waitFor(() => expect(playing).toHaveLength(1));
  expect(onRequest).toHaveBeenCalledWith({ model: "speech", requestId: "request-1" });
  setSoundMuted(true);
  expect(playing[0].pause).toHaveBeenCalled();
  expect(revoke).toHaveBeenCalledWith("blob:test-audio");
});

it("falls back to browser speech when media playback fails", async () => {
  request.mockResolvedValue(new Response("bad audio"));
  narrate("Fallback clue", "npc-0", vi.fn());
  await waitFor(() => expect(playing).toHaveLength(1));
  playing[0].onerror?.();
  expect(browserSpeak).toHaveBeenCalledTimes(1);
  expect(revoke).toHaveBeenCalledWith("blob:test-audio");
});
