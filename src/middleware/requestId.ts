import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

/**
 * Attaches a unique request ID to every incoming request.
 * If the client supplies X-Request-Id, it is honoured; otherwise
 * a new UUID is generated. The ID is also echoed back in the response.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers["x-request-id"] as string) || uuidv4();
  req.headers["x-request-id"] = id;
  res.setHeader("X-Request-Id", id);
  next();
}
