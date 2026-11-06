// One read against the Arkiv RPC: chain ID and latest block. No writes, no gas.
import { createPublicClient } from "@arkiv-network/sdk";
import { http } from "viem";
import { requireEnv, timed } from "./env";

const env = requireEnv("smoke:arkiv", ["ARKIV_RPC_URL", "ARKIV_CHAIN_ID"]);
const client = createPublicClient({ transport: http(env.ARKIV_RPC_URL) });

const [[chainId, block], ms] = await timed(() =>
  Promise.all([client.getChainId(), client.getBlockNumber()]),
);
console.log({ chainId, expected: Number(env.ARKIV_CHAIN_ID), latestBlock: block, latencyMs: ms });
if (chainId !== Number(env.ARKIV_CHAIN_ID)) {
  console.error("smoke:arkiv: chain ID mismatch. Check ARKIV_RPC_URL.");
  process.exit(1);
}
// TODO(C): add one write + read of a test entity, and record expiry/sort findings in arkiv/friction.md.
