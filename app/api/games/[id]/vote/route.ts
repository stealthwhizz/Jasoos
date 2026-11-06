/**
 * `PUT /api/games/[id]/vote` — like (1), dislike (-1) or withdraw (0) a vote on a world.
 * Votes are keyed by the World ID human hash, so each verified human counts once per world.
 */

import { NextRequest, NextResponse } from "next/server";
import { voteOnGame } from "@/lib/games";
import { requireUser } from "@/lib/worldid";
import type { GameIdRouteContext, VoteRequest } from "@/lib/types/server";

export const runtime = "nodejs";

/** Sets the caller's vote and returns the world's updated `{ up, down, mine }`. */
export async function PUT(req: NextRequest, context: GameIdRouteContext) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as VoteRequest | null;
  const value = body?.value;
  if (value !== 1 && value !== -1 && value !== 0) {
    return NextResponse.json({ error: "value must be 1, -1 or 0." }, { status: 422 });
  }
  const { id } = await context.params;
  try {
    return NextResponse.json(await voteOnGame(id, user.id, value));
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (status === 403 || status === 404) {
      return NextResponse.json({ error: (err as Error).message }, { status });
    }
    console.error("[PUT /api/games/[id]/vote]", err);
    return NextResponse.json({ error: "Failed to save vote." }, { status: 500 });
  }
}
