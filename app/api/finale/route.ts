import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/worldid";
import { gameStore } from "@/lib/arkiv";
import { getGameRecord, uploadDataUrl } from "@/lib/games";
import { generateFinale, seal, unseal } from "@/lib/world-engine";
import type { Mystery } from "@/lib/universe";
import type { FinaleData } from "@/lib/types/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type FinaleRequest = {
  /** The saved world. Its bible (not one from the client) judges the accusation. */
  gameId?: string | null;
  /** Index (0–2) of the character the player accuses. Absent: a defeat (heat or time ran out). */
  accused?: number;
  /** For defeats: which fail state fired, in plain words. */
  reason?: string;
};

/**
 * `POST /api/finale` — ends a run. With `accused`, the server unseals the culprit and returns the
 * victory or defeat finale; the answer never reaches the browser before a correct accusation.
 * Each world generates at most one victory and one defeat finale, whoever ends a run first;
 * later runs get the saved one (`generated: false`), so ending runs cannot spend 0G credits.
 */
export async function POST(req: NextRequest) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: FinaleRequest;
  try {
    body = (await req.json()) as FinaleRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.gameId) {
    return NextResponse.json({ error: "gameId is required." }, { status: 422 });
  }
  if (body.accused !== undefined && ![0, 1, 2].includes(body.accused)) {
    return NextResponse.json({ error: "accused must be 0, 1 or 2." }, { status: 422 });
  }

  try {
    const game = await getGameRecord(body.gameId);
    if (!game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }
    const { bible } = game;
    const { culprit } = unseal<Mystery>(bible.story.sealed);

    if (body.accused === culprit) {
      if (game.sealed_victory) {
        return NextResponse.json({ finale: unseal<FinaleData>(game.sealed_victory), generated: false });
      }
      const finale = await generateFinale(bible, "victory");
      const image = await uploadDataUrl(`${game.owner}/${game.id}/finale-victory`, finale.image);
      const saved: FinaleData = { ...finale, image };
      // The victory finale spells out the secret, so it is stored sealed.
      await gameStore().updateGame(game.id, { sealed_victory: seal(saved) });
      return NextResponse.json({ finale: saved, generated: true });
    }

    if (game.finale.defeat) {
      return NextResponse.json({ finale: game.finale.defeat, generated: false });
    }
    const reason =
      body.accused === undefined
        ? body.reason
        : `you accused ${bible.npcs[body.accused]?.name ?? "the wrong person"}, and the real culprit walked free`;
    const finale = await generateFinale(bible, "defeat", reason);
    const image = await uploadDataUrl(`${game.owner}/${game.id}/finale-defeat`, finale.image);
    const saved: FinaleData = { ...finale, image };
    await gameStore().updateGame(game.id, { finale: { ...game.finale, defeat: saved } });
    return NextResponse.json({ finale: saved, generated: true });
  } catch (err) {
    console.error("[/api/finale]", err);
    return NextResponse.json(
      { error: "The ending slipped away. Try again." },
      { status: 500 }
    );
  }
}
