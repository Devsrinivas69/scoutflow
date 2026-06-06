import { z } from "zod";

interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public url: string,
    message: string,
    public data?: any
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A central API client wrapper for external API calls
 */
export async function fetchWithRetry<T>(
  url: string,
  options: FetchOptions = {},
  schema?: z.ZodType<T>
): Promise<T> {
  const { timeoutMs = 8000, retries = 3, ...fetchOptions } = options;

  let attempt = 0;
  let lastError: any;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = await response.text();
        }
        throw new ApiError(
          response.status,
          url,
          `API Error: ${response.statusText}`,
          errorData
        );
      }

      // 204 No Content
      if (response.status === 204) {
        return {} as T;
      }
      
      const data = await response.json();

      if (schema) {
        return schema.parse(data);
      }
      
      return data as T;
    } catch (error: any) {
      clearTimeout(timeoutId);

      lastError = error;
      
      // Do not retry on client errors (except 429)
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429) {
        break;
      }

      // Abort errors shouldn't typically be retried if it's our manual timeout
      if (error.name === "AbortError" && attempt >= retries) {
        throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
      }

      attempt++;
      if (attempt <= retries) {
        // Exponential backoff: 1s, 2s, 4s...
        const backoffMs = Math.pow(2, attempt - 1) * 1000;
        await wait(backoffMs);
      }
    }
  }

  throw lastError;
}