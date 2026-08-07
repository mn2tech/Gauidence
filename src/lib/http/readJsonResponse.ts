/** Parse a fetch Response as JSON with clearer errors for empty or HTML bodies. */
export async function readJsonResponse<T = Record<string, unknown>>(
  res: Response
): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(
      res.ok
        ? "Server returned an empty response. Try again."
        : `Request failed (${res.status}). Try again.`
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Server returned an invalid response (${res.status}). Try again.`
    );
  }
}
