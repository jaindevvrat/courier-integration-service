import pLimit from "p-limit";
import { v4 as uuidv4 } from "uuid";
import { OrderService } from "./OrderService";
import { UnifiedCreateOrderDTO, BulkOrderItemResult, BulkOrderResponse } from "../core/dtos";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { AppError, BulkLimitExceededError } from "../errors/AppError";

/**
 * Handles bulk order creation with bounded concurrency.
 *
 * Uses p-limit to cap the number of in-flight courier calls,
 * preventing socket starvation and upstream rate-limit violations.
 * Each order is processed independently so partial failures do not
 * abort the entire batch.
 */
export class BulkOrderService {
  private orderService: OrderService;

  constructor() {
    this.orderService = new OrderService();
  }

  async processBulk(orders: UnifiedCreateOrderDTO[]): Promise<BulkOrderResponse> {
    if (orders.length > env.bulk.maxBatchSize) {
      throw new BulkLimitExceededError(env.bulk.maxBatchSize);
    }

    const batchId = uuidv4();
    const limit = pLimit(env.bulk.concurrencyLimit);

    logger.info("Starting bulk order processing", {
      batchId,
      totalOrders: orders.length,
      concurrency: env.bulk.concurrencyLimit,
    });

    // Launch all orders with bounded concurrency; each settles independently
    const promises = orders.map((order) =>
      limit(() => this.processOneOrder(order))
    );

    const settled = await Promise.allSettled(promises);

    const results: BulkOrderItemResult[] = settled.map((outcome, idx) => {
      const orderId = orders[idx].internal_order_id;

      if (outcome.status === "fulfilled") {
        return outcome.value;
      }

      // Rejected: extract error information without leaking internals
      const reason = outcome.reason;
      return {
        internal_order_id: orderId,
        success: false,
        error: {
          code: reason instanceof AppError ? reason.code : "ORDER_CREATION_FAILED",
          message: reason instanceof Error ? reason.message : "Unknown error",
        },
      };
    });

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    logger.info("Bulk order processing complete", { batchId, successCount, failureCount });

    return {
      batch_id: batchId,
      total: orders.length,
      success_count: successCount,
      failure_count: failureCount,
      results,
    };
  }

  private async processOneOrder(order: UnifiedCreateOrderDTO): Promise<BulkOrderItemResult> {
    try {
      const result = await this.orderService.createOrder(order);
      return {
        internal_order_id: order.internal_order_id,
        success: true,
        courier_shipment_id: result.courier_shipment_id,
        awb_number: result.awb_number,
      };
    } catch (error: unknown) {
      const appErr = error as AppError;
      return {
        internal_order_id: order.internal_order_id,
        success: false,
        error: {
          code: appErr?.code || "ORDER_CREATION_FAILED",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }
}
