import { readAsset } from "@/lib/engine/assets";

/** Serves generated images. File names are random UUIDs, so they never change. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const asset = await readAsset((await params).file);
  if (!asset) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(asset.bytes), {
    headers: { "Content-Type": asset.type, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
