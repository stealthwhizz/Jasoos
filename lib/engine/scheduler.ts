import { randomUUID } from "node:crypto";
import type { Asset, AssetKind, JobEvent, Manifest, TickerEvent } from "@/lib/types";
import { processStore } from "@/lib/env";
import { ZgError } from "@/lib/zg";
import { planWorld } from "./planWorld";
import { generateImage } from "./generateImage";
import { analyzeStreet } from "./analyzeStreet";
import { fallbackMap } from "./walkMap";
import { writeNotes } from "./notes";

export interface Job {
  prompt: string;
  humanHash: string;
}

// shortcut: in-memory jobs only work on a single server process; move to a store before scaling out.
const jobs = processStore("jobs", () => new Map<string, Job>());

export function createJob(job: Job): string {
  const id = randomUUID();
  jobs.set(id, job);
  return id;
}

/** Hands the job to exactly one caller, so a reconnecting stream cannot run it twice. */
export function takeJob(id: string): Job | undefined {
  const job = jobs.get(id);
  jobs.delete(id);
  return job;
}

/**
 * Plans the world, then starts street, sprite, and all interiors at once (R3).
 * The vision pass waits only for the street; notes are written alongside. A failed image
 * becomes a labelled placeholder and the run continues. Returns the manifest without a worldId.
 */
export async function scheduler(job: Job, emit: (e: JobEvent) => void): Promise<Manifest> {
  const plan = await planWorld(job.prompt);
  for (const event of plan.events) emit({ type: "ticker", event });
  const { bible } = plan;

  const tick = (event: TickerEvent) => emit({ type: "ticker", event });
  // No concurrency cap: 0G documents no numeric limit, and the client retries 429s with
  // Retry-After. Add one here if rehearsal shows sustained 429s.
  const image = async (id: string, kind: AssetKind, prompt: string): Promise<Asset> => {
    let asset: Asset;
    try {
      const r = await generateImage(id, kind, prompt, bible.artStyle);
      tick(r.event);
      asset = r.asset;
    } catch (err) {
      if (!(err instanceof ZgError)) throw err;
      tick(err.event);
      const url = kind === "sprite" ? "/fixtures/sprite.svg" : "/placeholder.svg";
      const { model, requestId } = err.event;
      asset = { id, kind, url, model, requestId, status: "failed" };
    }
    emit({ type: "asset", asset });
    return asset;
  };

  const street = image("street", "street", bible.streetDescription);
  const [assets, map, written] = await Promise.all([
    Promise.all([
      street,
      image("sprite", "sprite", bible.protagonist),
      ...bible.locations.map((l) => image(`interior-${l.id}`, "interior", l.interiorDescription)),
    ]),
    street.then(async (s) => {
      if (s.status === "failed") return fallbackMap(bible.locations.map((l) => l.id));
      const r = await analyzeStreet(s, bible.locations);
      r.events.forEach(tick);
      return r;
    }),
    writeNotes(bible).then((r) => {
      r.events.forEach(tick);
      return r.notes;
    }),
  ]);

  // TODO(A): finale image (R8). Generate it on the first correct accusation, not here: the
  //   manifest reaches the browser and the image would show the culprit. Needs a hook in accuse (C).
  return {
    worldId: "",
    bible,
    assets,
    walkMap: map.walkMap,
    doors: map.doors,
    notes: written,
    createdAt: new Date().toISOString(),
  };
}
