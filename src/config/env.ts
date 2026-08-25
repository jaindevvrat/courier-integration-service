import dotenv from "dotenv";
dotenv.config();

/**
 * Centralized environment configuration. All external values are
 * resolved here so the rest of the application remains pure and testable.
 */
export const env = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",

  db: {
    type: (process.env.DB_TYPE || "sqlite") as "sqlite" | "postgres",
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    username: process.env.DB_USERNAME || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: process.env.DB_NAME || "courier_platform",
  },

  urbanebolt: {
    baseUrl: process.env.URBANEBOLT_BASE_URL || "",
    username: process.env.URBANEBOLT_USERNAME || "",
    password: process.env.URBANEBOLT_PASSWORD || "",
    apiKey: process.env.URBANEBOLT_API_KEY || "",
  },

  retry: {
    maxAttempts: parseInt(process.env.RETRY_MAX_ATTEMPTS || "3", 10),
    baseDelayMs: parseInt(process.env.RETRY_BASE_DELAY_MS || "500", 10),
    maxDelayMs: parseInt(process.env.RETRY_MAX_DELAY_MS || "10000", 10),
  },

  bulk: {
    concurrencyLimit: parseInt(process.env.BULK_CONCURRENCY_LIMIT || "10", 10),
    maxBatchSize: parseInt(process.env.BULK_MAX_BATCH_SIZE || "100", 10),
  },
} as const;
