# #19 — per-case World ID action spike

## Current decision

**Provisional action scheme:** `evidence-<gameId>`.
The server signs this action in `createRpContext(action)` and checks the same action before
forwarding the IDKit result to the World Developer Portal. The production code is already on
main. This PR adds tests of that real verifier with the Portal mocked; it does not claim that
the Portal accepts unregistered dynamic actions.

**Live acceptance: pending.** The saved browser policy denies localhost access even after the
user approved a retry. No simulator proof was acquired or submitted in this spike branch.
The earlier empty-body HTTP 400 connectivity probe is not evidence of action support.

## Real simulator procedure

1. Use a saved game with sealed evidence, configured World ID keys, and
   `WORLD_ENVIRONMENT=staging`. Sign in using the real staging simulator, not the dev shortcut.
   Use a human/game pair that has not already unlocked evidence; an existing unlock bypasses
   proof verification and cannot establish support for the action scheme.
2. Get fresh widget configuration from `GET /api/games/<gameId>/evidence`. Confirm it returns
   `dev: false` and `action: evidence-<gameId>`. Keep its RP context together with that request.
3. Use this configuration in IDKit with `proofOfHuman()` and approve through
   [the World ID simulator](https://simulator.worldcoin.org), Human / World ID 4.0.
4. Send the resulting IDKit result as `{ proof: result }` to
   `POST /api/games/<gameId>/evidence` using the signed-in session.
5. Success requires HTTP 200 with the key and an Arkiv unlock saved before disclosure.
   Reopen without a proof and check that the existing unlock is reused. Unit tests of these
   route behaviors live in `tests/evidence.test.ts`; they do not replace this live run.

Record only: tested commit, UTC timestamp, requested action, staging/production environment,
Portal outcome/error code, evidence HTTP status, and whether a new unlock was persisted.
Do not publish the proof, raw nullifier, signing key, session cookie, or evidence key.
Post the observed result to board #3, then update this decision and close #19 through the PR.

## If the dynamic action is refused

Do not infer a registration restriction from an environment, integrity, network or Arkiv error.
Capture the actual Portal rejection and first confirm staging and RP configuration.
If the refusal establishes that actions must be registered, implement the agreed fallback:
registered `open-evidence`, with the world id as a signal bound into the proof and checked on
the server. Keep the existing per-human/per-game Arkiv unlock check. Test that a proof for one
world cannot unlock another before switching schemes. The fallback is not implemented here.

## Automated verification

`npx vitest run tests/worldid-actions.test.ts tests/evidence.test.ts`

The verifier tests cover fresh per-case contexts, wrong-action rejection before network I/O,
environment/single-human checks, unchanged proof forwarding, provider refusal, explicit success,
and transient retries. They use synthetic proof objects and mocked HTTP responses, not real
cryptographic proofs. The sign-in timing/debrief remains separate in #28 and PR #35.
