import { getWorld, recordVisit } from "@/lib/arkiv";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getWorld(id))) return Response.json({ error: "World not found." }, { status: 404 });
  return Response.json({ visits: await recordVisit(id) });
}
