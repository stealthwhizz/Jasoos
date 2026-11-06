// 1. Signs an rp_context with WORLD_RP_SIGNING_KEY (the same call /api/verify GET makes).
// 2. Sends an empty payload to the v4 verify endpoint for WORLD_RP_ID. A 4xx with a JSON error
//    means the endpoint and RP ID are reachable; a real proof needs the widget or the simulator.
import { signRequest } from "@worldcoin/idkit/signing";
import { requireEnv, timed } from "./env";

const env = requireEnv("smoke:worldid", ["WORLD_APP_ID", "WORLD_RP_ID", "WORLD_RP_SIGNING_KEY"]);
const action = process.env.WORLD_ACTION_ID || "create-world";

const sig = signRequest({ action, signingKeyHex: env.WORLD_RP_SIGNING_KEY });
console.log({ action, nonce: sig.nonce, ttlSec: sig.expiresAt - sig.createdAt, signed: true });

const url = `https://developer.world.org/api/v4/verify/${encodeURIComponent(env.WORLD_RP_ID)}`;
const [res, ms] = await timed(() =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
);
console.log({ url, status: res.status, latencyMs: ms, body: (await res.text()).slice(0, 300) });
