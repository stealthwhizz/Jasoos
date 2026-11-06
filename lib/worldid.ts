/**
 * World ID sign-in: proof verification on the server and a signed session cookie.
 * A player is identified only by a salted hash of their World ID nullifier.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { signRequest } from "@worldcoin/idkit/signing";
import { withRetry, DEFAULT_RETRY_OPTS } from "@/lib/retry";
import type { SessionUser } from "@/lib/types/server";

const VERIFY_URL = "https://developer.world.org/api/v4/verify";
export const SESSION_COOKIE = "ETH Jasoos_session";
const SESSION_DAYS = 30;

const config = {
  appId: process.env.WORLD_APP_ID ?? "",
  action: process.env.WORLD_ACTION_ID || "sign-in",
  rpId: process.env.WORLD_RP_ID ?? "",
  rpSigningKey: process.env.WORLD_RP_SIGNING_KEY ?? "",
  environment: worldEnvironment(process.env.WORLD_ENVIRONMENT),
};

/**
 * Which World ID network proofs come from (WORLD_ENVIRONMENT):
 * - "staging": the web simulator (https://simulator.worldcoin.org). The default.
 * - "sandbox": the World ID Sandbox test app on a phone (TestFlight / Play test track). Turn off
 *   its fraud/risk/attestation enforcement under "World ID Sandbox" in the Developer Portal, or
 *   World refuses its proofs with 403 integrity_verification_failed.
 * - "production": the real World App.
 * Proofs are verified at the same endpoint; their `environment` must match this value.
 */
export type WorldEnvironment = "production" | "staging" | "sandbox";
export function worldEnvironment(value: string | undefined): WorldEnvironment {
  return value === "production" || value === "sandbox" ? value : "staging";
}

/** True when World ID keys are set. Without them, dev builds offer a local test sign-in. */
export const worldIdConfigured = Boolean(config.appId && config.rpId && config.rpSigningKey);

/** Dev-only sign-in is allowed when World ID is not configured and this is not production. */
export const devSignInAllowed = !worldIdConfigured && process.env.NODE_ENV !== "production";

/** What the browser needs to open the IDKit widget. Signing happens here; the key never leaves. */
export function createRpContext(action = config.action) {
  const sig = signRequest({ action, signingKeyHex: config.rpSigningKey });
  return {
    app_id: config.appId as `app_${string}`,
    action,
    environment: config.environment,
    rp_context: {
      rp_id: config.rpId,
      nonce: sig.nonce,
      created_at: sig.createdAt,
      expires_at: sig.expiresAt,
      signature: sig.sig,
    },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Verifies an IDKit result: checks action, environment and a single nullifier locally,
 * then forwards the result unchanged to the World Developer Portal.
 */
export async function verifyProof(
  proof: unknown,
  action = config.action
): Promise<{ ok: true; nullifier: string } | { ok: false; reason: string }> {
  if (!isRecord(proof)) return { ok: false, reason: "Proof is not an object." };
  if (proof.action !== action) return { ok: false, reason: "Proof is for another action." };
  // The simulator issues "staging" proofs and the Sandbox app "sandbox" ones. Production must
  // never accept either, so the proof's environment must match WORLD_ENVIRONMENT exactly.
  if (proof.environment !== config.environment) {
    return { ok: false, reason: `Proof environment is not ${config.environment}.` };
  }
  const responses = Array.isArray(proof.responses) ? proof.responses : [];
  const nullifiers = new Set(
    responses
      .map((r) => (isRecord(r) && typeof r.nullifier === "string" ? r.nullifier : null))
      .filter((n): n is string => Boolean(n))
  );
  const [nullifier] = nullifiers;
  if (nullifiers.size !== 1 || !nullifier) {
    return { ok: false, reason: "Proof must carry one nullifier." };
  }

  let res: Response;
  try {
    res = await withRetry(async () => {
      const response = await fetch(`${VERIFY_URL}/${encodeURIComponent(config.rpId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proof),
      signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 429 || response.status >= 500) {
        throw Object.assign(new Error("World ID temporarily unavailable."), { status: response.status });
      }
      return response;
    }, DEFAULT_RETRY_OPTS);
  } catch {
    return { ok: false, reason: "Could not reach World ID. Try again." };
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.status === 200 && isRecord(body) && body.success === true) {
    return { ok: true, nullifier };
  }
  const code = isRecord(body) ? (body.code ?? body.detail ?? body.message) : undefined;
  return { ok: false, reason: `World ID rejected the proof (${res.status}${code ? `, ${code}` : ""}).` };
}

/** The player id stored in games and on Arkiv. Never store the nullifier itself. */
export function hashHuman(nullifier: string): string {
  return createHash("sha256").update(`ETH Jasoos:${nullifier}`).digest("hex");
}

/** The server-only secret behind session cookies and sealed mysteries (`SESSION_SECRET`). */
export function serverSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set.");
  // Fixed so the proxy and route bundles agree in dev; production requires SESSION_SECRET.
  return "ETH Jasoos-dev-only-session-secret";
}

const sign = (payload: string) =>
  createHmac("sha256", serverSecret()).update(payload).digest("base64url");

/**
 * Reads a session cookie value: `<humanHash>.<expiresMs>.<hmac>`.
 * Returns the user, or null if missing, expired, or tampered with.
 */
export function readSession(value: string | undefined): SessionUser | null {
  const [id, exp, mac] = value?.split(".") ?? [];
  if (!id || !exp || !mac || Number(exp) < Date.now()) return null;
  const want = Buffer.from(sign(`${id}.${exp}`));
  const got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got) ? { id } : null;
}

/** Returns the signed-in player, or null. */
export async function requireUser(): Promise<SessionUser | null> {
  return readSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Starts a session for a verified human. */
export async function startSession(humanHash: string): Promise<void> {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  (await cookies()).set(SESSION_COOKIE, `${humanHash}.${exp}.${sign(`${humanHash}.${exp}`)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(exp),
  });
}

/** Ends the current session. */
export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
