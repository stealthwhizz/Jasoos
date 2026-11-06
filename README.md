# ETHJasoos

One sentence becomes a walkable, illustrated detective world. Type a scene, walk the street it
becomes, enter buildings, question the people inside, find clues hidden in ordinary-looking notes,
and name the culprit.

Built at ETHGlobal Mumbai 2026. Product spec: [docs/PRD.md](docs/PRD.md).

## How to run

```bash
npm install
cp .env.example .env.local   # USE_FIXTURES=true runs with no keys
npm run dev                  # http://localhost:3000
```

| Command                               | What it does                                                     |
| ------------------------------------- | ---------------------------------------------------------------- |
| `npm run dev` / `build`               | Next.js dev server / production build                            |
| `npm run lint` / `typecheck` / `test` | ESLint, `tsc --noEmit`, Vitest                                   |
| `npm run smoke:0g`                    | One chat call on 0G, prints latency and request ID               |
| `npm run smoke:arkiv`                 | Chain read; with `ARKIV_SIGNER_KEY`, one write, read back, count |
| `npm run arkiv:query`                 | Lists this app's live Arkiv entities. No keys needed             |
| `npm run smoke:worldid`               | Reaches the World ID verify endpoint                             |

## 0G Private Computer

<!-- TODO(A): models used, measured latencies, one sentence on what breaks without 0G. -->

| What                                  | File                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------- |
| 0G wrapper (records every request ID) | [lib/zg/index.ts](lib/zg/index.ts)                                         |
| Moderation, planning, images, vision  | [lib/engine/](lib/engine/)                                                 |
| Parallel generation scheduler         | [lib/engine/scheduler.ts](lib/engine/scheduler.ts)                         |
| NPC dialogue rules                    | [lib/engine/dialogueTurn.ts](lib/engine/dialogueTurn.ts)                   |
| Ticker stream (SSE)                   | [app/api/worlds/[id]/events/route.ts](app/api/worlds/[id]/events/route.ts) |

## Arkiv

Cases live on the Arkiv **rabdi** testnet (chain ID 7794095). The gallery is read by the visitor's
browser straight from Arkiv, and expiry runs the daily limit, activity counts, and cold cases with
no scheduled jobs. Details: [schema](arkiv/schema.md), [how we use it](arkiv/how-you-use-arkiv.md),
[why Arkiv](arkiv/why-arkiv.md), [friction log](arkiv/friction.md), [reach](arkiv/reach.md).

**Wallet that wrote entities:** `0xf9976C655C3f61f5C7b0E8a0655d6c2195F483b5` (server signer,
[explorer](https://rabdi.explorer.arkiv.network/address/0xf9976C655C3f61f5C7b0E8a0655d6c2195F483b5))

**A query anyone can run** (no keys, no wallet, none of our servers):

```bash
npm install && npm run arkiv:query
```

It lists live worlds newest first and counts every entity type. The core of it:

```ts
client
  .select({ $key: true, $owner: true, $attributes: true })
  .where(and(eq("project", "ethjasoos"), eq("entityType", "world")))
  .orderBy(desc("createdAt", "u64"))
  .limit(10)
  .fetch();
```

| What                                       | File                                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Schemas                                    | [lib/arkiv/schemas.ts](lib/arkiv/schemas.ts)                                                   |
| Reads and writes on rabdi                  | [lib/arkiv/live.ts](lib/arkiv/live.ts)                                                         |
| Gallery (browser query, server fallback)   | [components/Gallery.tsx](components/Gallery.tsx), [lib/arkiv/gallery.ts](lib/arkiv/gallery.ts) |
| Daily quota                                | [app/api/worlds/route.ts](app/api/worlds/route.ts)                                             |
| One accusation per person                  | [app/api/worlds/[id]/accuse/route.ts](app/api/worlds/[id]/accuse/route.ts)                     |
| Sealing the answer before it goes on chain | [lib/arkiv/codec.ts](lib/arkiv/codec.ts)                                                       |
| Smoke test (one write and read)            | `npm run smoke:arkiv` ([scripts/smoke-arkiv.ts](scripts/smoke-arkiv.ts))                       |

## World ID

<!-- TODO(C): the trust moment, the blocked path, and the debrief. -->

| What                                | File                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------- |
| Server-side proof check and session | [lib/worldid/index.ts](lib/worldid/index.ts)                               |
| Verify route                        | [app/api/verify/route.ts](app/api/verify/route.ts)                         |
| Creation gate (401)                 | [app/api/worlds/route.ts](app/api/worlds/route.ts)                         |
| Accusation gate (one per human)     | [app/api/worlds/[id]/accuse/route.ts](app/api/worlds/[id]/accuse/route.ts) |

## Known limits

- One server-held signer writes all Arkiv entities, so makers do not yet own their worlds.
- The mystery's answer is sealed on chain with a server key (`MYSTERY_SEAL_KEY`). Lose that key and
  existing cases can no longer be judged; rotate it only with a plan to re-seal.
- An Arkiv write takes about 6 s, so publishing a world adds that much after generation.
- `$expiresAt` is a block number; "next slot opens in…" is estimated from the recent block time.
- Jobs and sessions live in server memory: one server process only, lost on restart.
- The hidden-note codec is a game mechanic, not security. The manifest and codebook are readable.
- TODO: add limits found while building.

## How AI was used

See [AI_USAGE.md](AI_USAGE.md).

## Team

|     | Name        | Lane                        | Contact |
| --- | ----------- | --------------------------- | ------- |
| A   | Amogh Sunil | Engine, 0G, detective logic | TODO    |
| B   | Suraj       | Game client and polish      | TODO    |
| C   | Kishore     | Chain, identity, submission | TODO    |
