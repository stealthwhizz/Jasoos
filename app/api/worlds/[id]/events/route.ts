import type { JobEvent } from "@/lib/types";
import { scheduler, takeJob } from "@/lib/engine";
import { publishWorld, releaseReservation } from "@/lib/arkiv";

/** Server-sent events for one creation job. `id` here is the jobId from POST /api/worlds. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const jobId = (await params).id;
  const job = takeJob(jobId);
  if (!job) return Response.json({ error: "Unknown or already started job." }, { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: JobEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          // The browser left; let the job finish so the world still publishes.
        }
      };
      try {
        const manifest = await scheduler(job, emit);
        const { worldKey } = await publishWorld(manifest, job.humanHash);
        emit({ type: "done", worldId: worldKey });
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : "Generation failed." });
      } finally {
        // Published worlds now count through their `creation` entity; failed ones free the slot.
        releaseReservation(jobId);
      }
      try {
        controller.close();
      } catch {
        // Already closed by the client.
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
