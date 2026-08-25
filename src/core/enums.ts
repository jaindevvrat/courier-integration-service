/**
 * Normalized shipment statuses shared across the entire platform.
 * Courier-specific statuses must be mapped to one of these values
 * inside each adapter's transformation logic.
 */
export enum ShipmentStatus {
  CREATED = "CREATED",
  PICKED_UP = "PICKED_UP",
  IN_TRANSIT = "IN_TRANSIT",
  OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY",
  DELIVERED = "DELIVERED",
  CANCELLED = "CANCELLED",
  FAILED = "FAILED",
  RTO = "RTO",
}
