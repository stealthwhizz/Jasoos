# Arkiv schema

The live schema is in [lib/arkiv.ts](../lib/arkiv.ts), using SDK 1.0.1 on rabdi
(chain ID 7794095). Every entity has indexed strings `project` and `entityType`.
`ARKIV_PROJECT_ID` defaults to `ETH Jasoos`; `.env.example` uses `ethjasoos`.
Use the same project value when querying. All new entities expire 90 days after creation.

| Entity | Indexed attributes beyond project/type | Payload |
| --- | --- | --- |
| `game` | `owner` (hashed human), `createdAt` (u64 Unix ms) | `record`: gzipped GameRecord without id, including title, idea, bible, premise, image URLs and saved finales |
| `scene` | `gameId`, `sceneId`, `createdAt` | `record`: gzipped interior scene row without store ids |
| `screen` | `gameId`, `sceneId`, `createdAt`, `worldKey`, signed `x`, `y` | `data`: gzipped scene metadata; `record`: compatibility scene row with image URLs |
| `unlock` | `worldKey`, `humanHash` | No key or plaintext evidence is stored here |
| `accusation` | `gameId`, `humanHash` | `accused` (u64 index 0–2), `correct` (bool) |
| `vote` | `gameId`, `humanHash` | `value` (i32: 1 like, -1 dislike). One per human per world: changing a vote patches it, withdrawing deletes it |

Screens use coordinates -1..1, id `s<x>_<y>`, with at most nine total (origin plus
eight additional screens). Existing street `scene` entities remain readable and count
toward the cap. Interior scenes do not count. Saving the same id replaces it.
A screen's initial 90-day lifetime matches the world's configured lifetime; it is
not extended when a scene is replaced. Deleting a game removes both scene types;
unlocks and accusations remain until expiry.

The player id is `sha256("ETH Jasoos:" + nullifier)` from [worldid.ts](../lib/worldid.ts).
This is a namespaced hash, not a secret salt. Raw proofs and nullifiers are not stored.
Game ideas, generated story text and asset URLs **are public**. The mystery (including
culprit and key) and victory finale are AES-256-GCM sealed using `SESSION_SECRET`.
Accusations expose the guessed index and correctness, so a correct public accusation
can reveal the answer to someone querying the chain; sealing the bible does not hide that.

## Queries anyone can run

Run `npm install` then `npm run arkiv:query`. It reads `.env.local` for project/RPC
configuration, but requires no signer or app server. An access key helps avoid public
RPC rate limits. Counts include game, scene, screen, unlock, accusation and vote.

```ts
import { and, eq } from "@arkiv-network/sdk/query";
const scope = (type: string) => and(eq("project", "ethjasoos"), eq("entityType", type));
// Live evidence opens in one world:
await client.count().where(and(scope("unlock"), eq("worldKey", worldKey))).fetch();
// The human's committed accusation:
await client.select({ $key: true, $attributes: true })
  .where(and(scope("accusation"), eq("gameId", worldKey), eq("humanHash", hash)))
  .limit(100).fetch();
// Generated screens, readable without our API:
await client.select({ $key: true, $attributes: true })
  .where(and(scope("screen"), eq("worldKey", worldKey))).limit(100).fetch();
```

Listings page in batches of 100, the node maximum. Deletion gathers all keys before
removing them so changing offsets cannot skip entities.

Visibility lives inside the game `record` (`visibility: "public" | "private"`; older records
without it are public). `GET /api/games` drops other players' private worlds, and
`GET /api/games/[id]` answers 404 for them. Votes on a world:

```ts
reader.select({ gameId: true, humanHash: true, value: true }).from(VoteEntity)
  .where(and(eq("project", project), eq("entityType", "vote"), eq("gameId", gameId)))
```
