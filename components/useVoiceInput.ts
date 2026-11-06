"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceInputState, TranscriptionResponse, ZgRequest } from "@/lib/types/client";

const MAX_RECORD_MS = 15_000;

/** Record a short line, transcribe on 0G, and discard all work after cancellation or unmount. */
export function useVoiceInput(onText: (text: string) => void, onRequests?: (ids: ZgRequest[]) => void) {
  const [state, setState] = useState<VoiceInputState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const activeRef = useRef(false);
  const onTextRef = useRef(onText);
  const onRequestsRef = useRef(onRequests);
  useEffect(() => { onTextRef.current = onText; onRequestsRef.current = onRequests; }, [onText, onRequests]);

  const releaseMic = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const dispose = useCallback(() => {
    generationRef.current++;
    activeRef.current = false;
    requestRef.current?.abort();
    requestRef.current = null;
    const recorder = recorderRef.current;
    recorderRef.current = null;
    // Stopping on leave must not trigger onstop's upload/send path.
    if (recorder) {
      recorder.onstop = null;
      recorder.ondataavailable = null;
      recorder.onerror = null;
      if (recorder.state !== "inactive") recorder.stop();
    }
    releaseMic();
  }, [releaseMic]);
  useEffect(() => dispose, [dispose]);

  const cancel = useCallback(() => { dispose(); setState("idle"); }, [dispose]);
  const supported = typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const transcribe = useCallback(async (blob: Blob, generation: number) => {
    if (generation !== generationRef.current) return;
    setState("transcribing");
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const form = new FormData();
      form.append("audio", blob, "speech");
      const response = await fetch("/api/transcribe", { method: "POST", body: form, signal: controller.signal });
      const body = await response.json().catch(() => null) as TranscriptionResponse | null;
      if (generation !== generationRef.current) return;
      if (!response.ok || !body?.text?.trim()) throw new Error(body?.error ?? "Couldn't hear that. Try again or type instead.");
      if (body.requestIds?.length) onRequestsRef.current?.(body.requestIds);
      onTextRef.current(body.text.trim());
    } catch (failure) {
      if (generation === generationRef.current) setError(failure instanceof Error ? failure.message : "Couldn't hear that. Try again or type instead.");
    } finally {
      if (generation === generationRef.current) { activeRef.current = false; requestRef.current = null; setState("idle"); }
    }
  }, []);

  const start = useCallback(async () => {
    if (activeRef.current || !supported) return;
    activeRef.current = true;
    const generation = ++generationRef.current;
    setState("requesting"); setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Permission can resolve after the player has left: release that late stream immediately.
      if (generation !== generationRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { if (generation === generationRef.current) { cancel(); setError("Recording failed. Try again or type instead."); } };
      recorder.onstop = () => {
        releaseMic(); recorderRef.current = null;
        if (generation !== generationRef.current) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
        if (blob.size) void transcribe(blob, generation);
        else { activeRef.current = false; setState("idle"); }
      };
      recorderRef.current = recorder;
      recorder.start(); setState("recording");
      timerRef.current = setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, MAX_RECORD_MS);
    } catch {
      if (generation !== generationRef.current) return;
      releaseMic(); activeRef.current = false; setState("idle");
      setError("Microphone is blocked. Allow it in the browser, or type instead.");
    }
  }, [supported, releaseMic, transcribe, cancel]);

  const toggle = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else if (!activeRef.current) void start();
  }, [start]);
  return { supported, state, error, toggle, cancel };
}
