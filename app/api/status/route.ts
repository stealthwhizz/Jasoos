import { env } from "@/lib/env";
import { getHumanHash } from "@/lib/worldid";

export async function GET() {
  return Response.json({
    creationPaused: env.creationPaused,
    fixtures: env.useFixtures,
    verified: Boolean(await getHumanHash()),
    creationLimitPerDay: env.creationLimitPerDay,
    creditsRemaining: null, // TODO(A): read the 0G balance (R13)
  });
}
