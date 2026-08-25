import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";
import { logger } from "../config/logger";
import { ApiErrorResponse } from "../core/dtos";

/**
 * Global Express error handler. Catches all errors thrown
 * from route handlers and produces the standardized error envelope.
 */
export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.headers["x-request-id"] as string || "unknown";

  if (err instanceof AppError) {
    logger.warn("Handled application error", {
      requestId,
      code: err.code,
      message: err.message,
      status: err.statusCode,
    });

    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details.length > 0 ? err.details : undefined,
      },
    };

    res.status(err.statusCode).json(response);
    return;
  }

  // Unhandled error: log full stack and return opaque 500
  logger.error("Unhandled internal error", {
    requestId,
    message: err.message,
    stack: err.stack,
  });

  const response: ApiErrorResponse = {
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    },
  };

  res.status(500).json(response);
}
