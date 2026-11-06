# Reach

## Who is it for, and would they use it?

- **Casual players who like short mysteries.** One sentence ("a rain-flooded night market in
  Mumbai…") becomes a 5-minute case with a street, three rooms, three suspects, a hidden note
  and one accusation. Each case is new, so there is a reason to come back tomorrow.
- **Makers** who want to share a case with friends. Each verified human gets 3 free cases
  (`FREE_GAME_LIMIT`), so the gallery fills with cases from real people, not bots.
- **Other apps and communities.** Every case and its solve record is public on Arkiv, so a
  Discord bot, a leaderboard or another game client can list and replay cases without us
  (see below).
- **Brands and event hosts (after Mumbai).** A sponsored case set in a real place, such as a
  café chain's night market, a festival or a product launch, is a playable ad whose plays and
  solves anyone can verify from Arkiv instead of trusting a dashboard.

## Can they try it today?

- Live demo: **[LIVE LINK, added at deploy]**. Sign in with World ID (the simulator works),
  play any case in the gallery, or build your own.
- Locally: `npm install`, copy `.env.example` to `.env.local`, `npm run dev`. Without keys the
  app runs in local test mode.
- Read the data with no account at all: `npm run arkiv:query`.

## Numbers so far (pre-launch, team testing)

`npm run arkiv:query` on 7 November 2026, project `ethjasoos`:

| Live entity              | Count |
| ------------------------ | ----- |
| game (cases)             | 4     |
| scene (rooms)            | 7     |
| screen (street screens)  | 4     |
| unlock (evidence opened) | 0     |
| accusation               | 4     |

These are integration-test numbers from one maker on the team, not users. Three accusations
come from the earlier prototype schema and one is a sealed-accusation test. We will replace
this table with the demo-window counts (distinct makers, cases, unlocks and solves).

## Will we keep building after Mumbai?

Yes. Next, in order:

1. **Maker-owned cases:** write `game` entities from the maker's wallet instead of our signer.
2. **Case of the day:** one featured case per day, with an Arkiv `solve` record per human and
   a daily leaderboard that expires with the day.
3. **Sponsored cases:** a brand pays for a case; plays and solves are auditable on Arkiv.

## How another app can read our cases

No API key, account, or permission from us is needed:

```ts
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, desc, eq } from "@arkiv-network/sdk/query";
import { http } from "viem";

const client = createPublicClient({ chain: rabdi({ accessKey: "" }), transport: http() });
const cases = await client
  .select({ $key: true, $owner: true, $attributes: true })
  .where(and(eq("project", "ethjasoos"), eq("entityType", "game")))
  .orderBy(desc("createdAt", "u64"))
  .limit(24)
  .fetch();
```

Each `game.record` is gzipped JSON with the case's bible and asset URLs; `scene`/`screen`
entities hold the saved rooms and streets. The answer and victory finale are sealed, and so is
each accusation's guessed suspect, so another app can show a case and its solve rate without
spoiling it. Images depend on our asset host staying up.
