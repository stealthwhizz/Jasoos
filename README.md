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

| Command                               | What it does                                                |
| ------------------------------------- | ----------------------------------------------------------- |
| `npm run dev` / `build`               | Next.js dev server / production build                       |
| `npm run lint` / `typecheck` / `test` | ESLint, `tsc --noEmit`, Vitest                              |
| `npm run smoke:0g`                    | One chat call on 0G, prints latency and request ID          |
| `npm run smoke:arkiv`                 | One read on the Arkiv RPC, prints chain ID and latest block |
| `npm run smoke:worldid`               | Reaches the World ID verify endpoint                        |

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

<!-- TODO(C): wallet addresses that wrote entities, and one query anyone can run. -->

| What           | File                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| Entity helpers | [lib/arkiv/index.ts](lib/arkiv/index.ts)                                                               |
| Gallery        | [app/api/gallery/route.ts](app/api/gallery/route.ts), [components/Gallery.tsx](components/Gallery.tsx) |
| Daily quota    | [app/api/worlds/route.ts](app/api/worlds/route.ts)                                                     |
| Accusations    | [app/api/worlds/[id]/accuse/route.ts](app/api/worlds/[id]/accuse/route.ts)                             |
| Judge docs     | [arkiv/](arkiv/)                                                                                       |

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
