import { hashHuman, setHumanHash, verifyProof } from "@/lib/worldid";

/** Receives the IDKit result, verifies it on the server, and marks the session as human. */
export async function POST(req: Request) {
  const proof: unknown = await req.json().catch(() => null);
  if (!proof || typeof proof !== "object") {
    return Response.json({ error: "Missing World ID proof." }, { status: 400 });
  }
  const { ok, nullifier } = await verifyProof(proof);
  if (!ok || !nullifier) return Response.json({ error: "Proof rejected." }, { status: 400 });
  await setHumanHash(hashHuman(nullifier));
  return Response.json({ verified: true });
}
