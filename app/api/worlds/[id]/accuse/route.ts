import { getWorld, hasAccused, oneAccusationAtATime, recordAccusation } from "@/lib/arkiv";
import { getHumanHash } from "@/lib/worldid";

/**
 * One accusation per human per case (R24). The answer is checked on the server, the guess is
 * written to Arkiv before any result is returned, and the culprit never leaves the server unless
 * the guess is right.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const humanHash = await getHumanHash();
  if (!humanHash) {
    return Response.json({ error: "Verify with World ID to accuse." }, { status: 401 });
  }
  const world = await getWorld(id);
  if (!world) return Response.json({ error: "World not found." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { culpritId?: unknown } | null;
  const culpritId = body?.culpritId;
  if (typeof culpritId !== "string" || !world.bible.locations.some((l) => l.npc.id === culpritId)) {
    return Response.json({ error: "Name one of the people in this case." }, { status: 400 });
  }

  const already = () =>
    Response.json({ error: "You already made your accusation in this case." }, { status: 403 });

  const result = await oneAccusationAtATime(id, humanHash, async () => {
    if (await hasAccused(id, humanHash)) return already();
    const { mystery } = world.bible;
    const correct = culpritId === mystery.culpritNpcId;
    try {
      // Record first: if the write fails, no answer is revealed and the guess can be retried.
      await recordAccusation({ worldKey: id, humanHash, culpritId }, correct);
    } catch (err) {
      console.error("[accuse] record failed", err);
      return Response.json(
        { error: "Could not record your accusation. Try again." },
        { status: 503 },
      );
    }
    if (!correct) return Response.json({ correct });
    const finaleUrl = world.assets.find((a) => a.kind === "finale")?.url;
    return Response.json({ correct, secret: mystery.secret, finaleUrl });
  });
  return result ?? already();
}
