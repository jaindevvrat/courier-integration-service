/**
 * Core port interface for all courier integrations.
 *
 * Every courier partner adapter must implement this contract without
 * exception. The rest of the application interacts exclusively through
 * this boundary, ensuring that adding a new courier never ripples
 * into business logic, controllers, or persistence layers.
 */

import {
  UnifiedCreateOrderDTO,
  UnifiedTrackDTO,
  CourierShipmentResult,
  CourierTrackingResult,
  CourierCancelResult,
} from "./dtos";

export interface ICourierAdapter {
  /** Unique identifier for this courier (lowercase, snake_case). */
  readonly partnerName: string;

  /**
   * Authenticate with the courier and return a bearer token or session
   * identifier. Implementations must handle token caching internally
   * so that repeated calls do not trigger redundant network roundtrips.
   */
  authenticate(): Promise<string>;

  /**
   * Submit a new shipment to the courier. The caller passes a normalized
   * order DTO; the adapter is responsible for transforming it into the
   * courier-specific payload format.
   */
  createShipment(order: UnifiedCreateOrderDTO): Promise<CourierShipmentResult>;

  /**
   * Retrieve tracking information for an existing shipment.
   */
  trackShipment(tracking: UnifiedTrackDTO): Promise<CourierTrackingResult>;

  /**
   * Request cancellation of an active shipment.
   */
  cancelShipment(orderId: string): Promise<CourierCancelResult>;
}
