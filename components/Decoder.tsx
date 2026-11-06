"use client";

import { useState } from "react";
import type { Note } from "@/lib/types/client";
import { decodeNote, type DecodeResult } from "@/lib/engine/codec";

/** R22 UI: highlights the hidden word choices in a note and reads out the secret. */
export function Decoder({ note }: { note: Note }) {
  const [result, setResult] = useState<DecodeResult | null>(null);

  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const { start, end } of result?.marks ?? []) {
    parts.push(note.text.slice(at, start));
    parts.push(
      <mark key={start} className="rounded bg-amber-200 px-0.5">
        {note.text.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  parts.push(note.text.slice(at));

  return (
    <div className="space-y-2 rounded-xl bg-neutral-100 p-4 text-sm">
      <p className="font-serif">{parts}</p>
      {result ? (
        <p className="font-medium">
          {result.hidden ? `Hidden message: ${result.secret}` : "Nothing hidden."}
        </p>
      ) : (
        <button
          onClick={() => setResult(decodeNote(note.text))}
          className="font-medium text-accent"
        >
          Use Decoder
        </button>
      )}
    </div>
  );
}
