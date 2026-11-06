"use client";

import { useRef, useState } from "react";
import { parseAccusationResult } from "./accusationResult";
import { WorldIdButton } from "./WorldIdButton";
import type { PublicManifest } from "@/lib/types";

export function AccusationPanel({
  manifest,
  unlocked,
}: {
  manifest: PublicManifest;
  unlocked: boolean;
}) {
  const [culpritId, setCulpritId] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [locked, setLocked] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [message, setMessage] = useState("");
  const [outcome, setOutcome] = useState<{ secret: string; finaleUrl?: string } | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  async function accuse(e: React.FormEvent) {
    e.preventDefault();
    if (!unlocked || !culpritId || locked || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/worlds/${encodeURIComponent(manifest.worldId)}/accuse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ culpritId }),
      });
      if (res.status === 401) {
        setNeedsVerification(true);
        setMessage(
          "Verify with World ID before making an accusation. Your guess has not been submitted.",
        );
        return;
      }
      if (res.status === 403) {
        setNeedsVerification(false);
        setLocked(true);
        setMessage("You have already made your accusation in this case.");
        return;
      }
      if (!res.ok) throw new Error("The accusation could not be confirmed. Please try again.");
      const body = parseAccusationResult(await res.json());
      setLocked(true);
      setNeedsVerification(false);
      if (body.correct) {
        setOutcome({
          secret: body.secret,
          finaleUrl: body.finaleUrl,
        });
        setMessage("Case solved.");
      } else {
        setMessage(
          "That accusation was incorrect. Your one accusation has been used. You can still explore the evidence.",
        );
      }
    } catch {
      setMessage(
        "The result could not be confirmed. Retrying will still respect the server's one-accusation limit.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="accusation-title" className="case-panel accusation-panel space-y-4">
      <p className="eyebrow">The final deduction / one accusation</p>
      <h2 id="accusation-title" className="text-xl font-semibold">
        Close the case
      </h2>
      {!unlocked ? (
        <p>Collect all three clues before naming the culprit.</p>
      ) : (
        <>
          <p className="text-sm text-neutral-600">
            Choose carefully. Each verified detective gets one accusation per case.
          </p>
          <form onSubmit={accuse} className="flex flex-wrap items-end gap-4">
            <div className="suspect-grid" role="group" aria-label="Suspect selection">
              {manifest.bible.locations.map(({ npc }, i) => (
                <button
                  type="button"
                  key={npc.id}
                  aria-pressed={culpritId === npc.id}
                  disabled={busy || locked}
                  onClick={() => setCulpritId(npc.id)}
                  className="suspect-card"
                >
                  <span className="eyebrow">Suspect 0{i + 1}</span>
                  <strong>{npc.name}</strong>
                  <span className="text-sm text-neutral-600">{npc.persona}</span>
                </button>
              ))}
            </div>
            <label htmlFor="culprit-picker" className="grid gap-2">
              Culprit
              <select
                id="culprit-picker"
                value={culpritId}
                onChange={(e) => setCulpritId(e.target.value)}
                disabled={busy || locked}
                className="rounded-lg border p-2"
              >
                <option value="">Choose a suspect</option>
                {manifest.bible.locations.map(({ npc }) => (
                  <option key={npc.id} value={npc.id}>
                    {npc.name}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={!culpritId || busy || locked} className="case-button">
              {busy ? "Submitting…" : "Submit accusation"}
            </button>
          </form>
        </>
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
      {needsVerification && !locked && (
        <WorldIdButton
          buttonLabel="Verify to accuse"
          actionDescription="Prove you are human to submit one accusation"
          onError={setMessage}
          onVerified={() => {
            setNeedsVerification(false);
            setMessage(
              "Verification complete. Your suspect selection is saved; submit when you are ready.",
            );
          }}
        />
      )}
      {outcome && (
        <div className="finale space-y-3">
          <p className="eyebrow">Case closed / the reveal</p>
          <h3 className="text-xl font-semibold">The truth behind the case</h3>
          <p>{outcome.secret}</p>
          {outcome.finaleUrl && !imageFailed ? (
            <img
              src={outcome.finaleUrl}
              alt="The case finale"
              onError={() => setImageFailed(true)}
              className="w-full rounded-xl"
            />
          ) : (
            <p className="finale-fallback rounded-xl p-5">
              Case solved. The finale image is unavailable.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
