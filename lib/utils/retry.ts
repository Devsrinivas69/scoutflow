export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  // Cap at max 3 retries: Retry 1 -> 2s, Retry 2 -> 5s, Retry 3 -> 10s.
  // That equals 4 total attempts.
  const maxAttempts = 4;
  const retryDelays = [2000, 5000, 10000];

  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (error: unknown) {
      attempt++;
      if (attempt >= maxAttempts) throw error;

      const waitTime = retryDelays[attempt - 1] ?? 10000;
      console.warn(
        `[Retry] Attempt ${attempt}/${maxAttempts} failed. Retrying in ${waitTime}ms...`,
        error instanceof Error ? error.message : error
      );

      await new Promise((res) => setTimeout(res, waitTime));
    }
  }

  throw new Error("Max retry attempts reached");
}

export async function fetchWithTimeout(
  resource: RequestInfo,
  options: RequestInit & { timeoutMs?: number } = {}
) {
  const { timeoutMs = 10000, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(resource, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}
