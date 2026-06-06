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
  const {
    maxAttempts = 3,
    initialDelayMs = 500,
    maxDelayMs = 10000,
    factor = 2,
  } = options;

  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (error: unknown) {
      attempt++;
      if (attempt >= maxAttempts) throw error;

      const isRateLimit =
        error instanceof Error &&
        (error.message.includes("429") || error.message.includes("rate limit"));

      const waitTime = isRateLimit ? maxDelayMs : Math.min(delay, maxDelayMs);
      console.warn(
        `[Retry] Attempt ${attempt}/${maxAttempts} failed. Retrying in ${waitTime}ms...`,
        error instanceof Error ? error.message : error
      );

      await new Promise((res) => setTimeout(res, waitTime));
      delay *= factor;
    }
  }

  throw new Error("Max retry attempts reached");
}
