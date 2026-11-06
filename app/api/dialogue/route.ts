import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { DialogueClosedError, dialogueTurn } from "@/lib/engine/dialogueTurn";
import { loadNpcState, saveNpcState } from "@/lib/engine/dialogueStore";
import { getWorld } from "@/lib/arkiv";

const MAX_TEXT = 500;
const PLAYER_COOKIE = "jasoos_player";

/** Guests play without World ID, so dialogue state is keyed by an anonymous player cookie. */
async function playerId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(PLAYER_COOKIE)?.value;
  if (existing) return existing;
  const id = randomUUID();
  jar.set(PLAYER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return id;
}

function parse(body: unknown): { worldId: string; npcId: string; message: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.worldId !== "string" || typeof b.npcId !== "string") return null;
  if (typeof b.message !== "string" || !b.message.trim()) return null;
  // Any client-sent `history` is ignored: the server keeps the transcript and turn count.
  return { worldId: b.worldId, npcId: b.npcId, message: b.message.trim().slice(0, MAX_TEXT) };
}

/** One NPC turn (R7). Returns the reply, a clue flag, a close flag, and the 0G ticker event. */
export async function POST(req: Request) {
  const input = parse(await req.json().catch(() => null));
  if (!input) return Response.json({ error: "Bad dialogue request." }, { status: 400 });

  const world = await getWorld(input.worldId);
  const npc = world?.bible.locations.find((l) => l.npc.id === input.npcId)?.npc;
  if (!npc) return Response.json({ error: "No such character." }, { status: 404 });

  const pid = await playerId();
  const state = loadNpcState(pid, input.worldId, npc.id);
  try {
    const { state: next, ...turn } = await dialogueTurn(npc, state, input.message);
    saveNpcState(pid, input.worldId, npc.id, next);
    return Response.json(turn);
  } catch (err) {
    if (err instanceof DialogueClosedError) {
      return Response.json(
        { error: err.message, clueRevealed: state.clueRevealed, close: true },
        { status: 409 },
      );
    }
    console.error("[dialogue]", err);
    return Response.json({ error: "The character did not answer. Try again." }, { status: 502 });
  }
}
