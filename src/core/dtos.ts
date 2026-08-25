/**
 * Unified DTOs that cross the boundary between the application layer
 * and the courier adapter layer. These are completely courier-agnostic;
 * no courier-specific fields should ever appear here.
 */

// -- Request DTOs --

export interface AddressDTO {
  name: string;
  phone: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
}

export interface PackageDTO {
  weight_kg: number;
  length_cm?: number;
  width_cm?: number;
  height_cm?: number;
  product_name?: string;
  product_value?: number;
  quantity?: number;
}

export interface UnifiedCreateOrderDTO {
  internal_order_id: string;
  courier_partner: string;
  payment_mode: "prepaid" | "cod";
  collectable_amount?: number;
  sender: AddressDTO;
  recipient: AddressDTO;
  package_details: PackageDTO;
}

export interface UnifiedTrackDTO {
  awb_number?: string;
  courier_shipment_id?: string;
}

export interface BulkCreateOrderDTO {
  orders: UnifiedCreateOrderDTO[];
}

// -- Response DTOs (returned by adapters) --

export interface CourierShipmentResult {
  courier_shipment_id: string;
  awb_number: string;
  /** Raw request payload sent to the courier (for audit logging). */
  raw_request: Record<string, unknown>;
  /** Raw response payload received from the courier. */
  raw_response: Record<string, unknown>;
}

export interface TrackingEvent {
  status: string;
  description: string;
  location?: string;
  timestamp: string;
  courier_raw_status?: string;
}

export interface CourierTrackingResult {
  current_status: string;
  events: TrackingEvent[];
  raw_response: Record<string, unknown>;
}

export interface CourierCancelResult {
  success: boolean;
  message: string;
  raw_response: Record<string, unknown>;
}

// -- Unified API Response shapes --

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

export interface BulkOrderItemResult {
  internal_order_id: string;
  success: boolean;
  courier_shipment_id?: string;
  awb_number?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface BulkOrderResponse {
  batch_id: string;
  total: number;
  success_count: number;
  failure_count: number;
  results: BulkOrderItemResult[];
}
