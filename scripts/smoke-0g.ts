// One chat call on 0G Private Computer. Prints model, latency, and the request ID.
import OpenAI from "openai";
import { requireEnv, timed } from "./env";

const env = requireEnv("smoke:0g", ["ZG_COMPUTE_BASE_URL", "ZG_COMPUTE_API_KEY", "ZG_CHAT_MODEL"]);
const client = new OpenAI({ baseURL: env.ZG_COMPUTE_BASE_URL, apiKey: env.ZG_COMPUTE_API_KEY });

const [{ data, request_id, response }, ms] = await timed(() =>
  client.chat.completions
    .create({
      model: env.ZG_CHAT_MODEL,
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
      max_tokens: 5,
    })
    .withResponse(),
);
// TODO(A): confirm which header 0G uses for its request ID and read it in lib/zg.
console.log({
  model: data.model,
  reply: data.choices[0]?.message.content,
  latencyMs: ms,
  requestId: request_id ?? response.headers.get("x-request-id"),
});
