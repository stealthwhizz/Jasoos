# World ID integration debrief — 6 November 2026

## Time to first success

The team recorded a working staging simulator sign-in before the 15:24 UTC board post
on 6 November. The integration start time and elapsed time to that first accepted proof
were **not recorded**, so we cannot honestly give a time-to-first-success duration.
This acceptance item for #28 remains open. The existing notes report three failed real-app
sign-in attempts before switching to the simulator; those are observations, not a timed study.

The implementation uses IDKit 4.6.0, one nullifier per accepted result, a 30-day signed
session, and a 15-second timeout per verification attempt. Verification retries transient
network/429/5xx failures up to three times. These are configured numbers, not measured latency.

A connectivity smoke check in this branch signed a context with a **300-second TTL**
and reached the Portal in **232 ms**. The empty probe correctly returned HTTP 400
(`action is required for uniqueness proofs`). This is connectivity evidence, not a
successful proof or a time-to-first-success measurement.

## Friction encountered

Staging verification returned `403 integrity_verification_failed` when approved with a
non-simulator app. The team reports successful sign-in using simulator.worldcoin.org,
Human + World ID 4.0. The UI previously replaced the server's reason with a generic widget
code. The fix preserves that reason and logs it server-side without logging the proof.

## Missing capability or documentation

We need a confirmed v4 example of a fresh action per case, without registering every case
in the Developer Portal. `createRpContext(action)` and evidence verification now use
`evidence-<worldId>`. The real per-case simulator spike (#19) has **not** been completed in
this change: browser access to localhost was declined during validation. Unit tests verify
that mismatched actions are rejected, but do not establish Portal acceptance.
If the Portal rejects dynamic actions, the planned fallback is a registered `open-evidence`
action with a world-bound signal. That fallback is not implemented or represented as tested.

## One improvement with the most impact

An end-to-end v4 simulator example covering an RP-signed dynamic action, proof acquisition,
and server verification, with clear staging-versus-production rejection messages, would remove
our largest remaining integration uncertainty. Run and time that example to finish #19/#28.

## Why Proof of Human is the minimum credential

World creation spends shared 0G credits. The quota needs one stable identity per unique
human; an email or disposable wallet would allow one person to consume many quotas.
Proof of Human supplies that credential without asking for age, nationality or a name.
Evidence opens and accusations attach to the same signed-in human's namespaced hash.
The key is revealed only after an Arkiv unlock is saved. The chain never receives a raw
proof or nullifier. See the [README trust moment](../README.md#3--world-id-gate).
