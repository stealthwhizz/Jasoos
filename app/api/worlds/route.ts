import { env } from "@/lib/env";
import { createJob, moderate } from "@/lib/engine";
import { holdReservation, reserveCreation } from "@/lib/arkiv";
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
  // R12: live `creation` entities on Arkiv, plus jobs still running, against the daily limit.
  const quota = await reserveCreation(humanHash, env.creationLimitPerDay);
  if (!quota.allowed) {
    const when = quota.nextSlotAt;
    const retryAfter = when ? Math.max(1, Math.ceil((when.getTime() - Date.now()) / 1000)) : 3600;
    return Response.json(
      {
        error: when
          ? `Daily limit reached (${quota.used}/${quota.limit}). Next slot opens ${formatWait(retryAfter)}.`
          : `Daily limit reached (${quota.used}/${quota.limit}). Wait for a world to finish.`,
        nextSlotAt: when?.toISOString() ?? null,
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const body = (await req.json().catch(() => null)) as { prompt?: unknown } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, MAX_PROMPT) : "";
  try {
    const verdict = await moderate(prompt);
    if (!verdict.allowed) {
      quota.release();
      return Response.json({ error: verdict.reason, event: verdict.event }, { status: 400 });
    }
    const jobId = createJob({ prompt, humanHash });
    holdReservation(jobId, quota.release);
    return Response.json({ jobId, event: verdict.event }, { status: 202 });
  } catch (err) {
    quota.release();
    throw err;
  }
}

function formatWait(seconds: number): string {
  if (seconds < 90) return "in about a minute";
  if (seconds < 90 * 60) return `in about ${Math.round(seconds / 60)} minutes`;
  return `in about ${Math.round(seconds / 3600)} hours`;
}
