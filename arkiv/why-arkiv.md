# Why Arkiv

Arkiv makes generated cases and their play records publicly queryable without our API.
Anyone can list `game`, replay `scene`/`screen` metadata, count `unlock`, and inspect
`accusation` records. [Run the query](../scripts/arkiv-query.ts) with `npm run arkiv:query`.

A returning visitor reuses saved screens instead of paying for another model call.
An evidence unlock is recorded before its key is revealed; an accusation is recorded
before its result is returned. The app checks these records when enforcing its rules.
The signer is still trusted to apply those rules; Arkiv is not a uniqueness contract.

All entities expire after 90 days. The current stack has no daily creation entities,
visit counters or extend-on-play policy. Expired data may remain in transaction history.

Image bytes stay in the asset directory because entity bytes are limited. Losing that
directory breaks image URLs even though metadata remains on chain. The answer and key
are sealed; raw World ID proofs and nullifiers stay off chain. World ideas and generated
text are public, as are the guessed suspect index and correctness in accusations.
The exact privacy and lifetime contract is in [schema.md](schema.md).
