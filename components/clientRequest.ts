export async function fetchClientJson<Body>(
  url: string,
  failureMessage: string,
  options?: RequestInit,
): Promise<{ response: Response; body: Body }> {
  try {
    const response = await fetch(url, options);
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error(failureMessage);
    }
    return { response, body: body as Body };
  } catch {
    throw new Error(failureMessage);
  }
}
