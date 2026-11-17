// The one module all real FEC network calls go through (architecture
// requirement: a single place with a configurable base URL, so this can
// later point at a proxy server that holds the API key and caches
// responses server-side, without touching the rest of the codebase).
//
// TODO(proxy): once a proxy server exists (see ROADMAP.md), change
// BASE_URL to point at it instead, and drop the api_key query param —
// the proxy would attach its own server-side key.
const BASE_URL = "https://api.open.fec.gov/v1";

export class FecApiError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // "rateLimited" | "invalidApiKey" | "error"
  }
}

export async function fecGet(path, params, apiKey) {
  const url = new URL(BASE_URL + path);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === null || value === undefined) continue;
    url.searchParams.set(key, value);
  }
  url.searchParams.set("api_key", apiKey);

  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new FecApiError("error", `Network error contacting FEC API: ${err.message}`);
  }

  if (response.status === 429) {
    throw new FecApiError("rateLimited", "FEC API rate limit reached");
  }
  if (response.status === 403) {
    const body = await response.json().catch(() => null);
    if (body?.error?.code === "API_KEY_INVALID") {
      throw new FecApiError("invalidApiKey", "Invalid FEC API key");
    }
    throw new FecApiError("error", "FEC API request forbidden");
  }
  if (!response.ok) {
    throw new FecApiError("error", `FEC API error (HTTP ${response.status})`);
  }
  return response.json();
}
