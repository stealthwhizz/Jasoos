# Arkiv schema

Testnet **rabdi** (chain ID 7794095), written with `@arkiv-network/sdk` 1.0.1. Schemas are defined
in code in [lib/arkiv/schemas.ts](../lib/arkiv/schemas.ts); this page mirrors them.

Every entity carries two indexed strings, so anyone can find this app's data without our API:

| Attribute    | Type         | Value                                         |
| ------------ | ------------ | --------------------------------------------- |
| `project`    | str, indexed | `ethjasoos` (`ARKIV_PROJECT_ID`)              |
| `entityType` | str, indexed | `world`, `creation`, `visit`, or `accusation` |

People never appear by name, wallet, or prompt. A player is a `humanHash`:
`sha256("ethjasoos:" + World ID nullifier)`, which is stable per person for this app and reveals
nothing about them.

## world

One case file. Its entity key is the world's id in every URL (`/world/0x…`).

| Attribute       | Type                   | Notes                                                                                    |
| --------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| `createdAt`     | u64, indexed           | Unix ms. The gallery sorts on it (`$createdAt` cannot be sorted on, so we store our own) |
| `publishId`     | str, indexed, optional | Random id shared with the matching `creation`, so both are written in one transaction    |
| `title`         | str                    | Cut to 128 bytes, the Arkiv string limit                                                 |
| `summary`       | bytes                  | JSON `{ premise, thumbnailUrl }` for gallery cards, so a listing never loads a manifest  |
| `manifest`      | bytes                  | Gzipped JSON: world bible without the mystery, assets, walk map, doors, notes            |
| `sealedMystery` | bytes                  | AES-256-GCM sealed `{ secret, culpritNpcId, finalePrompt }`. Only our server can open it |

**Expires:** 7 days after publish. Each play extends it to 7 days from now (at most once an hour per
world, in the same transaction as the visit). A case nobody plays goes cold and leaves the gallery.

## creation

One row per world made. The live count per person is the daily quota.

| Attribute   | Type         | Notes                                |
| ----------- | ------------ | ------------------------------------ |
| `humanHash` | str, indexed | Who created                          |
| `publishId` | str, indexed | Links to the world written alongside |

**Expires:** 24 hours. With `CREATION_LIMIT_PER_DAY=3`, a fourth creation is refused until the
oldest `creation` expires, and the refusal says when (from that entity's `$expiresAt`).

## visit

| Attribute  | Type         | Notes           |
| ---------- | ------------ | --------------- |
| `worldKey` | str, indexed | The world's key |

**Expires:** 1 hour. The live count is how busy a world is right now (shown on gallery cards).

## accusation

One per person per case (World ID gated).

| Attribute   | Type         | Notes                                                                                       |
| ----------- | ------------ | ------------------------------------------------------------------------------------------- |
| `worldKey`  | str, indexed | The case                                                                                    |
| `humanHash` | str, indexed | Who accused                                                                                 |
| `correct`   | bool         | Whether they were right. The name they guessed is **not** stored, so the answer never leaks |

**Expires:** 30 days, longer than any case lives, so the one-per-person rule holds for the case's life.

## solve

Planned for the daily leaderboard (R16), not built. Cut for time.

## Queries anyone can run

All of these filter on the node; none need a key or our servers.
[scripts/arkiv-query.ts](../scripts/arkiv-query.ts) runs the first and the counts: `npm run arkiv:query`.

```ts
import { and, desc, eq } from "@arkiv-network/sdk/query";
const scope = (t: string) => and(eq("project", "ethjasoos"), eq("entityType", t));

// Live worlds, newest first (the gallery)
client
  .select({ $key: true, $owner: true, $attributes: true })
  .where(scope("world"))
  .orderBy(desc("createdAt", "u64"))
  .limit(24)
  .fetch();

// Daily quota: live creations for one person
client
  .count()
  .where(and(scope("creation"), eq("humanHash", hash)))
  .fetch();

// When that person's next slot opens: their oldest live creation's expiry
client
  .select({ $expiresAt: true })
  .where(and(scope("creation"), eq("humanHash", hash)))
  .orderBy(asc("$expiresAt"))
  .limit(1)
  .fetch();

// Activity: live visits to one world
client
  .count()
  .where(and(scope("visit"), eq("worldKey", worldKey)))
  .fetch();

// Has this person already accused in this case?
client
  .count()
  .where(and(scope("accusation"), eq("worldKey", worldKey), eq("humanHash", hash)))
  .fetch();
```
