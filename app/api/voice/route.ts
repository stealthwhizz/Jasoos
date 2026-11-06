import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/worldid";
import { zgSpeak } from "@/lib/zg-voice";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/voice — a character's line spoken by MiniMax speech on 0G Private Computer.
 * Body: { text, voice? } where `voice` is the character's speaker name from the bible.
 * Returns MP3 bytes; the 0G model and request ID are in `x-0g-model` / `x-0g-request-id`.
 * On failure the client falls back to the browser's own voice, so this is best-effort.
 */
export async function POST(req: NextRequest) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { text?: unknown; voice?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) return NextResponse.json({ error: "Missing text." }, { status: 400 });
  const voice = typeof body?.voice === "string" ? body.voice : undefined;

  try {
    const { audio, request } = await zgSpeak(text, voice);
    return new NextResponse(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        ...(request ? { "x-0g-model": request.model, "x-0g-request-id": request.requestId } : {}),
      },
    });
  } catch (err) {
    console.error("[/api/voice] 0G speech failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Voice is unavailable right now." }, { status: 502 });
  }
}
