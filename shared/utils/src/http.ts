// shared/utils/src/http.ts
// Shared HTTP client with retry, error handling, and pagination

import type { RetryConfig } from "../../types/src/index.js";

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public body: string,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retry: RetryConfig = { maxAttempts: 3, backoffMs: 500, retryOn: [429, 502, 503, 504] }
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
    try {
      const response = await fetch(url, options);

      if (retry.retryOn.includes(response.status) && attempt < retry.maxAttempts) {
        const delay = retry.backoffMs * Math.pow(2, attempt - 1);
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        throw new HttpError(
          response.status,
          body,
          `HTTP ${response.status}: ${response.statusText}`
        );
      }

      return response;
    } catch (err) {
      lastError = err as Error;
      if (err instanceof HttpError && !retry.retryOn.includes(err.statusCode)) {
        throw err;
      }
      if (attempt < retry.maxAttempts) {
        await sleep(retry.backoffMs * attempt);
      }
    }
  }

  throw lastError ?? new Error("Request failed after retries");
}

export async function fetchJson<T>(
  url: string,
  options: RequestInit,
  retryConfig?: RetryConfig
): Promise<T> {
  const response = await fetchWithRetry(url, options, retryConfig);
  return response.json() as Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildQueryString(
  params: Record<string, string | number | boolean | undefined>
): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}
