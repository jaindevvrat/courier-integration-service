import "reflect-metadata";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import path from "path";

import { env } from "./config/env";
import { logger } from "./config/logger";
import { AppDataSource } from "./config/data-source";
import { router } from "./routes";
import { globalErrorHandler } from "./middleware/errorHandler";
import { requestIdMiddleware } from "./middleware/requestId";
import { CourierRegistry } from "./core/CourierRegistry";
import { UrbaneBoltAdapter } from "./adapters/UrbaneBoltAdapter";
import { MockCourierAdapter } from "./adapters/MockCourierAdapter";

async function bootstrap(): Promise<void> {
  // Initialize database connection
  await AppDataSource.initialize();
  logger.info("Database connection established");

  // Register courier adapters
  CourierRegistry.register(new UrbaneBoltAdapter());
  CourierRegistry.register(new MockCourierAdapter());
  logger.info("Courier adapters registered", {
    partners: CourierRegistry.getSupportedPartners(),
  });

  const app = express();

  // Global middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));
  app.use(requestIdMiddleware);

  // Swagger UI
  try {
    const swaggerDoc = YAML.load(path.join(__dirname, "../swagger.yaml"));
    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDoc));
    logger.info("Swagger UI available at /api-docs");
  } catch {
    logger.warn("swagger.yaml not found, Swagger UI disabled");
  }

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Routes
  app.use(router);

  // Error handler must be registered last
  app.use(globalErrorHandler);

  app.listen(env.port, () => {
    logger.info(`Server listening on port ${env.port} [${env.nodeEnv}]`);
  });
}

bootstrap().catch((err) => {
  logger.error("Failed to start application", {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});
