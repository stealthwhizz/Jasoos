export const CLIENT_REQUEST_TIMEOUT_MS = 30_000;

/** Keep the deadline active through body parsing, not just until response headers arrive. */
export async function fetchClientJsonValue(
  url: string,
  failureMessage: string,
  options?: RequestInit,
  timeoutMs = CLIENT_REQUEST_TIMEOUT_MS,
): Promise<{ response: Response; body: unknown }> {
  const controller = new AbortController();
  const parent = options?.signal;
  const cancel = () => controller.abort();
  if (parent?.aborted) cancel();
  else parent?.addEventListener("abort", cancel, { once: true });
  const deadline = setTimeout(cancel, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body: unknown = await response.json();
    return { response, body };
  } catch {
    throw new Error(failureMessage);
  } finally {
    clearTimeout(deadline);
    parent?.removeEventListener("abort", cancel);
  }
}

export async function fetchClientJson<Body>(
  url: string,
  failureMessage: string,
  options?: RequestInit,
  timeoutMs = CLIENT_REQUEST_TIMEOUT_MS,
): Promise<{ response: Response; body: Body }> {
  const { response, body } = await fetchClientJsonValue(url, failureMessage, options, timeoutMs);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(failureMessage);
  return { response, body: body as Body };
}
