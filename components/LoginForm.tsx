"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import {
  IDKitRequestWidget,
  proofOfHuman,
  type IDKitResult,
} from "@worldcoin/idkit";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BrandBanner } from "@/components/BrandBanner";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

import type { WidgetConfig } from "@/lib/types/client";

/** Sends a proof (or the dev sign-in marker) to the server, which starts the session. */
async function postSession(body: unknown) {
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error((await res.json().catch(() => null))?.error ?? "Verification failed.");
  }
}

/** World ID sign-in (proof of human). Dev builds without World ID keys get a local test sign-in. */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Why the server refused the last proof. The widget only reports a generic error code, so
  // without this the player never learns why World ID "declined".
  const serverReason = useRef<string | null>(null);

  const finish = () => {
    posthog.capture("signed_in_with_world_id");
    router.push(safeNext);
    router.refresh();
  };

  const start = async () => {
    setError(null);
    serverReason.current = null;
    setLoading(true);
    try {
      // A fresh RP signature per attempt: each one carries its own nonce and expiry.
      const res = await fetch("/api/session");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "World ID is unavailable.");
      if (body.dev) {
        await postSession({ dev: true });
        finish();
        return;
      }
      setConfig(body as WidgetConfig);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "World ID is unavailable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="mx-auto w-full max-w-md"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
    >
      <BrandBanner />
      <p className="mt-3 text-lg font-semibold text-foreground">
        An AI story you play.
      </p>
      <p className="mt-4 max-w-sm text-base font-medium leading-relaxed text-inksoft">
        A fast, image-first game set in India — every scene generated as you
        play. Prove you&apos;re human with World ID to get started.
      </p>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-10 flex flex-col gap-4">
        <Button type="button" className="w-full" onClick={start} disabled={loading}>
          {loading ? "Opening World ID…" : "Verify with World ID"}
          <ArrowRight size={15} />
        </Button>
      </div>

      {config ? (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={config.app_id}
          action={config.action}
          rp_context={config.rp_context}
          environment={config.environment}
          allow_legacy_proofs={false}
          preset={proofOfHuman()}
          action_description="Prove you are human to play ETH Jasoos"
          handleVerify={async (result: IDKitResult) => {
            try {
              await postSession(result);
            } catch (e) {
              serverReason.current = e instanceof Error ? e.message : "Verification failed.";
              throw e;
            }
          }}
          onSuccess={finish}
          onError={(code) => {
            setOpen(false);
            setError(serverReason.current ?? `World ID error: ${code}. Please try again.`);
          }}
        />
      ) : null}
    </motion.div>
  );
}
