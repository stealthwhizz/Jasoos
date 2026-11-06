import { env } from "@/lib/env";
import { createRpContext, hashHuman, setHumanHash, verifyProof } from "@/lib/worldid";

/** Returns a freshly signed RP context for the IDKit widget, or { fixtures: true } with no keys. */
export async function GET() {
  if (env.useFixtures) return Response.json({ fixtures: true });
  try {
    return Response.json({ fixtures: false, ...createRpContext() });
  } catch (err) {
    console.error("[verify] rp context", err);
    return Response.json({ error: "World ID is not configured on this server." }, { status: 503 });
  }
}

/** Receives the IDKit result, verifies it on the server, and marks the session as human. */
export async function POST(req: Request) {
  const proof: unknown = await req.json().catch(() => null);
  if (!proof || typeof proof !== "object") {
    return Response.json({ error: "Missing World ID proof." }, { status: 400 });
  }
  const result = await verifyProof(proof);
  if (!result.ok) return Response.json({ error: result.reason }, { status: 400 });
  await setHumanHash(hashHuman(result.nullifier));
  return Response.json({ verified: true });
}
