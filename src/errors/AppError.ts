/**
 * Base application error class. All domain-specific errors extend this.
 * The HTTP status code and a machine-readable error code allow the
 * global error handler to produce consistent API responses without
 * coupling to any specific framework behavior.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: unknown[];

  constructor(
    code: string,
    message: string,
    statusCode: number = 500,
    details: unknown[] = [],
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: unknown[] = []) {
    super("VALIDATION_ERROR", message, 400, details);
  }
}

export class CourierNotFoundError extends AppError {
  constructor(partner: string, supported: string[]) {
    super(
      "UNKNOWN_COURIER_PARTNER",
      `Courier partner '${partner}' is not supported. Supported: ${supported.join(", ")}`,
      400,
      supported,
    );
  }
}

export class DuplicateOrderError extends AppError {
  constructor(orderId: string) {
    super(
      "DUPLICATE_ORDER",
      `Order with internal_order_id '${orderId}' already exists`,
      409,
    );
  }
}

export class OrderNotFoundError extends AppError {
  constructor(orderId: string) {
    super("ORDER_NOT_FOUND", `Order '${orderId}' not found`, 404);
  }
}

export class CourierApiError extends AppError {
  constructor(message: string) {
    super("COURIER_API_ERROR", message, 502);
  }
}

export class CourierAuthError extends AppError {
  constructor(partner: string) {
    super(
      "COURIER_AUTH_FAILED",
      `Authentication with '${partner}' failed`,
      502,
    );
  }
}

export class CourierTimeoutError extends AppError {
  constructor(partner: string) {
    super("COURIER_TIMEOUT", `Request to '${partner}' timed out`, 504);
  }
}

export class BulkLimitExceededError extends AppError {
  constructor(max: number) {
    super("BULK_LIMIT_EXCEEDED", `Maximum ${max} orders per bulk request`, 400);
  }
}
