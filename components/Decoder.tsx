"use client";

import { useState } from "react";
import type { DecoderProps } from "@/lib/types/client";
import { decodeNote, plainNote, type DecodeResult } from "@/lib/engine/codec";

/** R22 UI: highlights the hidden word choices in a note and reads out the secret. */
export function Decoder({ note, evidenceKey = "", onDecoded }: DecoderProps) {
  // Normalize at the display boundary too: legacy notes can be reopened from case notes.
  const text = plainNote(note.text);
  const [editedKey, setEditedKey] = useState<string | null>(null);
  const key = editedKey ?? evidenceKey;
  const [attempt, setAttempt] = useState<{ text: string; key: string; result: DecodeResult } | null>(null);
  const result = attempt?.text === text && attempt.key === key ? attempt.result : null;

  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const { start, end } of result?.marks ?? []) {
    parts.push(text.slice(at, start));
    parts.push(
      <mark key={start} className="rounded bg-amber-200 px-0.5">
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  parts.push(text.slice(at));

  return (
    <div className="space-y-2 rounded-xl bg-neutral-100 p-4 text-sm">
      <p className="font-serif">{parts}</p>
      <label className="block font-medium">
        Decoder key
        <input aria-label="Decoder key" value={key} maxLength={3} autoCapitalize="characters"
          className="mt-1 block w-full rounded border border-border bg-background p-2 uppercase"
          onChange={(event) => setEditedKey(event.target.value.toUpperCase())} />
      </label>
      {evidenceKey && editedKey !== null && <button onClick={() => setEditedKey(null)} className="underline">Use evidence key</button>}
      <button onClick={() => {
        const decoded = decodeNote(text, key);
        setAttempt({ text: text, key, result: decoded });
        if (decoded.hidden && decoded.secret) onDecoded?.(decoded.secret);
      }} className="font-medium text-accent">Use Decoder</button>
      {result && <p role="status" className="font-medium">{result.hidden ? `Hidden message: ${result.secret}` : "Nothing hidden."}</p>}
    </div>
  );
}
