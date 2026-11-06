import { getWorld, toPublicManifest } from "@/lib/arkiv";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const world = await getWorld((await params).id);
  if (!world) return Response.json({ error: "World not found or expired." }, { status: 404 });
  return Response.json(toPublicManifest(world));
}
