# Why Arkiv

ETHJasoos turns one sentence into a playable detective case. Arkiv holds the cases and the
records that make the game fair: who opened the evidence, who accused, and whether they were
right. Field-level details are in [schema.md](schema.md).

## If we swapped Arkiv for Postgres, what would players lose?

| With Arkiv (today)                                                                                                                                                                                                                     | With Postgres                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Anyone can list and replay every case without us.** `npm run arkiv:query` ([script](../scripts/arkiv-query.ts)) needs no key, wallet or server of ours, and any other app can render a case from its `game` + `screen` entities.     | Cases exist only behind our API. If our server goes down, every case is gone for everyone. |
| **The fairness rules can be audited.** An `unlock` is written _before_ the evidence key is shown, and an `accusation` _before_ the verdict. Anyone can count a case's unlocks and solves, and check that no human has two accusations. | "One accusation per human" is a promise in our database that only we can check.            |
| **Solves are public, answers are not.** `accusation.correct` is public, so a case's solve rate is visible to all; the guessed suspect is sealed (`sealedAccused`), so the chain never gives the answer away.                           | Solve counts would be whatever our API chose to report.                                    |
| **Cases clean themselves up.** Every entity expires after 90 days on the node, with no cron job, cleanup task or TTL column.                                                                                                           | We would need a scheduled delete job and to trust that it ran.                             |
| **A returning player replays saved screens.** Street and room screens are stored once as `screen`/`scene` entities, so revisiting a case costs no new model call.                                                                      | Same saving, but only readable through us.                                                 |

What Arkiv does **not** give us yet, stated plainly: one server-held signer writes every entity,
so players do not own their cases on chain, and the signer is trusted to apply the rules (Arkiv
is not a uniqueness contract). Moving `game` ownership to the maker's wallet is the next step.

## What we kept off Arkiv, and why

| Kept off Arkiv                                           | Why                                                                                                                                                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Image bytes                                              | One entity holds at most 128 KiB of bytes; images live in the asset directory and entities hold their URLs. Losing that directory breaks images even though the case metadata stays on chain |
| The answer, evidence key and victory finale in the clear | Everything on Arkiv is public. They are AES-256-GCM sealed (`story.sealed`, `sealed_victory`, `sealedAccused`) and only our server can open them                                             |
| World ID proofs and nullifiers                           | Only `sha256("ETH Jasoos:" + nullifier)` appears, as `owner` / `humanHash`. Proofs are verified on our server and discarded                                                                  |
| Model calls and moderation                               | They run on 0G Private Computer; Arkiv stores the result, not the process                                                                                                                    |
| Sessions and cookies                                     | Short-lived and private; no reason to publish them                                                                                                                                           |

World ideas and generated story text are public by design: they are the case. Expired entities
leave the live set but remain in transaction history, so nothing personal is ever written, and
anything secret is sealed before it is written.
