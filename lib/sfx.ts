import type { SfxName } from "@/lib/types/client";
export type { SfxName } from "@/lib/types/client";

let context: AudioContext | null = null;
let muted = true;
let narration = 0;
const active = new Set<OscillatorNode>();
let lastStep = 0;
let lastHover = 0;
const tones: Record<SfxName, number[]> = {
  click: [440], tap: [520], toggleOn: [330, 660], toggleOff: [660, 330],
  open: [330, 440], close: [440, 330], pickup: [660, 880], success: [440, 550, 660],
  error: [140, 100], hover: [700], step: [90], door: [220, 330], unlock: [440, 660, 880], fail: [220, 165, 110],
};

/** Shared mute gate; stop active and queued game audio immediately. */
export function setSoundMuted(value: boolean): void {
  muted = value;
  if (!value) return;
  for (const oscillator of active) { try { oscillator.stop(); } catch { /* Already ended. */ } }
  active.clear();
  cancelNarration();
}

/** Cancel browser narration when leaving a conversation, changing worlds or muting. */
export function cancelNarration(): void {
  narration++;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

/** Stable voice selection and pitch for a given character across replies. */
export function speechProfile(identity: string, voices: SpeechSynthesisVoice[]) {
  let hash = 0;
  for (const char of identity) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  const english = voices.filter((voice) => /^en\b/i.test(voice.lang));
  const candidates = [...(english.length ? english : voices)].sort((a, b) => a.voiceURI.localeCompare(b.voiceURI));
  return { voice: candidates.length ? candidates[hash % candidates.length] : undefined, pitch: 0.85 + (hash % 31) / 100 };
}

/** Speak NPC/finale text locally; no network request or audio asset is needed. */
export function narrate(text: string, identity: string, onSpeaking: (value: boolean) => void): void {
  if (muted || !text.trim() || typeof window === "undefined" || !("speechSynthesis" in window)) { onSpeaking(false); return; }
  cancelNarration();
  const ticket = narration;
  const utterance = new SpeechSynthesisUtterance(text);
  const profile = speechProfile(identity, window.speechSynthesis.getVoices());
  if (profile.voice) utterance.voice = profile.voice;
  utterance.pitch = profile.pitch;
  utterance.rate = 0.95;
  utterance.onstart = () => { if (ticket === narration) onSpeaking(true); };
  utterance.onend = () => { if (ticket === narration) onSpeaking(false); };
  utterance.onerror = () => { if (ticket === narration) onSpeaking(false); };
  window.speechSynthesis.speak(utterance);
}

/** Short WebAudio blips for movement, doors, clues, evidence, failures and UI. */
export function playSfx(name: SfxName): void {
  if (muted || typeof window === "undefined" || !("AudioContext" in window)) return;
  const now = performance.now();
  if (name === "step") { if (now - lastStep < 220) return; lastStep = now; }
  if (name === "hover") { if (now - lastHover < 90) return; lastHover = now; }
  try {
    const ctx = context ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    tones[name].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + index * 0.06;
      oscillator.frequency.value = frequency;
      oscillator.type = name === "fail" || name === "error" ? "triangle" : "sine";
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(name === "step" ? 0.025 : 0.07, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
      oscillator.connect(gain); gain.connect(ctx.destination);
      active.add(oscillator);
      oscillator.onended = () => { active.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start); oscillator.stop(start + 0.1);
    });
  } catch { /* Audio support/autoplay restrictions must never interrupt play. */ }
}
