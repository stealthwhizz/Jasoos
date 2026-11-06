// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { narrate, playSfx, setSoundMuted, speechProfile } from "@/lib/sfx";

const oscillators: Array<{ stop: ReturnType<typeof vi.fn> }> = [];
const cancel = vi.fn(); const speak = vi.fn(); const resume = vi.fn(async () => undefined);
class FakeAudioContext {
  state = "running"; currentTime = 0; destination = {};
  resume = resume;
  createOscillator() {
    const node = { stop: vi.fn(), start: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), frequency: { value: 0 }, type: "sine", onended: null };
    oscillators.push(node); return node;
  }
  createGain() { return { connect: vi.fn(), disconnect: vi.fn(), gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } }; }
}
class FakeUtterance { constructor(public text: string) {} }
afterEach(() => { setSoundMuted(true); vi.unstubAllGlobals(); oscillators.length = 0; speak.mockClear(); cancel.mockClear(); });

it("one mute gate cancels narration, stops active blips, and blocks new voice/effects", () => {
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { cancel, speak, getVoices: () => [] } });
  setSoundMuted(false);
  narrate("Meera's clue", "npc-0", vi.fn()); playSfx("unlock");
  expect(speak).toHaveBeenCalledTimes(1); expect(oscillators).toHaveLength(3);
  setSoundMuted(true);
  expect(cancel).toHaveBeenCalled();
  for (const node of oscillators) expect(node.stop).toHaveBeenCalledTimes(2);
  narrate("Do not speak", "npc-0", vi.fn()); playSfx("fail");
  expect(speak).toHaveBeenCalledTimes(1); expect(oscillators).toHaveLength(3);
});

it("keeps a character's voice/pitch stable even when browser voice enumeration order changes", () => {
  const voices = [{ voiceURI: "b", lang: "en-IN" }, { voiceURI: "a", lang: "en-US" }, { voiceURI: "c", lang: "fr-FR" }] as SpeechSynthesisVoice[];
  expect(speechProfile("npc-0", voices)).toEqual(speechProfile("npc-0", [...voices].reverse()));
  expect(speechProfile("npc-0", voices).voice?.lang).toMatch(/^en/);
  expect(speechProfile("npc-0", []).voice).toBeUndefined();
});
