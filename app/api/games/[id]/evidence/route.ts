import { NextResponse } from "next/server";
import { gameStore } from "@/lib/arkiv";
import { getGameRecord } from "@/lib/games";
import { createRpContext, devSignInAllowed, requireUser, verifyProof, worldIdConfigured } from "@/lib/worldid";
import { unseal } from "@/lib/world-engine";
import type { GameIdRouteContext } from "@/lib/types/server";
import type { Mystery } from "@/lib/universe";

export const runtime = "nodejs";

/** Fresh per-world evidence proof request; dev mode mirrors local sign-in. */
export async function GET(_req: Request, context: GameIdRouteContext) {
  if (!(await requireUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!(await getGameRecord(id))) return NextResponse.json({ error: "Game not found." }, { status: 404 });
  if (devSignInAllowed) return NextResponse.json({ dev: true });
  if (!worldIdConfigured) return NextResponse.json({ error: "World ID is not configured." }, { status: 503 });
  return NextResponse.json({ dev: false, ...createRpContext(`evidence-${id}`) });
}

/** Reveal the key only after the verified human's evidence unlock is durable. */
export async function POST(req: Request, context: GameIdRouteContext) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    const game = await getGameRecord(id);
    if (!game) return NextResponse.json({ error: "Game not found." }, { status: 404 });
    const mystery = unseal<Mystery>(game.bible.story.sealed);
    if (!mystery.key) return NextResponse.json({ error: "This older world has no sealed evidence." }, { status: 422 });
    const store = gameStore();
    if (!(await store.hasUnlock(id, user.id))) {
      const body = await req.json().catch(() => null);
      if (!(devSignInAllowed && body?.dev === true)) {
        if (!worldIdConfigured) return NextResponse.json({ error: "World ID is not configured." }, { status: 503 });
        const result = await verifyProof(body?.proof, `evidence-${id}`);
        if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
      }
      // Persistence must complete before any key or fallback note reaches the browser.
      await store.unlockEvidence(id, user.id);
    }
    return NextResponse.json({ key: mystery.key, evidenceNote: mystery.evidenceNote, unlocks: await store.countUnlocks(id) });
  } catch (error) {
    console.error("[/api/games/[id]/evidence]", error);
    return NextResponse.json({ error: "Evidence could not be opened. Try again." }, { status: 503 });
  }
}
