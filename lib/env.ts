// Server-only settings. Only NEXT_PUBLIC_* variables may be read in client components.
export const env = {
  // Fixtures stay on unless explicitly turned off, so a fresh clone runs without keys.
  useFixtures: process.env.USE_FIXTURES !== "false",
  creationPaused: process.env.CREATION_PAUSED === "true",
  creationLimitPerDay: Number(process.env.CREATION_LIMIT_PER_DAY ?? 3),
  creditCapPerMaker: Number(process.env.CREDIT_CAP_PER_MAKER ?? 50),
  projectId: process.env.ARKIV_PROJECT_ID ?? "ethjasoos",
  arkiv: {
    // Real Arkiv writes need a funded testnet key. Without one, an in-memory store stands in.
    live: Boolean(process.env.ARKIV_SIGNER_KEY),
    signerKey: process.env.ARKIV_SIGNER_KEY ?? "",
    accessKey: process.env.ARKIV_ACCESS_KEY ?? "",
    /** Optional override; by default the rabdi URL is built from the access key. */
    rpcUrl: process.env.ARKIV_RPC_URL || undefined,
  },
  worldId: {
    appId: process.env.WORLD_APP_ID ?? "",
    action: process.env.WORLD_ACTION_ID ?? "create-world",
    rpId: process.env.WORLD_RP_ID ?? "",
    rpSigningKey: process.env.WORLD_RP_SIGNING_KEY ?? "",
    // "staging" accepts simulator proofs; set "production" for real World App users.
    environment: (process.env.WORLD_ENVIRONMENT === "production" ? "production" : "staging") as
      "production" | "staging",
  },
};

/** Lazily creates a process-wide singleton that survives dev hot reloads. */
export function processStore<T>(key: string, init: () => T): T {
  const g = globalThis as unknown as Record<string, T | undefined>;
  return (g[`__jasoos_${key}`] ??= init());
}
