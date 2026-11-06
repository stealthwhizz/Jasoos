"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Mic, Send, Square, Volume2, VolumeX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { playSfx } from "@/lib/sfx";
import type { DialogueBoxProps } from "@/lib/types/client";
import { useVoiceInput } from "./useVoiceInput";

const MOOD_COLOR: Record<string, string> = {
  warm: "#6b8e5a",
  wary: "#b3862f",
  fearful: "#6d5f97",
  urgent: "#c04a2f",
  secretive: "#4a7c88",
  amused: "#b3862f",
  angry: "#b34a44",
};

/** In-world NPC conversation panel with reply chips and free-text input. */
export function DialogueBox({
  npc,
  history,
  options,
  thinking,
  speaking,
  voiceOn,
  mood,
  onToggleVoice,
  onSay,
  onClose,
  inventory,
  onZgRequests,
}: DialogueBoxProps) {
  const [selectedItem, setSelectedItem] = useState("");
  const [draft, setDraft] = useState("");
  // Speak instead of typing: Whisper on 0G transcribes, and the line is sent as if typed.
  const voiceInput = useVoiceInput((text) => onSay(text), onZgRequests);
  const { cancel: cancelVoiceInput, state: voiceInputState } = voiceInput;
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastNpcLine = [...history].reverse().find((t) => t.speaker === "npc");

  const lineText = lastNpcLine?.text ?? "";
  // The typed count is stored with its line, so a new NPC line starts at 0 without a reset effect.
  const [typedState, setTypedState] = useState({ text: "", n: 0 });
  const typed = typedState.text === lineText ? typedState.n : 0;
  const setTyped = (update: (n: number) => number) =>
    setTypedState((s) => ({ text: lineText, n: update(s.text === lineText ? s.n : 0) }));
  const prevSpeaking = useRef(false);

  useEffect(() => {
    if (!lastNpcLine) return;
    // With voice on, wait for playback to start so text and audio feel synced.
    if (voiceOn && !speaking) return;

    const iv = setInterval(() => {
      setTyped((n) => {
        if (n >= lastNpcLine.text.length) {
          clearInterval(iv);
          return n;
        }
        return n + 2;
      });
    }, 18);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastNpcLine?.text, voiceOn, speaking]);

  // Keep the full line visible after voice finishes (avoid blank flash).
  useEffect(() => {
    const ended = prevSpeaking.current && !speaking && lastNpcLine;
    prevSpeaking.current = speaking;
    if (!ended) return;
    const full = lastNpcLine.text.length;
    const t = setTimeout(() => setTyped(() => full), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setTyped is rebuilt each render for the current line
  }, [speaking, lastNpcLine]);

  // If TTS never starts, reveal the full line after a short wait.
  useEffect(() => {
    if (!voiceOn || !lastNpcLine || speaking || thinking) return;
    const t = setTimeout(() => {
      setTyped((n) => (n >= lastNpcLine.text.length ? n : lastNpcLine.text.length));
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-arm only when the line text changes
  }, [voiceOn, lastNpcLine?.text, speaking, thinking]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" });
  }, [history.length, thinking, typed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelVoiceInput();
        onClose();
        return;
      }
      if ((document.activeElement as HTMLElement | null)?.matches("input, textarea, select, [contenteditable=true]")) return;
      const n = Number(e.key);
      if (!thinking && voiceInputState === "idle" && n >= 1 && n <= Math.min(3, options.length)) {
        playSfx("tap"); // keyboard picks mirror the chip click sound
        e.preventDefault();
        onSay(options[n - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, thinking, onSay, onClose, voiceInputState, cancelVoiceInput]);

  const moodColor = mood ? (MOOD_COLOR[mood] ?? "#7c6d61") : undefined;

  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 24, opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-auto max-h-[80dvh] w-full max-w-2xl overflow-y-auto"
    >
      <Card className="gap-0 rounded-t-base py-4 sm:rounded-base">
        <CardContent className="px-5">
          <div className="mb-2 flex items-center gap-2.5">
            <div>
              <p className="font-display text-lg font-bold leading-none text-foreground">
                {npc.name}
              </p>
              <p className="mt-0.5 text-xs font-medium text-inksoft">
                {npc.role}
              </p>
            </div>
            {mood && moodColor && (
              <Badge
                variant="neutral"
                className="uppercase tracking-wide"
                style={{
                  color: moodColor,
                  backgroundColor: `${moodColor}18`,
                }}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: moodColor }}
                />
                {mood}
              </Badge>
            )}
            <Button
              type="button"
              variant={voiceOn ? "noShadow" : "neutral"}
              size="icon"
              sound={voiceOn ? "toggleOff" : "toggleOn"}
              hoverSound="hover"
              className={`ml-auto size-8 ${voiceOn ? "bg-main/10 text-main" : ""}`}
              onClick={onToggleVoice}
              title={voiceOn ? "Mute all sound" : "Enable sound"}
              aria-label={voiceOn ? "Mute all sound" : "Enable sound"}
            >
              {voiceOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </Button>
            {/* Silent: closing already plays the "close" sweep via World. */}
            <Button
              type="button"
              variant="neutral"
              size="sm"
              sound="none"
              onClick={() => { cancelVoiceInput(); onClose(); }}
            >
              Esc · leave
            </Button>
          </div>

          <div
            ref={scrollRef}
            className="no-scrollbar max-h-36 space-y-1.5 overflow-y-auto pb-1"
          >
            {history.slice(-6).map((t, i, arr) => {
              const isLastNpc =
                t.speaker === "npc" &&
                t.text === lastNpcLine?.text &&
                i === arr.length - 1;
              return (
                <p
                  key={`${i}-${t.text.slice(0, 12)}`}
                  className={
                    t.speaker === "npc"
                      ? "text-[15px] font-medium leading-snug text-foreground"
                      : "text-right text-sm font-semibold text-main"
                  }
                >
                  {isLastNpc ? t.text.slice(0, typed) : t.text}
                </p>
              );
            })}
            {thinking && (
              <p className="flex items-center gap-1.5 text-sm font-medium text-inksoft">
                <span className="animate-breathe inline-block size-1.5 rounded-full bg-main" />
                <span
                  className="animate-breathe inline-block size-1.5 rounded-full bg-main"
                  style={{ animationDelay: "0.15s" }}
                />
                <span
                  className="animate-breathe inline-block size-1.5 rounded-full bg-main"
                  style={{ animationDelay: "0.3s" }}
                />
              </p>
            )}
            {speaking && !thinking && lastNpcLine && (
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-main/70">
                <Volume2 size={11} /> speaking…
              </p>
            )}
          </div>

          <AnimatePresence mode="wait">
            {!thinking && options.length > 0 && (
              <motion.div
                key={history.length}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="mt-2.5 flex flex-wrap gap-2"
              >
                {options.slice(0, 3).map((opt, i) => (
                  <Button
                    key={opt}
                    type="button"
                    variant="neutral"
                    size="sm"
                    sound="tap"
                    hoverSound="hover"
                    className="h-auto whitespace-normal py-2 text-left"
                    disabled={voiceInputState !== "idle"}
                    onClick={() => onSay(opt)}
                  >
                    <span className="text-[11px] font-bold tabular-nums text-main">
                      {i + 1}.
                    </span>
                    {opt}
                  </Button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {inventory.length > 0 && <div className="mt-3 flex items-center gap-2">
            <label className="sr-only" htmlFor="shown-item">Inventory item</label>
            <select id="shown-item" value={selectedItem} onChange={(event) => setSelectedItem(event.target.value)} disabled={thinking}
              className="min-w-0 flex-1 rounded border border-border bg-background p-2 text-sm">
              <option value="">Choose an item…</option>
              {inventory.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <Button disabled={thinking || voiceInputState !== "idle" || !inventory.includes(selectedItem)} onClick={() => onSay(`What can you tell me about this ${selectedItem}?`, selectedItem)}>Show item</Button>
          </div>}
          <form
            className="mt-3 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const line = draft.trim();
              if (!line || thinking || voiceInputState !== "idle") return;
              setDraft("");
              onSay(line);
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                voiceInputState === "recording"
                  ? "Listening… click the square to send"
                  : voiceInputState === "transcribing"
                    ? "Transcribing on 0G…"
                    : `Say anything to ${npc.name}…`
              }
              className="min-w-0 flex-1 rounded-base"
            />
            {voiceInput.supported && (
              <Button
                type="button"
                size="icon"
                variant={voiceInputState === "recording" ? "default" : "neutral"}
                sound="tap"
                disabled={thinking || voiceInputState === "transcribing" || voiceInputState === "requesting"}
                onClick={voiceInput.toggle}
                aria-label={voiceInputState === "recording" ? "Stop and send voice" : `Speak to ${npc.name}`}
                title={voiceInputState === "recording" ? "Stop and send" : "Speak (transcribed by Whisper on 0G)"}
              >
                {voiceInputState === "recording" ? (
                  <Square size={14} />
                ) : voiceInputState === "transcribing" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Mic size={15} />
                )}
              </Button>
            )}
            <Button
              type="submit"
              size="icon"
              sound="tap"
              disabled={thinking || voiceInputState !== "idle" || !draft.trim()}
            >
              <Send size={15} />
            </Button>
          </form>
          {voiceInput.error && (
            <p className="mt-2 text-xs font-medium text-destructive" role="alert">{voiceInput.error}</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
