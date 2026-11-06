import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/worldid";
import { gameStore } from "@/lib/arkiv";
import { getGameRecord, uploadDataUrl } from "@/lib/games";
import { generateFinale, readMystery, seal, unseal } from "@/lib/world-engine";
import { withRequestIds } from "@/lib/zg-client";
import type { FinaleData, FinaleRequest } from "@/lib/types/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * `POST /api/finale` — ends a run. With `accused`, the server unseals the culprit and returns the
 * victory or defeat finale; the answer never reaches the browser before a correct accusation.
 * Each world generates at most one victory and one defeat finale, whoever ends a run first;
 * later runs get the saved one (`generated: false`), so ending runs cannot spend 0G credits.
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
    const { culprit } = readMystery(bible);

    if (body.accused !== undefined && culprit < 0) {
      // Worlds made before the answer was sealed never recorded a culprit, so there is nothing to judge.
      return NextResponse.json(
        { error: "This older world has no culprit on record, so accusations are off here." },
        { status: 422 }
      );
    }

    if (body.accused !== undefined) {
      try {
        const onRecord = await gameStore().recordAccusation({
          gameId: game.id, humanHash: user.id, accused: body.accused, correct: body.accused === culprit,
        });
        // One suspect per human per world. Repeating the same suspect is a retry (say the finale
        // failed to generate) and goes through; naming anyone else is refused.
        if (onRecord.accused !== body.accused) {
          return NextResponse.json({ error: "You already accused someone in this world." }, { status: 409 });
        }
      } catch (error) {
        console.error("[/api/finale] accusation persistence failed", error);
        return NextResponse.json({ error: "Could not record your accusation. Try again." }, { status: 503 });
      }
    }

    if (body.accused === culprit) {
      if (game.sealed_victory) {
        const finale = unseal<FinaleData>(game.sealed_victory);
        return NextResponse.json({ finale, generated: false, requestIds: [] });
      }
      const { result: finale, requestIds } = await withRequestIds(() =>
        generateFinale(bible, "victory")
      );
      const image = await uploadDataUrl(`${game.owner}/${game.id}/finale-victory`, finale.image);
      const saved: FinaleData = { ...finale, image };
      // The victory finale spells out the secret, so it is stored sealed.
      await gameStore().updateGame(game.id, { sealed_victory: seal(saved) });
      return NextResponse.json({ finale: saved, generated: true, requestIds });
    }

    if (game.finale.defeat) {
      return NextResponse.json({ finale: game.finale.defeat, generated: false, requestIds: [] });
    }
    const reason =
      body.accused === undefined
        ? body.reason
        : `you accused ${bible.npcs[body.accused]?.name ?? "the wrong person"}, and the real culprit walked free`;
    const { result: finale, requestIds } = await withRequestIds(() =>
      generateFinale(bible, "defeat", reason)
    );
    const image = await uploadDataUrl(`${game.owner}/${game.id}/finale-defeat`, finale.image);
    const saved: FinaleData = { ...finale, image };
    await gameStore().updateGame(game.id, { finale: { ...game.finale, defeat: saved } });
    return NextResponse.json({ finale: saved, generated: true, requestIds });
  } catch (err) {
    console.error("[/api/finale]", err);
    return NextResponse.json(
      { error: "The ending slipped away. Try again." },
      { status: 500 }
    );
  }
}
