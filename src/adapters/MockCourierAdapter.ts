import { v4 as uuidv4 } from "uuid";
import { ICourierAdapter } from "../core/ICourierAdapter";
import {
  UnifiedCreateOrderDTO,
  UnifiedTrackDTO,
  CourierShipmentResult,
  CourierTrackingResult,
  CourierCancelResult,
  TrackingEvent,
} from "../core/dtos";
import { ShipmentStatus } from "../core/enums";
import { logger } from "../config/logger";

/**
 * Mock courier adapter used for development, testing, and
 * demonstrating the plug-in architecture. It simulates all
 * operations with deterministic delays and predictable responses.
 */
export class MockCourierAdapter implements ICourierAdapter {
  readonly partnerName = "mock_courier";

  async authenticate(): Promise<string> {
    logger.debug("MockCourier: authenticate called (no-op)");
    return "mock-token-" + Date.now();
  }

  async createShipment(
    order: UnifiedCreateOrderDTO,
  ): Promise<CourierShipmentResult> {
    await this.simulateLatency();

    const shipmentId = `MOCK-${uuidv4().substring(0, 8).toUpperCase()}`;
    const awb = `MAWB${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100)}`;

    const rawRequest = {
      reference: order.internal_order_id,
      sender: order.sender,
      recipient: order.recipient,
      package: order.package_details,
    };

    const rawResponse = {
      success: true,
      shipment_id: shipmentId,
      awb_number: awb,
      status: "created",
      estimated_delivery: new Date(Date.now() + 5 * 86400000).toISOString(),
    };

    logger.info("MockCourier: shipment created", { shipmentId, awb });

    return {
      courier_shipment_id: shipmentId,
      awb_number: awb,
      raw_request: rawRequest,
      raw_response: rawResponse,
    };
  }

  async trackShipment(
    _tracking: UnifiedTrackDTO,
  ): Promise<CourierTrackingResult> {
    await this.simulateLatency();

    const now = Date.now();
    const events: TrackingEvent[] = [
      {
        status: ShipmentStatus.CREATED,
        description: "Order created and manifest generated",
        location: "Origin Hub",
        timestamp: new Date(now - 3 * 86400000).toISOString(),
      },
      {
        status: ShipmentStatus.PICKED_UP,
        description: "Package picked up from sender",
        location: "Origin Hub",
        timestamp: new Date(now - 2 * 86400000).toISOString(),
      },
      {
        status: ShipmentStatus.IN_TRANSIT,
        description: "Package in transit to destination city",
        location: "Sorting Facility",
        timestamp: new Date(now - 1 * 86400000).toISOString(),
      },
    ];

    return {
      current_status: ShipmentStatus.IN_TRANSIT,
      events,
      raw_response: { success: true, tracking: events },
    };
  }

  async cancelShipment(_orderId: string): Promise<CourierCancelResult> {
    await this.simulateLatency();

    return {
      success: true,
      message: "Shipment cancelled successfully",
      raw_response: { success: true, status: "cancelled" },
    };
  }

  private simulateLatency(): Promise<void> {
    const ms = 100 + Math.floor(Math.random() * 200);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
