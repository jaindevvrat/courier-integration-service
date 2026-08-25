import { Request, Response, NextFunction } from "express";
import { OrderService } from "../services/OrderService";
import { BulkOrderService } from "../services/BulkOrderService";
import { CourierRegistry } from "../core/CourierRegistry";
import { ValidationError } from "../errors/AppError";

/**
 * Express controller for all order-related endpoints.
 * Responsible for request parsing, input validation, and delegating
 * to the appropriate service. No business logic lives here.
 */
export class OrderController {
  private orderService: OrderService;
  private bulkService: BulkOrderService;

  constructor() {
    this.orderService = new OrderService();
    this.bulkService = new BulkOrderService();
  }

  createOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const body = req.body;
      this.validateCreatePayload(body);

      const result = await this.orderService.createOrder(body);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  trackOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { order_id } = req.params;
      if (!order_id)
        throw new ValidationError("order_id path parameter is required");

      const result = await this.orderService.trackOrder(order_id);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  cancelOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { order_id } = req.params;
      if (!order_id)
        throw new ValidationError("order_id path parameter is required");

      const result = await this.orderService.cancelOrder(order_id);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  bulkCreate = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { orders } = req.body;
      if (!Array.isArray(orders) || orders.length === 0) {
        throw new ValidationError("'orders' must be a non-empty array");
      }

      const result = await this.bulkService.processBulk(orders);
      res.status(202).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  getOrderHistory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { order_id } = req.params;
      if (!order_id)
        throw new ValidationError("order_id path parameter is required");

      const result = await this.orderService.getOrderHistory(order_id);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  listCouriers = async (_req: Request, res: Response): Promise<void> => {
    const couriers = CourierRegistry.getSupportedPartners();
    res
      .status(200)
      .json({ success: true, data: { supported_couriers: couriers } });
  };

  // -- Validation helpers --

  private validateCreatePayload(body: Record<string, unknown>): void {
    const errors: string[] = [];

    if (!body.internal_order_id) errors.push("internal_order_id is required");
    if (!body.courier_partner) errors.push("courier_partner is required");
    if (!body.sender || typeof body.sender !== "object")
      errors.push("sender object is required");
    if (!body.recipient || typeof body.recipient !== "object")
      errors.push("recipient object is required");
    if (!body.package_details || typeof body.package_details !== "object")
      errors.push("package_details object is required");

    if (body.sender && typeof body.sender === "object") {
      const s = body.sender as Record<string, unknown>;
      if (!s.name) errors.push("sender.name is required");
      if (!s.phone) errors.push("sender.phone is required");
      if (!s.address_line_1) errors.push("sender.address_line_1 is required");
      if (!s.city) errors.push("sender.city is required");
      if (!s.state) errors.push("sender.state is required");
      if (!s.pincode) errors.push("sender.pincode is required");
    }

    if (body.recipient && typeof body.recipient === "object") {
      const r = body.recipient as Record<string, unknown>;
      if (!r.name) errors.push("recipient.name is required");
      if (!r.phone) errors.push("recipient.phone is required");
      if (!r.address_line_1)
        errors.push("recipient.address_line_1 is required");
      if (!r.city) errors.push("recipient.city is required");
      if (!r.state) errors.push("recipient.state is required");
      if (!r.pincode) errors.push("recipient.pincode is required");
    }

    if (body.package_details && typeof body.package_details === "object") {
      const p = body.package_details as Record<string, unknown>;
      if (
        !p.weight_kg ||
        typeof p.weight_kg !== "number" ||
        (p.weight_kg as number) <= 0
      ) {
        errors.push("package_details.weight_kg must be a positive number");
      }
    }

    if (errors.length > 0) {
      throw new ValidationError("Request validation failed", errors);
    }
  }
}
