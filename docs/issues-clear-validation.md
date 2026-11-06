# issues-clear validation — 6 November 2026

## Automated checks

- Production build: passed (Next 16.2.10, with network access for configured Google Fonts).
- Typecheck: passed after regenerating stale Next route types with `npx next typegen`.
- Tests: 38 passed, covering pagination through 205 rows, deletion, first/repeated/concurrent
  accusation, failed accusation write, evidence auth/action/persistence/reopen/failure,
  saved screen replay/grid cap, generation session gate and thinking opt-in.
- Changed-file ESLint: passed.
- Repository ESLint: 14 existing errors and 8 warnings in World, GameCanvas, DialogueBox and
  Ending. Those shared files were not changed in this branch.

## 0G text comparison

Two identical ideas were generated with `generateBible` in separate processes with thinking
on/off. No images were generated and no test worlds were published to Arkiv.

| Idea | Thinking off | Thinking on | Structure in both |
| --- | --- | --- | --- |
| Missing ledger in a Mumbai tiffin shop | 22.942 s | 68.523 s | Valid culprit, 3 rooms, 3 objects, 2 notes |
| Stolen theatre mask in Jaipur | 24.890 s | 61.158 s | Valid culprit, 3 rooms, 3 objects, 2 notes |

The first off case used `evidenceNote` fallback because its cover did not encode the hidden
message. The other three did not need that fallback. This small structural comparison does
not establish equal literary quality. The initial diagnostic counted notes instead of successful
decodes; that diagnostic is corrected in the reusable script, and its old decode count is not
reported as evidence. Codec/fallback behavior has separate automated tests.

Reproduce with `ZG_CHAT_THINKING=off npx tsx scripts/check-story-quality.ts`, then `on`.
Each command uses paid text inference through the configured 0G client.

## Live read-only integration

`npm run arkiv:query` succeeded for project `ethjasoos`:
`game=2, scene=4, screen=0, unlock=0, accusation=3`.
The World ID smoke probe signed an RP context with a 300-second TTL and received the
expected HTTP 400 validation error from the Portal in 232 ms. It sends an empty body;
it is not an accepted-proof test.

## Open acceptance items

- #19: a real per-world simulator proof. The per-case action scheme is provisional until tested.
- #21: check the cap before generation, with a saved game id and server-side reservation;
  persistence now rejects coordinates outside the 3x3 grid. Shared route/client edits were
  requested on board #3 and remain awaiting lane-owner approval.
- #28: measured time to first accepted proof. The debrief explicitly records this missing datum.
- Interactive browser validation was blocked because localhost browser access was declined.
- Check/write serialization is process-local. Deploy one signer/writer process until distributed
  uniqueness exists. Public accusation index + correctness can expose the culprit on chain,
  as required by #27's current schema; the docs state this limitation.
