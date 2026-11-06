"use client";

import { useRef, useState } from "react";
import { IDKitRequestWidget, proofOfHuman, type IDKitResult } from "@worldcoin/idkit";
import { Button } from "@/components/ui/button";
import type { EvidenceBoxProps, EvidenceResponse, WidgetConfig } from "@/lib/types/client";

/** Open sealed evidence, preserving returning access and server rejection reasons. */
export function EvidenceBox({ gameId, evidence, onUnlock }: EvidenceBoxProps) {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reason = useRef<string | null>(null);
  const endpoint = `/api/games/${encodeURIComponent(gameId ?? "")}/evidence`;

  const unlock = async (body: unknown, checkReturning = false) => {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    // A new unlock needs a proof; a returning unlock can be restored without opening IDKit.
    if (checkReturning && response.status === 400) return false;
    if (!response.ok) throw new Error(data.error ?? "Evidence could not be opened.");
    onUnlock(data as EvidenceResponse);
    setOpen(false);
    return true;
  };

  if (evidence) return <div role="status" className="space-y-2 rounded border border-main p-3">
    <p>Evidence key: <strong>{evidence.key}</strong></p>
    {evidence.evidenceNote && <p>{evidence.evidenceNote}</p>}
    <p className="text-xs">{evidence.unlocks} evidence unlocks</p>
  </div>;

  return <div className="space-y-2">
    <Button disabled={loading || !gameId} onClick={async () => {
      setLoading(true); setError(null); reason.current = null;
      try {
        const response = await fetch(endpoint);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "World ID is unavailable.");
        if (data.dev) { await unlock({ dev: true }); return; }
        if (await unlock({}, true)) return;
        setConfig(data); setOpen(true);
      } catch (failure) { setError(failure instanceof Error ? failure.message : "Evidence could not be opened."); }
      finally { setLoading(false); }
    }}>{loading ? "Opening evidence…" : "Open with World ID"}</Button>
    {error && <p role="alert">{error}</p>}
    {config && <IDKitRequestWidget open={open} onOpenChange={setOpen} app_id={config.app_id}
      action={config.action} rp_context={config.rp_context} environment={config.environment}
      allow_legacy_proofs={false} preset={proofOfHuman()} action_description="Open this case's sealed evidence"
      handleVerify={async (proof: IDKitResult) => {
        try { await unlock({ proof }); }
        catch (failure) { reason.current = failure instanceof Error ? failure.message : "Verification failed."; throw failure; }
      }} onSuccess={() => setOpen(false)} onError={(code) => { setOpen(false); setError(reason.current ?? `World ID error: ${code}. Try again.`); }} />}
  </div>;
}
