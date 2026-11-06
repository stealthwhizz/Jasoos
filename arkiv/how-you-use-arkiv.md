# How we use Arkiv

Arkiv is the saved-case store. The implementation is [lib/arkiv.ts](../lib/arkiv.ts);
[schema.md](schema.md) describes the five live entity types and exact fields.
Without `ARKIV_SIGNER_KEY`, the same GameStore interface uses process-local memory.

- `POST /api/games` writes a `game`; live games owned by the human count toward
  `FREE_GAME_LIMIT` (not a daily quota). The default limit is zero; configure the deployment.
- `PUT /api/games/[id]/scenes/[sceneId]` saves owner-generated interiors as `scene`
  and street tiles as `screen`. Existing `scene` street tiles still replay. Images
  live under `ASSET_DIR`, referenced by URLs, not inline on chain.
- `POST /api/worlds/[id]/evidence` verifies a proof for `evidence-<id>` and writes
  `unlock` **before** revealing the key. Returning unlockers reuse their record without
  a new proof. A write failure returns 503 and no key.
- `POST /api/finale` writes `accusation` before generating or replaying the ending.
  A second guess returns 409; a write failure returns 503 with no finale.
- `DELETE /api/games/[id]` checks ownership and deletes the game and both scene types.
  Unlocks and accusations remain to expire. All new entities use a 90-day lifetime.

The server's one signer serializes transactions to avoid nonce collisions. Accusation
check/write and unlock check/write share that queue. This protects concurrent requests
within one server process; it is **not** a distributed uniqueness constraint. Run one writer
instance until a distributed lock or chain-enforced uniqueness is added. A timeout after
chain inclusion can leave a committed accusation even if the HTTP response failed.

Screen persistence enforces a 3x3 grid. The generation route still needs the matching
pre-generation check (#21); persistence alone cannot prevent spending credits on a
screen that will later be refused.

The gallery calls our API; another app can query the same public records directly with
`npm run arkiv:query`. No old `world`, `creation` or `visit` entities are written by this stack.

Historical signer address recorded during integration:
[0xf9976C655C3f61f5C7b0E8a0655d6c2195F483b5](https://rabdi.explorer.arkiv.network/address/0xf9976C655C3f61f5C7b0E8a0655d6c2195F483b5).
The active signer is deployment configuration, not hardcoded in the app.
