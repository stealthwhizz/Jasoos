import { listWorlds } from "@/lib/arkiv";

/** Server copy of the Arkiv gallery query, for browsers that cannot reach Arkiv directly. */
export async function GET() {
  try {
    return Response.json(await listWorlds());
  } catch (err) {
    console.error("[gallery] Arkiv query failed", err instanceof Error ? err.message : err);
    return Response.json({ error: "The gallery is unreachable right now." }, { status: 502 });
  }
}
