import { randomUUID } from "node:crypto";
import OpenAI, { APIError } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { TickerEvent, TickerKind } from "@/lib/types";
import { env, processStore } from "@/lib/env";
import { fixtureTicker } from "@/fixtures/ticker";

export interface ChatPayload {
  messages: ChatCompletionMessageParam[];
  json?: boolean;
  maxTokens?: number;
}

export interface ImagePayload {
  prompt: string;
  size: string;
}

/** `data` is the message text for chat kinds, base64 bytes for images, null in fixture mode. */
export interface ZgResult {
  event: TickerEvent;
  data: string | null;
}

/** A failed call still has a ticker event, so the request ID stays visible. */
export class ZgError extends Error {
  constructor(
    message: string,
    readonly event: TickerEvent,
  ) {
    super(message);
  }
}

/** Every 0G call this process made, oldest first. The provenance trail behind the ticker. */
export const requestLog = processStore<TickerEvent[]>("zgRequestLog", () => []);

const DEFAULT_BASE_URL = "https://router-api.0g.ai/v1";
const MODEL_ENV = {
  moderation: "ZG_CHAT_MODEL",
  plan: "ZG_CHAT_MODEL",
  dialogue: "ZG_CHAT_MODEL",
  vision: "ZG_VISION_MODEL",
  image: "ZG_IMAGE_MODEL",
} as const;
// shortcut: guesses until the first rehearsal measures real latencies (PRD "Failures").
const TIMEOUT_MS: Record<TickerKind, number> = {
  moderation: 15_000,
  plan: 60_000,
  image: 120_000,
  vision: 60_000,
  dialogue: 20_000,
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

let client: OpenAI | undefined;
// maxRetries 1: the SDK retries once on timeouts, 408/409/429 (honouring Retry-After) and 5xx.
const zg = () =>
  (client ??= new OpenAI({
    baseURL: process.env.ZG_COMPUTE_BASE_URL || DEFAULT_BASE_URL,
    apiKey: required("ZG_COMPUTE_API_KEY"),
    maxRetries: 1,
  }));

/** 0G puts its request ID in the body (x_0g_trace.request_id), not in a header. */
function traceId(body: unknown, fallback: string | null | undefined): string {
  const trace = (body as { x_0g_trace?: { request_id?: string } } | undefined)?.x_0g_trace;
  return trace?.request_id ?? fallback ?? "none";
}

async function chat(model: string, p: ChatPayload, timeout: number) {
  const { data, request_id } = await zg()
    .chat.completions.create(
      {
        model,
        messages: p.messages,
        max_tokens: p.maxTokens,
        ...(p.json && { response_format: { type: "json_object" as const } }),
      },
      { timeout },
    )
    .withResponse();
  return { data: data.choices[0]?.message.content ?? "", requestId: traceId(data, request_id) };
}

async function image(model: string, p: ImagePayload, timeout: number) {
  const { data, request_id } = await zg()
    .images.generate(
      // 0G only returns base64 for now; URL responses are not enabled yet.
      { model, prompt: p.prompt, size: p.size as "1024x1024", n: 1, response_format: "b64_json" },
      { timeout },
    )
    .withResponse();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("image response had no b64_json");
  return { data: b64, requestId: traceId(data, request_id) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The only way the app talks to 0G Private Computer. Records model, latency, and request ID. */
export async function zgCall(kind: "image", payload: ImagePayload): Promise<ZgResult>;
export async function zgCall(
  kind: Exclude<TickerKind, "image">,
  payload: ChatPayload,
): Promise<ZgResult>;
export async function zgCall(
  kind: TickerKind,
  payload: ChatPayload | ImagePayload,
): Promise<ZgResult> {
  const started = Date.now();
  const sample = fixtureTicker.find((e) => e.kind === kind);
  const model = env.useFixtures ? (sample?.model ?? `fixture-${kind}`) : required(MODEL_ENV[kind]);
  const record = (status: TickerEvent["status"], requestId: string): TickerEvent => {
    const event: TickerEvent = {
      id: randomUUID(),
      kind,
      model,
      startedAt: new Date(started).toISOString(),
      latencyMs: Date.now() - started,
      requestId,
      status,
    };
    requestLog.push(event);
    return event;
  };

  if (env.useFixtures) {
    // Fixture latency is scaled down so the demo ticker visibly streams without a long wait.
    await sleep((sample?.latencyMs ?? 500) / 5);
    return { event: record("ok", `fx-${randomUUID().slice(0, 8)}`), data: null };
  }

  try {
    const { data, requestId } =
      kind === "image"
        ? await image(model, payload as ImagePayload, TIMEOUT_MS.image)
        : await chat(model, payload as ChatPayload, TIMEOUT_MS[kind]);
    return { event: record("ok", requestId), data };
  } catch (err) {
    const requestId = err instanceof APIError ? traceId(err.error, err.requestID) : "none";
    const reason = err instanceof Error ? err.message : String(err);
    throw new ZgError(`0G ${kind} call failed: ${reason}`, record("failed", requestId));
  }
}

/** Parses a JSON reply, tolerating a ```json fence around it. Null when it is not JSON. */
export function parseJson(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
  } catch {
    return null;
  }
}

const NEURON_PER_0G = 10n ** 18n;

/**
 * R13: the 0G account balance in 0G, or null when unknown. Needs a management key (mk-) with
 * account:read; inference keys (sk-) are refused for this endpoint.
 */
export async function zgBalance(): Promise<number | null> {
  const key = process.env.ZG_MANAGEMENT_KEY;
  if (env.useFixtures || !key) return null;
  try {
    const res = await fetch(
      `${process.env.ZG_COMPUTE_BASE_URL || DEFAULT_BASE_URL}/account/balance`,
      {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) return null;
    const { total_balance } = (await res.json()) as { total_balance?: string };
    // Neuron is 1e-18 0G; keep 6 decimals without losing precision in a float.
    return Number((BigInt(total_balance ?? "") * 10n ** 6n) / NEURON_PER_0G) / 1e6;
  } catch {
    return null;
  }
}
