# Reach

## Who uses it

- **Makers** verify with World ID once, type a sentence, and get a case. Every case they publish
  is a `world` entity anyone can read.
- **Players** (no sign-in needed to play) browse the gallery, which their own browser reads from
  Arkiv, and every case they open writes a `visit`.
- **Detectives** (World ID verified) name a culprit once per case; that `accusation` is public, so
  anyone can see the rule was kept.
- **Other apps and judges** can list, count, and read our cases without us. See below.

## Numbers from the demo window

Live counts are one command away and need no keys:

```bash
npm run arkiv:query
```

Snapshot from integration testing on rabdi, 2026-11-06 (before the demo):

| Live entities | Count |
| ------------- | ----- |
| world         | 4     |
| creation      | 4     |
| visit         | 6     |
| accusation    | 1     |

<!-- TODO(C): replace with the counts at the end of the demo window, plus distinct humans
     (count distinct humanHash across creation and accusation) and worlds created. -->

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
  .where(and(eq("project", "ethjasoos"), eq("entityType", "world")))
  .orderBy(desc("createdAt", "u64"))
  .limit(24)
  .fetch();
```

Each world's `manifest` attribute is gzipped JSON: the street, the characters, the notes, and the
asset list, enough for another client to render the same case. The answer is sealed, so another
app can show a case but cannot spoil it.
