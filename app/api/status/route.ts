import { env } from "@/lib/env";
import { getHumanHash } from "@/lib/worldid";
import { zgBalance } from "@/lib/zg";

export async function GET() {
  return Response.json({
    creationPaused: env.creationPaused,
    fixtures: env.useFixtures,
    verified: Boolean(await getHumanHash()),
    creationLimitPerDay: env.creationLimitPerDay,
    creditsRemaining: await zgBalance(),
  });
}
