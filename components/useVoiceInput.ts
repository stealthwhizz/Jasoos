"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ZgRequest } from "@/lib/types/shared";

/** Longest recording before it stops on its own (Whisper on 0G gets ≤ 2 MB). */
const MAX_RECORD_MS = 15_000;

type VoiceInputState = "idle" | "recording" | "transcribing";

/**
 * Talk to a character: record from the mic, transcribe with Whisper on 0G (/api/transcribe),
 * and hand the text to `onText`. `onRequests` receives the 0G request ID for the transcription.
 */
export function useVoiceInput(
  onText: (text: string) => void,
  onRequests?: (ids: ZgRequest[]) => void
) {
  const [state, setState] = useState<VoiceInputState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTextRef = useRef(onText);
  const onRequestsRef = useRef(onRequests);
  useEffect(() => {
    onTextRef.current = onText;
    onRequestsRef.current = onRequests;
  }, [onText, onRequests]);

  const releaseMic = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    releaseMic();
  }, [releaseMic]);

  const supported =
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  const transcribe = useCallback(async (blob: Blob) => {
    setState("transcribing");
    try {
      const form = new FormData();
      form.append("audio", blob, "speech");
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as
        | { text?: string; requestIds?: ZgRequest[]; error?: string }
        | null;
      if (!res.ok || !body?.text) throw new Error(body?.error ?? "Couldn't hear that. Try again or type instead.");
      if (body.requestIds?.length) onRequestsRef.current?.(body.requestIds);
      onTextRef.current(body.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't hear that. Try again or type instead.");
    } finally {
      setState("idle");
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) =>
        MediaRecorder.isTypeSupported(t)
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        releaseMic();
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
        if (blob.size) void transcribe(blob);
        else setState("idle");
      };
      recorderRef.current = recorder;
      recorder.start();
      setState("recording");
      timerRef.current = setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, MAX_RECORD_MS);
    } catch {
      releaseMic();
      setState("idle");
      setError("Microphone is blocked. Allow it in the browser, or type instead.");
    }
  }, [releaseMic, transcribe]);

  const toggle = useCallback(() => {
    if (state === "recording") recorderRef.current?.stop();
    else if (state === "idle") void start();
  }, [state, start]);

  return { supported, state, error, toggle };
}
