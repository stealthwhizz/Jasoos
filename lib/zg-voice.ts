/**
 * Voice on 0G Private Computer, both directions:
 * - characters speak with MiniMax speech (`ZG_TTS_MODEL`, default minimax-speech-2.8-turbo);
 * - players talk to them, transcribed by Whisper (`ZG_STT_MODEL`, default whisper-large-v3).
 * Every call returns the 0G request ID so the game can show it next to the line.
 */

import { toFile } from "openai";
import { ai } from "./zg-client";
import { DEFAULT_RETRY_OPTS, withRetry } from "./retry";
import type { ZgRequest } from "./types/shared";

export const TTS_MODEL = process.env.ZG_TTS_MODEL || "minimax-speech-2.8-turbo";
export const STT_MODEL = process.env.ZG_STT_MODEL || "whisper-large-v3";

/** Longest line we voice, and longest recording we transcribe. */
export const MAX_SPEECH_CHARS = 400;
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

/**
 * The world planner gives each character a speaker name (Sarvam-style: "aditya", "priya"…).
 * Map those to MiniMax voices of the same register; anything else gets a stable pick.
 * Every id below was accepted by 0G's router on 2026-11-07.
 */
const VOICE_BY_SPEAKER: Record<string, string> = {
  aditya: "Imposing_Manner", rahul: "English_magnetic_voiced_man", anand: "Elegant_Man",
  varun: "Determined_Man", mohit: "Determined_Man",
  rohan: "Casual_Guy", amit: "Casual_Guy",
  priya: "Wise_Woman", neha: "English_Graceful_Lady",
  kavya: "Lively_Girl", ishita: "Lively_Girl",
  narrator: "English_expressive_narrator",
};
const FALLBACK_VOICES = [
  "English_Trustworth_Man", "Wise_Woman", "Casual_Guy", "Lively_Girl", "Elegant_Man", "Friendly_Person",
];

export function voiceFor(speaker: string | undefined): string {
  const key = (speaker ?? "narrator").trim().toLowerCase();
  if (VOICE_BY_SPEAKER[key]) return VOICE_BY_SPEAKER[key];
  let hash = 0;
  for (const ch of key) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_VOICES[hash % FALLBACK_VOICES.length]!;
}

/** 0G returns the request ID as `x-request-id`, sometimes "<edge id>, <uuid>": keep the uuid. */
function requestIdFrom(header: string | null): string | null {
  if (!header) return null;
  const parts = header.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.find((p) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(p)) ?? parts.at(-1) ?? null;
}

/** Speaks a line on 0G. Returns MP3 bytes and the request that produced them. */
export async function zgSpeak(
  text: string,
  speaker?: string
): Promise<{ audio: Buffer; request: ZgRequest | null }> {
  const input = text.replace(/\s+/g, " ").trim().slice(0, MAX_SPEECH_CHARS);
  if (!input) throw new Error("Nothing to say.");
  const res = await withRetry(
    () =>
      ai()
        .audio.speech.create({ model: TTS_MODEL, voice: voiceFor(speaker), input, response_format: "mp3" })
        .asResponse(),
    DEFAULT_RETRY_OPTS
  );
  const audio = Buffer.from(await res.arrayBuffer());
  const requestId = requestIdFrom(res.headers.get("x-request-id"));
  return { audio, request: requestId ? { model: TTS_MODEL, requestId } : null };
}

/** Transcribes a short recording on 0G Whisper. */
export async function zgTranscribe(
  bytes: Buffer,
  filename: string,
  mimeType: string
): Promise<{ text: string; request: ZgRequest | null }> {
  if (bytes.length === 0) throw new Error("Empty recording.");
  if (bytes.length > MAX_AUDIO_BYTES) throw new Error("Recording is too long.");
  const { data, response } = await withRetry(
    async () =>
      ai()
        .audio.transcriptions.create({
          model: STT_MODEL,
          file: await toFile(bytes, filename, { type: mimeType }),
        })
        .withResponse(),
    DEFAULT_RETRY_OPTS
  );
  const trace = (data as { x_0g_trace?: { request_id?: string } }).x_0g_trace?.request_id;
  const requestId = trace ?? requestIdFrom(response.headers.get("x-request-id"));
  return { text: data.text.trim(), request: requestId ? { model: STT_MODEL, requestId } : null };
}
