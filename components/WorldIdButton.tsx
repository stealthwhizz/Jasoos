"use client";

import { useState } from "react";
import {
  IDKitRequestWidget,
  proofOfHuman,
  type IDKitResult,
  type RpContext,
} from "@worldcoin/idkit";

interface Config {
  app_id: `app_${string}`;
  action: string;
  environment: "production" | "staging";
  rp_context: RpContext;
}

async function postProof(body: unknown) {
  const res = await fetch("/api/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error((await res.json().catch(() => null))?.error ?? "Verification failed.");
}

/**
 * Opens World ID (proof of human), sends the result to /api/verify, and calls onVerified once the
 * server has accepted it. With fixtures on, it skips the widget and posts a fixture proof.
 */
export function WorldIdButton({
  onVerified,
  onError,
}: {
  onVerified: () => void;
  onError: (message: string) => void;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    onError("");
    try {
      // A fresh RP signature per attempt: each one carries its own nonce and expiry.
      const res = await fetch("/api/verify");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "World ID is unavailable.");
      if (body.fixtures) {
        await postProof({ fixture: true });
        onVerified();
        return;
      }
      setConfig(body as Config);
      setOpen(true);
    } catch (err) {
      onError(err instanceof Error ? err.message : "World ID is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className="rounded-full border border-neutral-300 px-5 py-2 text-sm font-medium hover:bg-neutral-100 disabled:opacity-40"
      >
        {loading ? "Opening World ID…" : "Verify with World ID"}
      </button>
      {config && (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={config.app_id}
          action={config.action}
          rp_context={config.rp_context}
          environment={config.environment}
          allow_legacy_proofs={false}
          preset={proofOfHuman()}
          action_description="Prove you are human to create a world"
          handleVerify={async (result: IDKitResult) => postProof(result)}
          onSuccess={() => onVerified()}
          onError={(code) => onError(`World ID error: ${code}`)}
        />
      )}
    </>
  );
}
