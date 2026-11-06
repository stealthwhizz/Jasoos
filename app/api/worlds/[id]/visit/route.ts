import { getWorld, recordVisit } from "@/lib/arkiv";

/** Writes a short-lived `visit` entity. A failed write never blocks play: it reports null. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getWorld(id))) return Response.json({ error: "World not found." }, { status: 404 });
  try {
    return Response.json({ visits: await recordVisit(id) });
  } catch (err) {
    console.warn("[visit] Arkiv write failed", err instanceof Error ? err.message : err);
    return Response.json({ visits: null });
  }
}
