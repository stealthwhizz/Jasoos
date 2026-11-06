import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { signRequest } from "@worldcoin/idkit/signing";
import { env, processStore } from "@/lib/env";
import { checkIdkitResult, checkPortalReply } from "./proof";

const VERIFY_URL = "https://developer.world.org/api/v4/verify";

/** What the browser needs to open the IDKit widget. Signing happens here; the key never leaves. */
export function createRpContext() {
  const { appId, action, rpId, rpSigningKey, environment } = env.worldId;
  if (!appId || !rpId || !rpSigningKey) {
    throw new Error(
      "World ID is not configured: set WORLD_APP_ID, WORLD_RP_ID, WORLD_RP_SIGNING_KEY",
    );
  }
  const sig = signRequest({ action, signingKeyHex: rpSigningKey });
  return {
    app_id: appId as `app_${string}`,
    action,
    environment,
    rp_context: {
      rp_id: rpId,
      nonce: sig.nonce,
      created_at: sig.createdAt,
      expires_at: sig.expiresAt,
      signature: sig.sig,
    },
  };
}

/**
 * Verifies an IDKit result on the server (R10). Checks action and environment locally, then
 * forwards the result unchanged to the Developer Portal and requires success === true.
 */
export async function verifyProof(
  proof: unknown,
): Promise<{ ok: true; nullifier: string } | { ok: false; reason: string }> {
  if (env.useFixtures) return { ok: true, nullifier: randomUUID() };

  const { action, environment, rpId } = env.worldId;
  const local = checkIdkitResult(proof, { action, environment });
  if (!local.ok) return local;

  let res: Response;
  try {
    res = await fetch(`${VERIFY_URL}/${encodeURIComponent(rpId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proof),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, reason: "Could not reach World ID. Try again." };
  }
  const reply = checkPortalReply(res.status, await res.json().catch(() => null));
  if (!reply.ok) {
    console.warn("[worldid] verify rejected", res.status, "reason" in reply ? reply.reason : "");
    return reply;
  }
  return local;
}

/** The only per-person value stored on Arkiv. Never store the nullifier itself. */
export function hashHuman(nullifier: string): string {
  return createHash("sha256").update(`${env.projectId}:${nullifier}`).digest("hex");
}

// shortcut: in-memory sessions are lost on restart and not shared across instances; use a signed
//   cookie or a store before deploying more than one server.
const sessions = processStore("sessions", () => new Map<string, string>());
const COOKIE = "jasoos_sid";

export async function getHumanHash(): Promise<string | null> {
  const sid = (await cookies()).get(COOKIE)?.value;
  return (sid && sessions.get(sid)) || null;
}

export async function setHumanHash(humanHash: string): Promise<void> {
  const sid = randomUUID();
  sessions.set(sid, humanHash);
  (await cookies()).set(COOKIE, sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}
