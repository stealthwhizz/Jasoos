// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MusicEngine, MUSIC_LIBRARY } from "@/lib/music";

/** Minimal Web Audio stand-in that records oscillators and context state. */
const param = () => ({ value: 0, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
let contexts: FakeContext[] = [];
class FakeContext {
  state = "running"; currentTime = 0; destination = {}; oscillators = 0;
  constructor() { contexts.push(this); }
  suspend = vi.fn(async () => { this.state = "suspended"; });
  resume = vi.fn(async () => { this.state = "running"; });
  close = vi.fn(async () => { this.state = "closed"; });
  createGain() { return { ...node(), gain: param() }; }
  createBiquadFilter() { return { ...node(), type: "", frequency: param() }; }
  createDelay() { return { ...node(), delayTime: param() }; }
  createOscillator() { this.oscillators++; return { ...node(), type: "", frequency: param(), start: vi.fn(), stop: vi.fn() }; }
}

beforeEach(() => { vi.useFakeTimers(); contexts = []; vi.stubGlobal("AudioContext", FakeContext); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const theme = MUSIC_LIBRARY[0];

it("turning music off stops new bars and suspends the audio context", () => {
  const engine = new MusicEngine();
  engine.start(theme);
  const ctx = contexts[0];
  engine.setMuted(true);
  vi.advanceTimersByTime(1000);
  expect(ctx.suspend).toHaveBeenCalled();
  const before = ctx.oscillators;
  vi.advanceTimersByTime(theme.barSeconds * 1000 * 5);
  expect(ctx.oscillators).toBe(before); // nothing scheduled while off
});

it("a player with music off never hears the first bar", () => {
  const engine = new MusicEngine();
  engine.setMuted(true);
  engine.start(theme);
  vi.advanceTimersByTime(theme.barSeconds * 1000 * 3);
  expect(contexts[0].suspend).toHaveBeenCalled();
  window.dispatchEvent(new Event("pointerdown")); // autoplay unlock must not wake it
  expect(contexts[0].resume).not.toHaveBeenCalled();
});

it("turning music back on resumes the context and the loop", () => {
  const engine = new MusicEngine();
  engine.start(theme);
  engine.setMuted(true);
  vi.advanceTimersByTime(1000);
  const before = contexts[0].oscillators;
  engine.setMuted(false);
  expect(contexts[0].resume).toHaveBeenCalled();
  expect(contexts[0].oscillators).toBeGreaterThan(before);
});

it("a disposed engine reports it, never restarts, and an unmute cannot revive it", () => {
  const engine = new MusicEngine();
  engine.start(theme);
  engine.dispose();
  expect(engine.isDisposed).toBe(true);
  engine.setMuted(false);
  engine.start(theme);
  expect(contexts).toHaveLength(1);
  vi.advanceTimersByTime(1000);
  expect(contexts[0].close).toHaveBeenCalled();
});
