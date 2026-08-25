import { Repository } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { OrderEntity } from "../models/Order.entity";
import { TrackingHistoryEntity } from "../models/TrackingHistory.entity";
import { CourierRegistry } from "../core/CourierRegistry";
import { UnifiedCreateOrderDTO } from "../core/dtos";
import { ShipmentStatus } from "../core/enums";
import { logger } from "../config/logger";
import {
  AppError,
  CourierNotFoundError,
  DuplicateOrderError,
  OrderNotFoundError,
  CourierApiError,
} from "../errors/AppError";

export class OrderService {
  private orderRepo: Repository<OrderEntity>;
  private trackingRepo: Repository<TrackingHistoryEntity>;

  constructor() {
    this.orderRepo = AppDataSource.getRepository(OrderEntity);
    this.trackingRepo = AppDataSource.getRepository(TrackingHistoryEntity);
  }

  async createOrder(dto: UnifiedCreateOrderDTO) {
    // Resolve the adapter; fails fast if partner is unknown
    const adapter = CourierRegistry.resolve(dto.courier_partner);
    if (!adapter) {
      throw new CourierNotFoundError(
        dto.courier_partner,
        CourierRegistry.getSupportedPartners(),
      );
    }

    // Idempotency: reject if the internal_order_id is already persisted
    // Exception: allow retrying if the previous attempt FAILED
    const existing = await this.orderRepo.findOneBy({
      internalOrderId: dto.internal_order_id,
    });
    if (existing) {
      if (existing.status === ShipmentStatus.FAILED) {
        // Clean up the failed attempt so it can be retried
        await this.trackingRepo.delete({ orderId: existing.id });
        await this.orderRepo.remove(existing);
      } else {
        throw new DuplicateOrderError(dto.internal_order_id);
      }
    }

    // Persist the order shell before calling the courier
    const order = this.orderRepo.create({
      internalOrderId: dto.internal_order_id,
      courierPartner: dto.courier_partner,
      status: ShipmentStatus.CREATED,
      senderName: dto.sender.name,
      senderPhone: dto.sender.phone,
      senderAddress: dto.sender.address_line_1,
      senderCity: dto.sender.city,
      senderState: dto.sender.state,
      senderPincode: dto.sender.pincode,
      recipientName: dto.recipient.name,
      recipientPhone: dto.recipient.phone,
      recipientAddress: dto.recipient.address_line_1,
      recipientCity: dto.recipient.city,
      recipientState: dto.recipient.state,
      recipientPincode: dto.recipient.pincode,
      weightKg: dto.package_details.weight_kg,
      paymentMode: dto.payment_mode,
    });
    await this.orderRepo.save(order);

    try {
      const result = await adapter.createShipment(dto);

      // Enrich order with courier response details
      order.courierShipmentId = result.courier_shipment_id;
      order.awbNumber = result.awb_number;
      order.rawRequestPayload = result.raw_request;
      order.rawResponsePayload = result.raw_response;
      await this.orderRepo.save(order);

      // Append initial tracking entry
      await this.appendTracking(
        order.id,
        ShipmentStatus.CREATED,
        "Order created with courier",
        result.raw_response,
      );

      logger.info("Order created successfully", {
        orderId: dto.internal_order_id,
        courierPartner: dto.courier_partner,
        awb: result.awb_number,
      });

      return {
        internal_order_id: dto.internal_order_id,
        courier_partner: dto.courier_partner,
        courier_shipment_id: result.courier_shipment_id,
        awb_number: result.awb_number,
        status: ShipmentStatus.CREATED,
      };
    } catch (error: unknown) {
      // Mark order as failed and persist the failure for reconciliation
      order.status = ShipmentStatus.FAILED;
      await this.orderRepo.save(order);
      await this.appendTracking(
        order.id,
        ShipmentStatus.FAILED,
        error instanceof Error ? error.message : "Unknown failure",
        null,
      );

      logger.error("Order creation failed at courier", {
        orderId: dto.internal_order_id,
        partner: dto.courier_partner,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (error instanceof AppError) throw error;
      throw new CourierApiError(
        `Order creation failed with ${dto.courier_partner}: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  async trackOrder(internalOrderId: string) {
    const order = await this.orderRepo.findOne({
      where: { internalOrderId },
      relations: ["trackingHistory"],
    });

    if (!order) throw new OrderNotFoundError(internalOrderId);

    // If courier details are not yet available, return stored state only
    if (!order.awbNumber && !order.courierShipmentId) {
      return this.buildTrackingResponse(order);
    }

    const adapter = CourierRegistry.resolve(order.courierPartner);
    if (!adapter) {
      return this.buildTrackingResponse(order);
    }

    try {
      const result = await adapter.trackShipment({
        awb_number: order.awbNumber || undefined,
        courier_shipment_id: order.courierShipmentId || undefined,
      });

      // Update order status if it has changed
      const newStatus = result.current_status as ShipmentStatus;
      if (newStatus && newStatus !== order.status) {
        order.status = newStatus;
        await this.orderRepo.save(order);
      }

      // Append all tracking events from the courier response
      for (const event of result.events) {
        await this.appendTracking(
          order.id,
          event.status as ShipmentStatus,
          event.description,
          result.raw_response,
          event.location || null,
        );
      }

      return {
        internal_order_id: internalOrderId,
        courier_partner: order.courierPartner,
        awb_number: order.awbNumber,
        current_status: newStatus || order.status,
        tracking_events: result.events,
      };
    } catch (error: unknown) {
      logger.error("Tracking request failed", {
        orderId: internalOrderId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Graceful degradation: return what we have stored
      return this.buildTrackingResponse(order);
    }
  }

  async cancelOrder(internalOrderId: string) {
    const order = await this.orderRepo.findOneBy({ internalOrderId });
    if (!order) throw new OrderNotFoundError(internalOrderId);

    if (order.status === ShipmentStatus.CANCELLED) {
      return {
        internal_order_id: internalOrderId,
        status: ShipmentStatus.CANCELLED,
        message: "Already cancelled",
      };
    }
    if (order.status === ShipmentStatus.DELIVERED) {
      throw new AppError(
        "CANCEL_NOT_ALLOWED",
        "Cannot cancel a delivered order",
        400,
      );
    }

    const adapter = CourierRegistry.resolve(order.courierPartner);
    if (!adapter) {
      throw new CourierNotFoundError(
        order.courierPartner,
        CourierRegistry.getSupportedPartners(),
      );
    }

    const result = await adapter.cancelShipment(
      order.courierShipmentId || order.internalOrderId,
    );

    if (result.success) {
      order.status = ShipmentStatus.CANCELLED;
      await this.orderRepo.save(order);
      await this.appendTracking(
        order.id,
        ShipmentStatus.CANCELLED,
        result.message,
        result.raw_response,
      );
    }

    return {
      internal_order_id: internalOrderId,
      courier_partner: order.courierPartner,
      status: result.success ? ShipmentStatus.CANCELLED : order.status,
      message: result.message,
    };
  }

  async getOrderHistory(internalOrderId: string) {
    const order = await this.orderRepo.findOne({
      where: { internalOrderId },
      relations: ["trackingHistory"],
    });

    if (!order) {
      throw new OrderNotFoundError(internalOrderId);
    }

    const history = (order.trackingHistory || [])
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((h) => ({
        id: h.id,
        status: h.status,
        description: h.description,
        location: h.location,
        raw_payload: h.rawPayload,
        timestamp: h.createdAt.toISOString(),
      }));

    return {
      internal_order_id: order.internalOrderId,
      courier_partner: order.courierPartner,
      courier_shipment_id: order.courierShipmentId,
      awb_number: order.awbNumber,
      current_status: order.status,
      raw_request_payload: order.rawRequestPayload,
      raw_response_payload: order.rawResponsePayload,
      created_at: order.createdAt.toISOString(),
      updated_at: order.updatedAt.toISOString(),
      tracking_history: history,
    };
  }

  // -- Helpers --

  private async appendTracking(
    orderId: string,
    status: ShipmentStatus,
    description: string,
    rawPayload: Record<string, unknown> | null,
    location?: string | null,
  ): Promise<void> {
    const entry = this.trackingRepo.create({
      orderId,
      status,
      description,
      location: location || null,
      rawPayload,
    });
    await this.trackingRepo.save(entry);
  }

  private buildTrackingResponse(order: OrderEntity) {
    return {
      internal_order_id: order.internalOrderId,
      courier_partner: order.courierPartner,
      awb_number: order.awbNumber,
      current_status: order.status,
      tracking_events: (order.trackingHistory || []).map((h) => ({
        status: h.status,
        description: h.description,
        location: h.location,
        timestamp: h.createdAt.toISOString(),
      })),
    };
  }
}
