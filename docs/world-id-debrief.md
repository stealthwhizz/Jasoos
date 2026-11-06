# World ID integration debrief — 6 November 2026

## 1. Time to first success

**Acceptance status: awaiting one timed, successful staging-simulator sign-in.**
The original integration start time was not recorded. The team reported working simulator
sign-in before its [15:24 UTC board post](https://github.com/stealthwhizz/ETHJasoos/issues/3#issuecomment-6688413666),
but that establishes no elapsed duration. We will report a fresh timed run as such, rather
than presenting it as the original integration time.

The recorded server connectivity probe took **232 ms**, signed an RP context valid for
**300 seconds**, and received **HTTP 400** (`action is required for uniqueness proofs`)
for an empty request. These are real measurements from PR #34; they do **not** demonstrate
an accepted proof and are not the time to first success.

To capture the missing measurement:

1. Run the development server with real World ID keys and `WORLD_ENVIRONMENT=staging`.
   The local test-player shortcut does not qualify.
2. Open `/login`. Record the start timestamp immediately before clicking **Verify with World ID**.
3. Approve the request at [the World ID simulator](https://simulator.worldcoin.org), using
   **Human** and **World ID 4.0**.
4. Record the finish timestamp when `/api/session` accepts the proof and the signed-in home
   page appears. Record elapsed seconds and the number of failed attempts, including retries.
5. Add those observations here with the tested commit and date. Do not record the proof,
   nullifier, session cookie or signing key.

A sign-in measurement completes this debrief's timing requirement. The separate per-case
proof spike in [#19](https://github.com/stealthwhizz/ETHJasoos/issues/19) still needs its own
successful evidence unlock; a successful sign-in alone does not validate dynamic actions.

## 2. Friction encountered

The team recorded **three failed sign-in attempts** before switching to the simulator.
The observed refusal was `403 integrity_verification_failed` while using a non-simulator
app against staging. The simulator then worked, according to the integration report;
real World App users require the production environment.

The widget also replaced the server's rejection reason with a generic error code. PR #34
preserves that reason in the login form and logs it server-side without logging the proof.
These observations come from the team's recorded integration, not a new timed study.

## 3. Missing capability or documentation

We need a complete v4 example showing RP signing, simulator proof acquisition and server
verification for a fresh action per case without registering every case in the Portal.
The app implements `evidence-<gameId>` through `createRpContext(action)` and verifies it at
`POST /api/games/[id]/evidence`, but real Portal acceptance remains unverified under #19.
If dynamic actions are rejected, the proposed fallback is registered `open-evidence` with
a world-bound signal. That fallback has not been implemented or tested.

## 4. One improvement with the most impact

Publish one runnable v4 simulator example with the full request/verification loop and
clear staging-versus-production errors. This would address both our environment mismatch
and the remaining dynamic-action uncertainty. Include where timing starts and ends so
teams can report reproducible time-to-first-success measurements.

## Why Proof of Human is the minimum credential

World creation spends shared 0G credits. The creation quota needs one stable identity per
unique human; disposable emails or wallets would let one person claim many quotas.
Proof of Human answers that question without requesting a name, age or nationality.

The app keeps a namespaced hash of the nullifier as its player id. Evidence opens and
accusations use that signed-in identity, and the evidence key is returned only after an
Arkiv unlock is saved. Raw proofs and nullifiers are not stored on chain. See the
[README trust moment](../README.md#3--world-id-gate).
