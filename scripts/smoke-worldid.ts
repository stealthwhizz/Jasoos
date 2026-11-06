// Sends an empty payload to the World ID verify endpoint. A 4xx with a JSON error means the
// endpoint and app ID are reachable; a real proof needs the IDKit widget or the simulator.
import { requireEnv, timed } from "./env";

const env = requireEnv("smoke:worldid", ["WORLD_APP_ID", "WORLD_ACTION_ID"]);
// TODO(C): the v4 endpoint takes an rp_id; confirm whether it equals WORLD_APP_ID for this app.
const url = `https://developer.world.org/api/v4/verify/${encodeURIComponent(env.WORLD_APP_ID)}`;

const [res, ms] = await timed(() =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
);
console.log({ url, status: res.status, latencyMs: ms, body: (await res.text()).slice(0, 300) });
