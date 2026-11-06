import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/worldid";
import { gameStore } from "@/lib/arkiv";
import { getGameRecord, uploadDataUrl } from "@/lib/games";
import { generateFinale, seal, unseal } from "@/lib/world-engine";
import type { GameBible, Mystery } from "@/lib/universe";
import type { FinaleData } from "@/lib/types/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type FinaleRequest = {
  bible: GameBible;
  /** Index (0–2) of the character the player accuses. Absent: a defeat (heat or time ran out). */
  accused?: number;
  /** Saved game id. When set, the saved bible judges the accusation, not the one in the body. */
  gameId?: string | null;
  /** For defeats: which fail state fired, in plain words. */
  reason?: string;
};

/**
 * `POST /api/finale` — ends a run. With `accused`, the server unseals the culprit and returns the
 * victory or defeat finale; the answer never reaches the browser before a correct accusation.
 * `generated` is false when a saved finale was returned.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: FinaleRequest;
  try {
    body = (await req.json()) as FinaleRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.bible?.story?.sealed) {
    return NextResponse.json({ error: "Missing game bible." }, { status: 400 });
  }
  if (body.accused !== undefined && ![0, 1, 2].includes(body.accused)) {
    return NextResponse.json({ error: "accused must be 0, 1 or 2." }, { status: 422 });
  }

  try {
    const game = body.gameId ? await getGameRecord(body.gameId) : null;
    // The saved copy decides, so a client cannot swap in a bible whose answer it already knows.
    const bible = game?.bible ?? body.bible;
    const isOwner = game?.owner === user.id;

    if (body.accused === undefined) {
      const finale = await generateFinale(bible, "defeat", body.reason);
      return NextResponse.json({ finale, generated: true });
    }

    const { culprit } = unseal<Mystery>(bible.story.sealed);
    if (body.accused !== culprit) {
      // Visitors replay the owner's saved defeat instead of spending a generation.
      if (game && !isOwner && game.finale.defeat) {
        return NextResponse.json({ finale: game.finale.defeat, generated: false });
      }
      const name = bible.npcs[body.accused]?.name ?? "the wrong person";
      const finale = await generateFinale(
        bible,
        "defeat",
        `you accused ${name}, and the real culprit walked free`
      );
      return NextResponse.json({ finale, generated: true });
    }

    if (game?.sealed_victory) {
      return NextResponse.json({ finale: unseal<FinaleData>(game.sealed_victory), generated: false });
    }
    const finale = await generateFinale(bible, "victory");
    if (!game || !isOwner) {
      return NextResponse.json({ finale, generated: true });
    }
    const image = await uploadDataUrl(`${user.id}/${game.id}/finale-victory`, finale.image);
    const saved: FinaleData = { ...finale, image };
    await gameStore().updateGame(game.id, { sealed_victory: seal(saved) });
    return NextResponse.json({ finale: saved, generated: true });
  } catch (err) {
    console.error("[/api/finale]", err);
    return NextResponse.json(
      { error: "The ending slipped away. Try again." },
      { status: 500 }
    );
  }
}
