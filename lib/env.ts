// Server-only settings. Only NEXT_PUBLIC_* variables may be read in client components.
export const env = {
  // Fixtures stay on unless explicitly turned off, so a fresh clone runs without keys.
  useFixtures: process.env.USE_FIXTURES !== "false",
  creationPaused: process.env.CREATION_PAUSED === "true",
  creationLimitPerDay: Number(process.env.CREATION_LIMIT_PER_DAY ?? 3),
  creditCapPerMaker: Number(process.env.CREDIT_CAP_PER_MAKER ?? 50),
  projectId: process.env.ARKIV_PROJECT_ID ?? "ethjasoos",
};

/** Lazily creates a process-wide singleton that survives dev hot reloads. */
export function processStore<T>(key: string, init: () => T): T {
  const g = globalThis as unknown as Record<string, T | undefined>;
  return (g[`__jasoos_${key}`] ??= init());
}
