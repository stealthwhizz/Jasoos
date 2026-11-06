import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { env, processStore } from "@/lib/env";

/**
 * Verifies an IDKit result on the server (R10).
 * TODO(C): forward the payload as-is to POST https://developer.world.org/api/v4/verify/{rp_id},
 *   require success === true and the expected environment ("staging" only for the simulator),
 *   and return the nullifier. Sign requests with @worldcoin/idkit-core/signing.
 */
export async function verifyProof(proof: unknown): Promise<{ ok: boolean; nullifier?: string }> {
  if (!env.useFixtures)
    throw new Error("verifyProof: real World ID check not implemented (TODO(C))");
  void proof;
  return { ok: true, nullifier: randomUUID() };
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
