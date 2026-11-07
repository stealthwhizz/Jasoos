// The query anyone can run: lists Jasoos's live worlds and counts every entity type, straight
// from the Arkiv rabdi testnet. Needs no keys, no wallet, and none of our servers.
//
//   npx tsx scripts/arkiv-query.ts            (or: npm run arkiv:query)
//   ARKIV_PROJECT_ID=other npx tsx scripts/arkiv-query.ts
import "./env";
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, desc, eq } from "@arkiv-network/sdk/query";
import { http } from "viem";

async function main() {
const project = process.env.ARKIV_PROJECT_ID || "ETH Jasoos";
const client = createPublicClient({
  chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" }),
  transport: http(process.env.ARKIV_RPC_URL || undefined),
});

const scope = (entityType: string) => and(eq("project", project), eq("entityType", entityType));

// Live games, newest first. The node does the filtering and the sorting.
const worlds = await client
  .select({ $key: true, $owner: true, $expiresAt: true, $attributes: true })
  .where(scope("game"))
  .orderBy(desc("createdAt", "u64"))
  .limit(10)
  .fetch();

console.log(`Live games for project "${project}" (newest first):`);
for (const w of worlds.entities) {
  const a = w.$attributes as Record<string, { value: unknown }>;
  console.log(
    `  ${w.$key}  created ${new Date(Number(a.createdAt?.value)).toISOString()}  owner ${w.$owner}  expires at block ${w.$expiresAt}`,
  );
}

console.log("\nLive entities by type:");
for (const t of ["game", "scene", "screen", "unlock", "accusation"]) {
  console.log(`  ${t.padEnd(11)} ${await client.count().where(scope(t)).fetch()}`);
}

}

main().catch((error) => { console.error(error); process.exitCode = 1; });
