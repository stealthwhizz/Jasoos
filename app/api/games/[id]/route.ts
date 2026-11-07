/**
 * `GET /api/games/[id]` — load a full saved game (bible, scenes, finales).
 * `PATCH /api/games/[id]` — owner makes the world public or private.
 * `DELETE /api/games/[id]` — remove a game and its Storage assets (owner only).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  assertGameOwner,
  assetAvailable,
  buildFullGameResponse,
  canViewGame,
  deleteGameAssets,
  getGameRecord,
  toGameListItem,
} from "@/lib/games";
import { gameStore } from "@/lib/arkiv";
import { requireUser } from "@/lib/worldid";
import { getPostHogClient } from "@/lib/posthog-server";
import type { GameIdRouteContext, UpdateGameRequest } from "@/lib/types/server";

export const runtime = "nodejs";

/** Return the full game payload for play / resume. */
export async function GET(_req: NextRequest, context: GameIdRouteContext) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const game = await getGameRecord(id);
  // Someone else's private world reads as missing, so its existence is not revealed.
  if (!game || !canViewGame(game, user.id)) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }
  if (!(await assetAvailable(game.thumbnail_url))) {
    return NextResponse.json(
      { error: "This world's pictures are stored on another server, so it can't be played here." },
      { status: 404 }
    );
  }

  try {
    const full = await buildFullGameResponse(game, user.id);
    return NextResponse.json(full);
  } catch (err) {
    console.error("[GET /api/games/[id]]", err);
    return NextResponse.json({ error: "Failed to load game." }, { status: 500 });
  }
}

/** Owner sets `visibility` to "public" (listed in the community gallery) or "private" (only they can open it). */
export async function PATCH(req: NextRequest, context: GameIdRouteContext) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as UpdateGameRequest | null;
  const visibility = body?.visibility;
  if (visibility !== "public" && visibility !== "private") {
    return NextResponse.json({ error: 'visibility must be "public" or "private".' }, { status: 422 });
  }
  const { id } = await context.params;
  try {
    const game = await assertGameOwner(id, user.id);
    await gameStore().updateGame(id, { visibility });
    return NextResponse.json(toGameListItem({ ...game, visibility }));
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (status === 403 || status === 404) {
      return NextResponse.json({ error: status === 403 ? "Forbidden." : "Game not found." }, { status });
    }
    console.error("[PATCH /api/games/[id]]", err);
    return NextResponse.json({ error: "Failed to update game." }, { status: 500 });
  }
}

/** Delete a game and its scenes, plus best-effort asset cleanup. */
export async function DELETE(_req: NextRequest, context: GameIdRouteContext) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const game = await assertGameOwner(id, user.id);
    await deleteGameAssets(game.owner, game.id);
    await gameStore().deleteGame(id);

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: "world_deleted",
      properties: { game_id: id },
    });
    await posthog.flush();

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (status === 403) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (status === 404) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }
    console.error("[DELETE /api/games/[id]]", err);
    return NextResponse.json({ error: "Failed to delete game." }, { status: 500 });
  }
}
