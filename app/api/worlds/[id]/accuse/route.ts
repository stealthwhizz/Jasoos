import { getWorld, hasAccused, recordAccusation } from "@/lib/arkiv";
import { getHumanHash } from "@/lib/worldid";

/** One accusation per human per case (R24). The culprit never leaves the server unless correct. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const humanHash = await getHumanHash();
  if (!humanHash) {
    return Response.json({ error: "Verify with World ID to accuse." }, { status: 401 });
  }
  const world = await getWorld(id);
  if (!world) return Response.json({ error: "World not found." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { culpritId?: unknown } | null;
  if (typeof body?.culpritId !== "string") {
    return Response.json({ error: "Name a culprit." }, { status: 400 });
  }
  // TODO(C): the check and the write are not atomic; two parallel requests could both pass.
  if (await hasAccused(id, humanHash)) {
    return Response.json(
      { error: "You already made your accusation in this case." },
      { status: 403 },
    );
  }
  const { mystery } = world.bible;
  const correct = body.culpritId === mystery.culpritNpcId;
  await recordAccusation({ worldKey: id, humanHash, culpritId: body.culpritId }, correct);
  if (!correct) return Response.json({ correct });
  const finaleUrl = world.assets.find((a) => a.kind === "finale")?.url;
  return Response.json({ correct, secret: mystery.secret, finaleUrl });
}
