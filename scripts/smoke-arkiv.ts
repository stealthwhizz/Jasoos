// Arkiv smoke test on rabdi.
// Always: one read (chain ID, latest block).
// With ARKIV_SIGNER_KEY: writes one short-lived test `visit` entity, reads it back by key and by
// query, counts it, and checks that the node can sort. Costs a little testnet gas.
import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, desc, eq } from "@arkiv-network/sdk/query";
import { http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { VisitEntity, WorldEntity } from "../lib/arkiv/schemas";
import { timed } from "./env";

const accessKey = process.env.ARKIV_ACCESS_KEY ?? "";
const project = process.env.ARKIV_PROJECT_ID || "ethjasoos";
const chain = rabdi({ accessKey });
const transport = http(process.env.ARKIV_RPC_URL || undefined);
const reader = createPublicClient({ chain, transport });

const [[chainId, block], ms] = await timed(() =>
  Promise.all([reader.getChainId(), reader.getBlockNumber()]),
);
console.log({
  chainId,
  expected: chain.id,
  latestBlock: block,
  latencyMs: ms,
  accessKey: !!accessKey,
});

const signerKey = process.env.ARKIV_SIGNER_KEY;
if (!signerKey) {
  console.log("smoke:arkiv: read only. Set ARKIV_SIGNER_KEY (funded on rabdi) to test writes.");
  process.exit(0);
}

const account = privateKeyToAccount(signerKey as Hex);
const writer = createWalletClient({ chain, transport, account });
const balance = await reader.getBalance({ address: account.address });
console.log({ signer: account.address, balanceWei: balance });
if (balance === 0n) {
  console.log("smoke:arkiv: signer has no funds. Use https://hub.arkiv.network/faucet first.");
  process.exit(1);
}

const marker = `smoke-${Date.now()}`;
const [created, writeMs] = await timed(() =>
  writer.createEntity(
    VisitEntity,
    { project, entityType: "visit", worldKey: marker },
    { expiration: ExpirationTime.fromSeconds(600) },
  ),
);
console.log({ wrote: created.entityKey, txHash: created.txHash, writeMs });

const [byKey, readMs] = await timed(() => reader.getEntity(created.entityKey, VisitEntity));
const scope = and(eq("project", project), eq("entityType", "visit"), eq("worldKey", marker));
const [count, countMs] = await timed(() => reader.count().from(VisitEntity).where(scope).fetch());
console.log({ readBack: byKey.worldKey.value === marker, readMs, count, countMs });

const sorted = await reader
  .select({ $key: true, createdAt: true })
  .from(WorldEntity)
  .where(and(eq("project", project), eq("entityType", "world")))
  .orderBy(desc("createdAt"))
  .limit(3)
  .fetch();
console.log({ worldsNewestFirst: sorted.entities.map((w) => [w.$key, Number(w.createdAt.value)]) });
console.log(`explorer: ${chain.blockExplorers?.default.url}/tx/${created.txHash}`);
