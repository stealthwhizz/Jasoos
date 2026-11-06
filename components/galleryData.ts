import type { WorldSummary } from "@/lib/types";

/** Reject malformed upstream responses before they can crash the gallery render. */
export function parseGallery(value: unknown): WorldSummary[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (world) =>
        world !== null &&
        typeof world === "object" &&
        typeof world.worldKey === "string" &&
        world.worldKey.length > 0 &&
        typeof world.title === "string" &&
        typeof world.premise === "string" &&
        typeof world.thumbnailUrl === "string" &&
        typeof world.createdAt === "string" &&
        typeof world.visits === "number" &&
        Number.isFinite(world.visits) &&
        world.visits >= 0,
    )
  ) {
    throw new Error("The case archive returned an invalid response.");
  }
  return value;
}
