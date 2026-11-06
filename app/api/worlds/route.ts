import { env } from "@/lib/env";
import { createJob, moderate } from "@/lib/engine";
import { countCreations } from "@/lib/arkiv";
import { getHumanHash } from "@/lib/worldid";

const MAX_PROMPT = 300;

/** Starts a creation job. Stream its progress from GET /api/worlds/{jobId}/events. */
export async function POST(req: Request) {
  if (env.creationPaused) {
    return Response.json(
      { error: "Creation is paused right now. You can still play." },
      { status: 503 },
    );
  }
  const humanHash = await getHumanHash();
  if (!humanHash) {
    return Response.json({ error: "Verify with World ID to create a world." }, { status: 401 });
  }
  // TODO(C): return when the next slot opens (oldest live creation + 24h); count in-flight jobs too.
  if ((await countCreations(humanHash)) >= env.creationLimitPerDay) {
    return Response.json({ error: "Daily limit reached. Try again tomorrow." }, { status: 429 });
  }
  // TODO(C): enforce CREDIT_CAP_PER_MAKER.

  const body = (await req.json().catch(() => null)) as { prompt?: unknown } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, MAX_PROMPT) : "";
  const verdict = await moderate(prompt);
  if (!verdict.allowed) {
    return Response.json({ error: verdict.reason, event: verdict.event }, { status: 400 });
  }
  const jobId = createJob({ prompt, humanHash });
  return Response.json({ jobId, event: verdict.event }, { status: 202 });
}
