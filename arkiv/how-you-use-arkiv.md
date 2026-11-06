# How we use Arkiv

Arkiv is ETHJasoos's case store and its fairness ledger. The implementation is
[lib/arkiv.ts](../lib/arkiv.ts); [schema.md](schema.md) lists every field. Without
`ARKIV_SIGNER_KEY` the same `GameStore` interface falls back to process memory for local work.

## Do the filters, editors and lifetimes fit the app?

| Entity       | We filter on                              | Who writes / edits                                                                           | Expires | Why that fits                                                                                                      |
| ------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `game`       | `owner`, `createdAt` (sorted on the node) | Server signer on create; patched when finales and thumbnails are saved; deleted by its owner | 90 days | The gallery lists newest first; `owner` counts a maker's live cases against `FREE_GAME_LIMIT`                      |
| `scene`      | `gameId`, `sceneId`                       | Server signer, for the world's owner; same id is replaced, not duplicated                    | 90 days | A room is generated once and replayed by every later visitor                                                       |
| `screen`     | `gameId`, `worldKey`, `x`, `y`            | Server signer, for the world's owner; capped at a 3×3 grid                                   | 90 days | The street map is rebuilt from coordinates without our API                                                         |
| `unlock`     | `worldKey`, `humanHash`                   | Server signer, after a World ID proof for action `evidence-<id>`                             | 90 days | "Already opened" means no second proof; the count is a case's evidence opens                                       |
| `accusation` | `gameId`, `humanHash`                     | Server signer, once per human per case                                                       | 90 days | One guess per human, enforced by checking for an existing record first; `correct` is public, the suspect is sealed |

Every entity also carries indexed `project` and `entityType`, so one query separates our data
from everyone else's.

## Does each Arkiv feature change something players see?

| Arkiv feature                                                   | What the player sees                                                                            |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Entities with indexed attributes + `orderBy(desc("createdAt"))` | The **community gallery**: every case, newest first (`GET /api/games` reads Arkiv on each load) |
| `count()` on `game` by `owner`                                  | **"2 of 3 free worlds left"** on the create card, and creation stopping at the limit            |
| `scene` / `screen` entities                                     | **Instant replay**: a returning player walks saved streets and rooms with no new model call     |
| `unlock` written before the key is returned                     | The **evidence box** opens after World ID and stays open on return visits without another proof |
| `accusation` written before the verdict                         | **One accusation per case**: a second, different guess is refused (409)                         |
| `patchEntity` on `game`                                         | **Saved endings**: a case's finale is generated once and replayed to every later solver         |
| Expiry (`ExpirationTime.fromDays(90)`)                          | Cases that are **gone after 90 days**, with no cleanup job on our side                          |
| Public reads (`npm run arkiv:query`)                            | Anyone can **verify** cases, opens and solves without our API                                   |

## Write paths

- `POST /api/games` writes a `game`. Live games owned by the human count toward
  `FREE_GAME_LIMIT` (a per-human cap, not a daily quota; the default is 0, so set it per deploy).
- `PUT /api/games/[id]/scenes/[sceneId]` saves interiors as `scene` and street tiles as
  `screen`. Images live under `ASSET_DIR`; entities hold their URLs.
- `POST /api/games/[id]/evidence` verifies a World ID proof for `evidence-<id>`, writes `unlock`
  **before** revealing the key, and reuses the record on return. A failed write returns 503 and
  no key.
- `POST /api/finale` writes `accusation` **before** generating or replaying the ending. The
  guessed suspect is stored sealed (`sealedAccused`). A different second guess returns 409; a
  failed write returns 503 with no finale.
- `DELETE /api/games/[id]` checks ownership and deletes the game and its scenes and screens.
  Unlocks and accusations stay until they expire.

The one server signer sends transactions one at a time to avoid nonce collisions, and the
accusation and unlock check-then-write steps share that queue. That protects concurrent
requests within one server process; it is not a distributed uniqueness constraint, so we run a
single writer instance. A timeout after inclusion can leave a committed accusation even if the
HTTP response failed.

## Wallet that wrote our entities

Server signer: [0xf9976C655C3f61f5C7b0E8a0655d6c2195F483b5](https://rabdi.explorer.arkiv.network/address/0xf9976C655C3f61f5C7b0E8a0655d6c2195F483b5).
The active signer is deployment configuration, not hardcoded.
