"use client";

import { useState } from "react";
import { IDKitRequestWidget, proofOfHuman, type IDKitResult } from "@worldcoin/idkit";

import { fetchClientJson } from "./clientRequest";
import { parseWorldIdConfig, postWorldIdProof, type WorldIdConfig } from "./worldIdClient";

/**
 * Opens World ID (proof of human), sends the result to /api/verify, and calls onVerified once the
 * server has accepted it. With fixtures on, it skips the widget and posts a fixture proof.
 */
export function WorldIdButton({
  onVerified,
  onError,
  buttonLabel = "Verify with World ID",
  actionDescription = "Prove you are human to create a world",
}: {
  onVerified: () => void;
  onError: (message: string) => void;
  buttonLabel?: string;
  actionDescription?: string;
}) {
  const [config, setConfig] = useState<WorldIdConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function start() {
    if (loading || open) return;
    setLoading(true);
    onError("");
    try {
      // A fresh RP signature per attempt: each one carries its own nonce and expiry.
      const { response, body } = await fetchClientJson<Record<string, unknown>>(
        "/api/verify",
        "World ID is unavailable. Please try again.",
      );
      if (!response.ok)
        throw new Error(typeof body.error === "string" ? body.error : "World ID is unavailable.");
      const configuration = parseWorldIdConfig(body);
      if ("fixtures" in configuration) {
        await postWorldIdProof({ fixture: true });
        onVerified();
        return;
      }
      setConfig(configuration);
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
        disabled={loading || open}
        className="case-button secondary"
      >
        {loading ? "Opening verification…" : buttonLabel}
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
          action_description={actionDescription}
          handleVerify={async (result: IDKitResult) => postWorldIdProof(result)}
          onSuccess={() => {
            setOpen(false);
            onVerified();
          }}
          onError={(code) => {
            setOpen(false);
            onError(`World ID error: ${code}`);
          }}
        />
      )}
    </>
  );
}
