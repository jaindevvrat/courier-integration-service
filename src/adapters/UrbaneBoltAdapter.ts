import { AxiosInstance, AxiosError } from "axios";
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
import { env } from "../config/env";
import { logger } from "../config/logger";
import { createHttpClient, isAuthError } from "../utils/http-client";
import { withRetry } from "../utils/retry";
import { CourierApiError, CourierAuthError } from "../errors/AppError";

/**
 * Adapter for UrbaneBolt logistics courier API.
 *
 * Handles authentication token management with automatic refresh,
 * request/response mapping to the UrbaneBolt-specific format, and
 * status normalization into the platform's unified status enum.
 */
export class UrbaneBoltAdapter implements ICourierAdapter {
  readonly partnerName = "urbanebolt";

  private client: AxiosInstance;
  private token: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor() {
    this.client = createHttpClient(env.urbanebolt.baseUrl, 30000);
  }

  async authenticate(): Promise<string> {
    try {
      const response = await this.client.post("/api/customer/login", {
        username: env.urbanebolt.username,
        password: env.urbanebolt.password,
        api_key: env.urbanebolt.apiKey,
      });

      const token = response.data?.token || response.data?.data?.token;
      if (!token) {
        throw new CourierAuthError("urbanebolt");
      }

      this.token = token;
      // Assume token validity of 23 hours to be conservative
      this.tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000;
      this.client.defaults.headers.common["Authorization"] = `Bearer ${token}`;

      logger.info("UrbaneBolt authentication successful");
      return token;
    } catch (error: unknown) {
      if (error instanceof CourierAuthError) throw error;
      logger.error("UrbaneBolt authentication failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new CourierAuthError("urbanebolt");
    }
  }

  /**
   * Ensures a valid token exists. If the token is expired or missing,
   * triggers a fresh authentication before proceeding.
   */
  private async ensureAuth(): Promise<void> {
    if (!this.token || Date.now() >= this.tokenExpiresAt) {
      await this.authenticate();
    }
  }

  /**
   * Wraps a request with auth-retry logic: if the first attempt fails
   * with a 401, clears the token, re-authenticates, and retries once.
   */
  private async withAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureAuth();
    try {
      return await fn();
    } catch (error: unknown) {
      if (isAuthError(error)) {
        logger.warn("UrbaneBolt token rejected, re-authenticating");
        this.token = null;
        await this.ensureAuth();
        return await fn();
      }
      throw error;
    }
  }

  async createShipment(
    order: UnifiedCreateOrderDTO,
  ): Promise<CourierShipmentResult> {
    const payload = this.buildCreatePayload(order);

    const data = await withRetry(
      () =>
        this.withAuthRetry(async () => {
          const res = await this.client.post(
            "/api/customer/create-order",
            payload,
          );
          return res.data;
        }),
      {
        operation: "createShipment",
        orderId: order.internal_order_id,
        partner: this.partnerName,
      },
    );

    const courierShipmentId =
      data?.order_id || data?.data?.order_id || data?.id || "";
    const awbNumber =
      data?.awb_number || data?.data?.awb_number || data?.tracking_id || "";

    //Can have error as per what we need to show the customer (if this is final service returning error)
    //Or UI can have more user friendly error.
    if (!courierShipmentId && !awbNumber) {
      throw new CourierApiError(
        "UrbaneBolt did not return a shipment ID or AWB number in the response",
      );
    }

    return {
      courier_shipment_id: String(courierShipmentId),
      awb_number: String(awbNumber),
      raw_request: payload,
      raw_response: data,
    };
  }

  async trackShipment(
    tracking: UnifiedTrackDTO,
  ): Promise<CourierTrackingResult> {
    const data = await withRetry(
      () =>
        this.withAuthRetry(async () => {
          const res = await this.client.get("/api/customer/track-order", {
            params: {
              awb_number: tracking.awb_number,
              order_id: tracking.courier_shipment_id,
            },
          });
          return res.data;
        }),
      { operation: "trackShipment", partner: this.partnerName },
    );

    const events = this.parseTrackingEvents(data);
    const currentStatus =
      events.length > 0
        ? events[events.length - 1].status
        : ShipmentStatus.CREATED;

    return {
      current_status: currentStatus,
      events,
      raw_response: data,
    };
  }

  async cancelShipment(orderId: string): Promise<CourierCancelResult> {
    const payload = { order_id: orderId };

    const data = await withRetry(
      () =>
        this.withAuthRetry(async () => {
          const res = await this.client.post(
            "/api/customer/cancel-order",
            payload,
          );
          return res.data;
        }),
      { operation: "cancelShipment", orderId, partner: this.partnerName },
    );

    const success = data?.success !== false && data?.status !== "failed";
    return {
      success,
      message:
        data?.message ||
        (success ? "Cancellation successful" : "Cancellation failed"),
      raw_response: data,
    };
  }

  // -- Private helpers --

  private buildCreatePayload(
    order: UnifiedCreateOrderDTO,
  ): Record<string, unknown> {
    return {
      order_id: order.internal_order_id,
      payment_mode: order.payment_mode,
      collectable_amount: order.collectable_amount || 0,
      sender: {
        name: order.sender.name,
        phone: order.sender.phone,
        address: order.sender.address_line_1,
        city: order.sender.city,
        state: order.sender.state,
        pincode: order.sender.pincode,
      },
      recipient: {
        name: order.recipient.name,
        phone: order.recipient.phone,
        address: order.recipient.address_line_1,
        city: order.recipient.city,
        state: order.recipient.state,
        pincode: order.recipient.pincode,
      },
      package_details: {
        weight: order.package_details.weight_kg,
        length: order.package_details.length_cm || 10,
        width: order.package_details.width_cm || 10,
        height: order.package_details.height_cm || 10,
        product_name: order.package_details.product_name || "Package",
        product_value: order.package_details.product_value || 0,
      },
    };
  }

  private parseTrackingEvents(response: unknown): TrackingEvent[] {
    const data = response as Record<string, unknown>;
    const history = (data?.tracking_history || data?.data || []) as Array<
      Record<string, unknown>
    >;

    if (!Array.isArray(history)) return [];

    return history.map((event) => ({
      status: this.normalizeStatus(String(event.status || "")),
      description: String(event.description || event.message || ""),
      location: event.location ? String(event.location) : undefined,
      timestamp: String(
        event.timestamp || event.created_at || new Date().toISOString(),
      ),
      courier_raw_status: String(event.status || ""),
    }));
  }

  private normalizeStatus(courierStatus: string): string {
    const map: Record<string, ShipmentStatus> = {
      created: ShipmentStatus.CREATED,
      pending: ShipmentStatus.CREATED,
      picked_up: ShipmentStatus.PICKED_UP,
      pickup_done: ShipmentStatus.PICKED_UP,
      in_transit: ShipmentStatus.IN_TRANSIT,
      shipped: ShipmentStatus.IN_TRANSIT,
      out_for_delivery: ShipmentStatus.OUT_FOR_DELIVERY,
      ofd: ShipmentStatus.OUT_FOR_DELIVERY,
      delivered: ShipmentStatus.DELIVERED,
      cancelled: ShipmentStatus.CANCELLED,
      canceled: ShipmentStatus.CANCELLED,
      rto: ShipmentStatus.RTO,
      failed: ShipmentStatus.FAILED,
    };
    return map[courierStatus.toLowerCase()] || ShipmentStatus.IN_TRANSIT;
  }
}
