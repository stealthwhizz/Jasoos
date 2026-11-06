import type { DialogueMessage, DialogueRequest } from "@/lib/types";
import { dialogueTurn } from "@/lib/engine";
import { getWorld } from "@/lib/arkiv";

const MAX_HISTORY = 10;
const MAX_TEXT = 500;

function parse(body: unknown): DialogueRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.worldId !== "string" || typeof b.npcId !== "string") return null;
  if (typeof b.message !== "string" || !Array.isArray(b.history)) return null;
  const history = b.history
    .slice(-MAX_HISTORY)
    .filter(
      (m): m is DialogueMessage =>
        (m?.role === "player" || m?.role === "npc") && typeof m.text === "string",
    );
  return { worldId: b.worldId, npcId: b.npcId, history, message: b.message.slice(0, MAX_TEXT) };
}

export async function POST(req: Request) {
  const dialogue = parse(await req.json().catch(() => null));
  if (!dialogue) return Response.json({ error: "Bad dialogue request." }, { status: 400 });
  const world = await getWorld(dialogue.worldId);
  const npc = world?.bible.locations.find((l) => l.npc.id === dialogue.npcId)?.npc;
  if (!npc) return Response.json({ error: "No such character." }, { status: 404 });
  // TODO(A): history comes from the client; keep turn state server-side so it cannot be reset.
  return Response.json(await dialogueTurn(npc, dialogue));
}
