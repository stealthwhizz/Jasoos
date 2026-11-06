# How we use Arkiv

ETHJasoos turns one sentence into a walkable detective case. Arkiv is where finished cases live,
who may make more today, how busy each case is, and who has already named a culprit. Field-level
details are in [schema.md](schema.md).

## Entities and their lifetimes

| Entity       | Written when                      | Lifetime                       | What the expiry does for us                              |
| ------------ | --------------------------------- | ------------------------------ | -------------------------------------------------------- |
| `world`      | A generated case is published     | 7 days, extended on every play | Unplayed cases go cold and drop out of the gallery (R25) |
| `creation`   | Same transaction as its `world`   | 24 hours                       | The live count per person **is** the daily limit (R12)   |
| `visit`      | A player opens a case             | 1 hour                         | The live count is "how busy is this case right now"      |
| `accusation` | A verified player names a culprit | 30 days                        | One per person per case for the case's whole life (R24)  |

No cron job, cleanup task, or counter table exists anywhere in the app. Expiry does all of it.

## Writes (who signs, when)

One server-held signer writes every entity:
[lib/arkiv/live.ts](../lib/arkiv/live.ts).

- **Publish** ([app/api/worlds/[id]/events/route.ts](../app/api/worlds/%5Bid%5D/events/route.ts)):
  `world` and `creation` go in **one `executeBatch` transaction**, so a world never exists without
  its quota record or the other way round. About 6 s on rabdi.
- **Visit** ([app/api/worlds/[id]/visit/route.ts](../app/api/worlds/%5Bid%5D/visit/route.ts)): a
  `visit` create and, at most hourly, the world's extension, in one transaction.
- **Accuse** ([app/api/worlds/[id]/accuse/route.ts](../app/api/worlds/%5Bid%5D/accuse/route.ts)):
  the `accusation` is written **before** the result is returned. If the write fails, no answer is
  revealed, so a failed write can't become a free guess.
- Writes go through a one-at-a-time queue so the single signer's nonces never collide.

What we keep private on a public chain: the mystery's answer is sealed with AES-256-GCM before it
is written ([lib/arkiv/codec.ts](../lib/arkiv/codec.ts)), and accusations store only whether a guess
was right, not the name guessed.

## Reads (gallery, quota, accusations)

- **Gallery, from the browser** ([components/Gallery.tsx](../components/Gallery.tsx),
  [lib/arkiv/gallery.ts](../lib/arkiv/gallery.ts)): the gallery page queries Arkiv itself, sorted
  newest first on the node, with live visit counts. It only asks our server for the project name
  and the public access key. `/api/gallery` runs the same code as a fallback.
- **Daily limit** ([app/api/worlds/route.ts](../app/api/worlds/route.ts)): count of live
  `creation` entities for the person, plus jobs still running. At the limit, the reply says when
  the oldest one expires ("Next slot opens in about 3 hours") with a `Retry-After` header.
- **One accusation per person**: a count of `accusation` entities for (case, person) before
  accepting a new one, plus a lock so two parallel requests cannot both pass the check.
- **Playing a case**: the world page and NPC dialogue read the `world` entity by key and unseal
  the mystery on the server.

## Wallet addresses that wrote entities

| Address                                      | Role                             |
| -------------------------------------------- | -------------------------------- |
| `0xf9976C655C3f61f5C7b0E8a0655d6c2195F483b5` | Server signer: owns every entity |

See them on the explorer: https://rabdi.explorer.arkiv.network/address/0xf9976C655C3f61f5C7b0E8a0655d6c2195F483b5

## Code links

| What                           | File                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| Schemas                        | [lib/arkiv/schemas.ts](../lib/arkiv/schemas.ts)                                              |
| Live reads and writes          | [lib/arkiv/live.ts](../lib/arkiv/live.ts)                                                    |
| Gallery query (browser-safe)   | [lib/arkiv/gallery.ts](../lib/arkiv/gallery.ts)                                              |
| Manifest packing, sealing      | [lib/arkiv/codec.ts](../lib/arkiv/codec.ts)                                                  |
| Quota reservation, accuse lock | [lib/arkiv/index.ts](../lib/arkiv/index.ts)                                                  |
| Stand-in without keys          | [lib/arkiv/memory.ts](../lib/arkiv/memory.ts)                                                |
| Smoke test (write + read)      | [scripts/smoke-arkiv.ts](../scripts/smoke-arkiv.ts)                                          |
| Public query                   | [scripts/arkiv-query.ts](../scripts/arkiv-query.ts)                                          |
| Tests                          | [tests/arkiv.test.ts](../tests/arkiv.test.ts), [tests/quota.test.ts](../tests/quota.test.ts) |
