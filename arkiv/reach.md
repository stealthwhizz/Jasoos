# Reach

## Who uses it

- **Makers** sign in with World ID, create cases, and save `game` entities.
- **Players** sign in to browse and play saved cases through the app. External readers
  can query the public metadata without signing in.
- **Detectives** open evidence and accuse; `unlock` and `accusation` records are public.
- **Other apps and judges** can list, count and read cases without our API.

## Live integration snapshot

`npm run arkiv:query` on 6 November 2026, project `ethjasoos`, returned:

| Entity | Count |
| --- | --- |
| game | 2 |
| scene | 4 |
| screen | 0 |
| unlock | 0 |
| accusation | 3 |

These are live entity counts, not unique players or usage figures. Accusation counts may
include the earlier prototype. The new screen/unlock paths have no live records in this snapshot.

## How another app can read our worlds

No API key, account, or permission from us is needed. Filter on our project and entity type:

```ts
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, desc, eq } from "@arkiv-network/sdk/query";
import { http } from "viem";

const client = createPublicClient({ chain: rabdi({ accessKey: "" }), transport: http() });
const worlds = await client
  .select({ $key: true, $owner: true, $attributes: true })
  .where(and(eq("project", "ethjasoos"), eq("entityType", "game")))
  .orderBy(desc("createdAt", "u64"))
  .limit(24)
  .fetch();
```

Each game's `record` attribute is gzipped JSON with its bible and asset URLs. Separate
`scene`/`screen` entities contain saved scenes. The mystery and victory finale are sealed.
The guessed index and correctness are public in accusation entities. Images depend on the
asset host remaining available. See [schema.md](schema.md) for current fields and lifetimes.
