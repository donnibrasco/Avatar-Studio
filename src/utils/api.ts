export const API_BASE_URL = `${import.meta.env.BASE_URL}api`;

/** Parse API responses without exposing HTML proxy/error pages to users. */
export async function readApiJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    const location = response.url ? new URL(response.url).pathname : API_BASE_URL;
    const status = `HTTP ${response.status}`;
    if (/^\s*</.test(text)) {
      throw new Error(
        `The API returned an HTML page (${status}, ${location}). Check that the app server is running and /videolab/api requests are routed to it.`,
      );
    }
    throw new Error(`The API returned invalid JSON (${status}, ${location}). Please try again.`);
  }
}
