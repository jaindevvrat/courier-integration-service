import { env } from "../config/env";
import { logger } from "../config/logger";

/**
 * Exponential backoff with jitter.
 *
 * Retries a given async function up to maxAttempts times. The delay
 * between retries grows exponentially but is capped at maxDelayMs
 * and includes random jitter to avoid thundering-herd scenarios when
 * multiple workers retry against the same upstream simultaneously.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  context: { operation: string; orderId?: string; partner?: string },
  options?: { shouldRetry?: (err: unknown) => boolean }
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs } = env.retry;
  const shouldRetry = options?.shouldRetry ?? defaultShouldRetry;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error)) {
        logger.error("Retry exhausted or non-retryable error", {
          ...context,
          attempt,
          maxAttempts,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      const delay = computeDelay(attempt, baseDelayMs, maxDelayMs);

      logger.warn("Retrying after transient failure", {
        ...context,
        attempt,
        nextRetryMs: delay,
        error: error instanceof Error ? error.message : String(error),
      });

      await sleep(delay);
    }
  }

  throw lastError;
}

function computeDelay(attempt: number, baseMs: number, maxMs: number): number {
  // Exponential: base * 2^(attempt-1), capped at maxMs
  const exponential = baseMs * Math.pow(2, attempt - 1);
  const capped = Math.min(exponential, maxMs);
  // Add jitter: randomize between 50% and 100% of the computed delay
  const jitter = capped * (0.5 + Math.random() * 0.5);
  return Math.round(jitter);
}

function defaultShouldRetry(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { response?: { status?: number }; code?: string };
  // Retry on server errors
  if (err.response?.status && err.response.status >= 500) return true;
  // Retry on network-level failures
  if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") return true;
  if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
