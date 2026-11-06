export type AccusationResult =
  { correct: false } | { correct: true; secret: string; finaleUrl?: string };

/** A malformed success must never be presented as an incorrect accusation. */
export function parseAccusationResult(value: unknown): AccusationResult {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid accusation result");
  const body = value as Record<string, unknown>;
  if (body.correct === false) return { correct: false };
  if (body.correct !== true || typeof body.secret !== "string")
    throw new Error("Invalid accusation result");
  return {
    correct: true,
    secret: body.secret,
    ...(typeof body.finaleUrl === "string" ? { finaleUrl: body.finaleUrl } : {}),
  };
}
