/**
 * `GET /api/assets/[...path]` — serves generated game images saved by `uploadDataUrl`.
 */

import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { assetFilePath } from "@/lib/games";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  wav: "audio/wav",
};

/** Stream one saved asset. Paths that escape the asset root are 404s. */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const rel = (await params).path.join("/");
  const file = assetFilePath(rel);
  if (!file) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const body = await readFile(file);
    return new NextResponse(body, {
      headers: {
        "Content-Type": TYPES[rel.split(".").pop() ?? ""] ?? "application/octet-stream",
        // Saved scenes are overwritten in place, so allow a short cache only.
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
