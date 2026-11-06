import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/worldid";
import { MAX_AUDIO_BYTES, zgTranscribe } from "@/lib/zg-voice";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/transcribe — the player speaks to a character; Whisper on 0G Private Computer
 * turns it into text. Body: multipart form with an `audio` file (webm/ogg/mp4/wav, ≤ 2 MB).
 * Returns { text, requestIds } so the line shows its 0G request ID like every other call.
 */
export async function POST(req: NextRequest) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "No recording received." }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "That recording is too long. Keep it under 15 seconds." }, { status: 413 });
  }
  const type = file.type || "audio/webm";
  const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") || type.includes("m4a") ? "m4a" : type.includes("wav") ? "wav" : "webm";

  try {
    const { text, request } = await zgTranscribe(Buffer.from(await file.arrayBuffer()), `speech.${ext}`, type);
    if (!text) return NextResponse.json({ error: "Didn't catch that. Try again a little louder." }, { status: 422 });
    return NextResponse.json({ text, requestIds: request ? [request] : [] });
  } catch (err) {
    console.error("[/api/transcribe] 0G Whisper failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't hear that. Try again or type instead." }, { status: 502 });
  }
}
