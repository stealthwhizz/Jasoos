import { randomUUID } from "node:crypto";
import type { Asset, AssetKind, JobEvent, Manifest } from "@/lib/types";
import { env, processStore } from "@/lib/env";
import { fixtureNotes } from "@/fixtures/world";
import { planWorld } from "./planWorld";
import { generateImage } from "./generateImage";
import { analyzeStreet } from "./analyzeStreet";
import { generateNotes } from "./notes";

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
 * The vision pass waits only for the street. Returns the manifest without a worldId.
 */
export async function scheduler(job: Job, emit: (e: JobEvent) => void): Promise<Manifest> {
  const plan = await planWorld(job.prompt);
  emit({ type: "ticker", event: plan.event });
  const { bible } = plan;

  // TODO(A): cap concurrency at the 0G rate limit; retry once, then mark the asset failed.
  const image = async (id: string, kind: AssetKind, prompt: string): Promise<Asset> => {
    const r = await generateImage(id, kind, prompt, bible.artStyle);
    emit({ type: "ticker", event: r.event });
    emit({ type: "asset", asset: r.asset });
    return r.asset;
  };

  const street = image("street", "street", bible.streetDescription);
  // Notes are text only, so they run alongside the images (R21).
  const notes = env.useFixtures
    ? Promise.resolve(fixtureNotes)
    : generateNotes(bible).then(({ notes, events }) => {
        for (const event of events) emit({ type: "ticker", event });
        return notes;
      });
  const [assets, map] = await Promise.all([
    Promise.all([
      street,
      image("sprite", "sprite", bible.protagonist),
      ...bible.locations.map((l) => image(`interior-${l.id}`, "interior", l.interiorDescription)),
    ]),
    street.then(async (s) => {
      const r = await analyzeStreet(s.url);
      emit({ type: "ticker", event: r.event });
      return r;
    }),
  ]);

  return {
    worldId: "",
    bible,
    assets,
    walkMap: map.walkMap,
    doors: map.doors,
    notes: await notes,
    createdAt: new Date().toISOString(),
  };
}
