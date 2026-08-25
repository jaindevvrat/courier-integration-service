import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from "axios";
import { logger } from "../config/logger";

/**
 * Creates a pre-configured Axios instance with:
 * - Configurable base URL and timeout
 * - Request/response interceptors for structured logging
 * - Automatic rejection of non-2xx status codes (Axios default)
 *
 * Auth-retry and exponential backoff are handled at the adapter level
 * rather than inside interceptors, keeping retry semantics explicit
 * and testable.
 */
export function createHttpClient(
  baseURL: string,
  timeoutMs: number = 30000,
): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: timeoutMs,
    headers: { "Content-Type": "application/json" },
  });

  client.interceptors.request.use((config) => {
    logger.debug("Outgoing courier request", {
      method: config.method?.toUpperCase(),
      url: `${config.baseURL}${config.url}`,
    });
    return config;
  });

  client.interceptors.response.use(
    (response) => {
      logger.debug("Courier response received", {
        status: response.status,
        url: response.config.url,
      });
      return response;
    },
    (error: AxiosError) => {
      logger.warn("Courier response error", {
        status: error.response?.status,
        url: error.config?.url,
        code: error.code,
        message: error.message,
      });
      return Promise.reject(error);
    },
  );

  return client;
}

/**
 * Determines whether an Axios error represents an authentication
 * failure (HTTP 401) from the upstream courier, which signals the
 * adapter should re-authenticate and retry.
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof AxiosError && error.response?.status === 401) {
    return true;
  }
  if (error && typeof error === "object") {
    const err = error as {
      isAxiosError?: boolean;
      response?: { status?: number };
    };
    if (err.isAxiosError && err.response?.status === 401) {
      return true;
    }
  }
  return false;
}
