import type { RpContext } from "@worldcoin/idkit";
import { fetchClientJson } from "./clientRequest";

export interface WorldIdConfig {
  app_id: `app_${string}`;
  action: string;
  environment: "production" | "staging";
  rp_context: RpContext;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Validate the transport shape only. Signature and proof verification remain server/IDKit jobs. */
export function parseWorldIdConfig(value: unknown): { fixtures: true } | WorldIdConfig {
  const failure = "World ID configuration is unavailable. Please try again.";
  if (!isRecord(value)) throw new Error(failure);
  if (value.fixtures === true) return { fixtures: true };
  const context = value.rp_context;
  if (
    value.fixtures !== false ||
    typeof value.app_id !== "string" ||
    !/^app_.+/.test(value.app_id) ||
    typeof value.action !== "string" ||
    (value.environment !== "production" && value.environment !== "staging") ||
    !isRecord(context) ||
    ![context.rp_id, context.nonce, context.signature].every(
      (part) => typeof part === "string" && part.length > 0,
    ) ||
    typeof context.created_at !== "number" ||
    !Number.isFinite(context.created_at) ||
    typeof context.expires_at !== "number" ||
    !Number.isFinite(context.expires_at) ||
    context.expires_at <= context.created_at
  )
    throw new Error(failure);
  return value as unknown as WorldIdConfig;
}

export async function postWorldIdProof(proof: unknown): Promise<void> {
  const message = "Verification unavailable. Please try again.";
  const { response, body } = await fetchClientJson<{ verified?: unknown; error?: unknown }>(
    "/api/verify",
    message,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proof),
    },
  );
  if (!response.ok || body.verified !== true) {
    throw new Error(typeof body.error === "string" ? body.error : message);
  }
}
