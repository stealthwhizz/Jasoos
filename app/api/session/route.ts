/**
 * `/api/session` — World ID sign-in.
 * GET returns what the IDKit widget needs, POST verifies a proof and starts a session,
 * DELETE signs out.
 */

import { NextResponse } from "next/server";
import {
  createRpContext,
  devSignInAllowed,
  endSession,
  hashHuman,
  startSession,
  verifyProof,
  worldIdConfigured,
} from "@/lib/worldid";

export const runtime = "nodejs";

/** Fresh RP context for the widget, or `{ dev: true }` when only the local test sign-in is on. */
export async function GET() {
  if (worldIdConfigured) return NextResponse.json({ dev: false, ...createRpContext() });
  if (devSignInAllowed) return NextResponse.json({ dev: true });
  return NextResponse.json({ error: "World ID is not configured on this server." }, { status: 503 });
}

/** Verifies an IDKit result on the server and signs the human in. */
export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Missing World ID proof." }, { status: 400 });
  }
  // Dev builds without World ID keys sign in as one fixed local test player.
  if (devSignInAllowed && (body as { dev?: unknown }).dev === true) {
    await startSession(hashHuman("local-dev-player"));
    return NextResponse.json({ verified: true });
  }
  if (!worldIdConfigured) {
    return NextResponse.json({ error: "World ID is not configured on this server." }, { status: 503 });
  }
  const result = await verifyProof(body);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 401 });
  await startSession(hashHuman(result.nullifier));
  return NextResponse.json({ verified: true });
}

/** Signs out. */
export async function DELETE() {
  await endSession();
  return new NextResponse(null, { status: 204 });
}
