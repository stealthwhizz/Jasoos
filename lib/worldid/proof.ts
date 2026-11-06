// Pure checks on an IDKit result and the Developer Portal reply. No Next.js imports, so tests can
// load this file directly.

export type WorldEnvironment = "production" | "staging";

export interface Expected {
  action: string;
  environment: WorldEnvironment;
}

export type ProofCheck = { ok: true; nullifier: string } | { ok: false; reason: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Checks what we can before calling the portal: the proof is for our action and the expected
 * environment, and it carries exactly one nullifier. Returns that nullifier.
 */
export function checkIdkitResult(proof: unknown, expected: Expected): ProofCheck {
  if (!isRecord(proof)) return { ok: false, reason: "Proof is not an object." };
  if (proof.action !== expected.action)
    return { ok: false, reason: "Proof is for another action." };
  // The simulator issues "staging" proofs. Production must never accept them.
  if (proof.environment !== expected.environment) {
    return { ok: false, reason: `Proof environment is not ${expected.environment}.` };
  }
  const responses = proof.responses;
  if (!Array.isArray(responses) || responses.length === 0) {
    return { ok: false, reason: "Proof has no credential responses." };
  }
  const nullifiers = new Set(
    responses
      .map((r) => (isRecord(r) && typeof r.nullifier === "string" ? r.nullifier : null))
      .filter((n): n is string => Boolean(n)),
  );
  const [nullifier] = nullifiers;
  if (nullifiers.size !== 1 || !nullifier) {
    return { ok: false, reason: "Proof must carry one nullifier." };
  }
  return { ok: true, nullifier };
}

/** The portal answers 200 with { success: true } for a valid proof, and 4xx with a code otherwise. */
export function checkPortalReply(status: number, body: unknown): ProofCheck | { ok: true } {
  if (status === 200 && isRecord(body) && body.success === true) return { ok: true };
  const code = isRecord(body) ? (body.code ?? body.detail ?? body.message) : undefined;
  return {
    ok: false,
    reason: `World ID rejected the proof (${status}${code ? `, ${code}` : ""}).`,
  };
}
