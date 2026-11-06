import { listWorlds } from "@/lib/arkiv";

/** Server copy of the Arkiv gallery query, for browsers that cannot reach Arkiv directly. */
export async function GET() {
  return Response.json(await listWorlds());
}
