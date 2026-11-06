/**
 * `PUT /api/games/[id]/scenes/[sceneId]` — idempotent upsert of one saved scene.
 * Uploads image/annotated frames to Storage and updates `game_scenes`.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  assertGameOwner,
  rowToScene,
  sceneToRow,
  uploadDataUrl,
} from "@/lib/games";
import { gameStore } from "@/lib/arkiv";
import { requireUser } from "@/lib/worldid";
import type { GameSceneRouteContext } from "@/lib/types/server";
import type { SceneData } from "@/lib/universe";

export const runtime = "nodejs";

/** Save or replace one scene; sets thumbnail when `sceneId` is `s0_0`. */
export async function PUT(req: NextRequest, context: GameSceneRouteContext) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: gameId, sceneId } = await context.params;

  let scene: SceneData;
  try {
    scene = (await req.json()) as SceneData;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!scene.image || scene.id !== sceneId) {
    return NextResponse.json({ error: "Scene id or image missing." }, { status: 422 });
  }

  try {
    await assertGameOwner(gameId, user.id);
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Forbidden.";
    return NextResponse.json({ error: message }, { status });
  }

  const base = `${user.id}/${gameId}/${sceneId}`;

  try {
    // Save inline data URLs; pass through existing asset URLs unchanged.
    const imageUrl = scene.image.startsWith("data:")
      ? await uploadDataUrl(`${base}/image`, scene.image)
      : scene.image;

    let annotatedUrl: string | null = null;
    if (scene.annotated) {
      annotatedUrl = scene.annotated.startsWith("data:")
        ? await uploadDataUrl(`${base}/annotated`, scene.annotated)
        : scene.annotated;
    }

    const row = sceneToRow({ ...scene, image: imageUrl, annotated: annotatedUrl ?? undefined });
    const { row: saved, created } = await gameStore().upsertScene(gameId, {
      scene_id: sceneId,
      kind: row.kind,
      x: row.x,
      y: row.y,
      data: row.data,
      image_url: imageUrl,
      annotated_url: annotatedUrl,
    });

    // Origin screen doubles as the gallery thumbnail.
    if (sceneId === "s0_0") {
      await gameStore().updateGame(gameId, { thumbnail_url: imageUrl });
    }

    return NextResponse.json(rowToScene(saved), {
      status: created ? 201 : 200,
    });
  } catch (err) {
    console.error("[PUT /api/games/[id]/scenes/[sceneId]]", err);
    return NextResponse.json({ error: "Failed to save scene." }, { status: 500 });
  }
}
