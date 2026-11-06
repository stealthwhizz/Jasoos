/**
 * `POST /api/screen` — generate one overworld tile at grid coordinate (x, y).
 * Supports continuity from either inline base64 or a saved Storage URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchImageAsBase64, getGameRecord } from "@/lib/games";
import { gameStore } from "@/lib/arkiv";
import { MAX_STREET_SCREENS } from "@/lib/constants";
import { requireUser } from "@/lib/worldid";
import type { ScreenRequest } from "@/lib/types/server";
import { generateScreen } from "@/lib/world-engine";
import { withRequestIds } from "@/lib/zg-client";

export const runtime = "nodejs";
export const maxDuration = 120;

const DIRS = new Set(["n", "e", "s", "w"]);

/**
 * Paint, trace, and vision-parse the next overworld screen. Only the world's owner may generate,
 * and only until it has MAX_STREET_SCREENS street screens; both are checked before any 0G call.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ScreenRequest;
  try {
    body = (await req.json()) as ScreenRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (
    !body.bible?.story?.goal ||
    !Array.isArray(body.bible.rooms) ||
    typeof body.x !== "number" ||
    typeof body.y !== "number"
  ) {
    return NextResponse.json(
      { error: "Missing bible or screen coordinates." },
      { status: 400 }
    );
  }
  if (!body.gameId) {
    return NextResponse.json({ error: "gameId is required." }, { status: 422 });
  }
  try {
    const game = await getGameRecord(body.gameId);
    if (!game) return NextResponse.json({ error: "Game not found." }, { status: 404 });
    if (game.owner !== user.id) {
      return NextResponse.json({ error: "Only the world's creator can explore new ground." }, { status: 403 });
    }
    const streets = (await gameStore().listScenes(game.id)).filter((s) => s.kind === "street").length;
    if (streets >= MAX_STREET_SCREENS) {
      return NextResponse.json({ error: "This world has no more ground to explore." }, { status: 409 });
    }
    // Resume from Storage: fetch the neighbor frame server-side when needed.
    let prevImage = body.prevImage || null;
    if (!prevImage && body.prevImageUrl) {
      prevImage = await fetchImageAsBase64(body.prevImageUrl);
    }
    const { result: scene, requestIds } = await withRequestIds(() =>
      generateScreen(
        body.bible,
        Math.round(body.x),
        Math.round(body.y),
        body.arriveFrom && DIRS.has(body.arriveFrom) ? body.arriveFrom : null,
        prevImage,
        (body.unplacedRooms ?? []).filter((r) => Number.isInteger(r) && r >= 0 && r <= 2)
      )
    );
    return NextResponse.json({ scene, requestIds });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to dream the next screen.";
    console.error("[/api/screen]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
