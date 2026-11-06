/**
 * `GET /api/games` — list saved worlds.
 * `POST /api/games` — create a new world row (quota enforced).
 */

import { NextRequest, NextResponse } from "next/server";
import { assertCanCreate, listVisibleGames, toGameListItem } from "@/lib/games";
import { gameStore } from "@/lib/arkiv";
import { requireUser } from "@/lib/worldid";
import { getPostHogClient } from "@/lib/posthog-server";
import type { CreateGameBody } from "@/lib/types/server";

export const runtime = "nodejs";

/** List public worlds plus the caller's own (private included), with vote tallies. `?owner=me` limits to the caller's. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerMe = req.nextUrl.searchParams.get("owner") === "me";
  try {
    return NextResponse.json(await listVisibleGames(user.id, ownerMe));
  } catch (err) {
    console.error("[GET /api/games]", err);
    return NextResponse.json({ error: "Failed to list games." }, { status: 500 });
  }
}

/** Create a game row after the bible is generated; assets save incrementally afterward. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateGameBody;
  try {
    body = (await req.json()) as CreateGameBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const idea = body.idea?.trim();
  if (!idea || !body.bible?.title || !body.premise?.title) {
    return NextResponse.json({ error: "Missing idea, bible, or premise." }, { status: 422 });
  }

  try {
    await assertCanCreate(user);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden.";
    const status = (err as Error & { status?: number }).status ?? 403;
    return NextResponse.json({ error: message }, { status });
  }

  let item;
  try {
    const game = await gameStore().createGame({
      owner: user.id,
      title: body.bible.title,
      idea: idea.slice(0, 1200),
      bible: body.bible,
      premise: body.premise,
    });
    item = toGameListItem(game);
  } catch (err) {
    console.error("[POST /api/games]", err);
    return NextResponse.json({ error: "Failed to create game." }, { status: 500 });
  }

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: user.id,
    event: "world_created",
    properties: { game_id: item.id, title: item.title },
  });
  await posthog.flush();

  return NextResponse.json(item, {
    status: 201,
    headers: { Location: `/api/games/${item.id}` },
  });
}
