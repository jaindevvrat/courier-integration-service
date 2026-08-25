# Architecture & Requirements Coverage

---

## Requirements Checklist

### Core (Required) ✅

| #   | Requirement                                          | Status  | Implementation                                                     |
| --- | ---------------------------------------------------- | ------- | ------------------------------------------------------------------ |
| 1   | Pluggable adapter architecture for multiple couriers | ✅ Done | `ICourierAdapter` interface + `CourierRegistry`                    |
| 2   | Unified REST API for create, track, cancel           | ✅ Done | `POST /orders`, `GET /orders/:id/track`, `POST /orders/:id/cancel` |
| 3   | Order persistence with full audit trail              | ✅ Done | `orders` + append-only `tracking_history` tables                   |
| 4   | At least one real courier adapter (UrbaneBolt)       | ✅ Done | `UrbaneBoltAdapter` with auth, retry, status normalization         |
| 5   | Bulk order creation with partial failure handling    | ✅ Done | `POST /orders/bulk` with `Promise.allSettled` + `p-limit`          |
| 6   | Idempotency on order creation                        | ✅ Done | Unique `internal_order_id` check with retry-on-failure             |
| 7   | Error handling with structured responses             | ✅ Done | `AppError` hierarchy + global error handler                        |
| 8   | Status normalization across couriers                 | ✅ Done | `ShipmentStatus` enum, per-adapter `normalizeStatus()`             |
| 9   | OpenAPI/Swagger documentation                        | ✅ Done | `swagger.yaml` + Swagger UI at `/api-docs`                         |
| 10  | Unit tests for adapter layer                         | ✅ Done | 20 passing tests (Mocha/Chai/Sinon)                                |

### Non-Functional (Required) ✅

| #   | Requirement                             | Status  | Implementation                                                        |
| --- | --------------------------------------- | ------- | --------------------------------------------------------------------- |
| 1   | Retry with exponential backoff          | ✅ Done | `withRetry()` — configurable max attempts, jitter                     |
| 2   | Auth token management with auto-refresh | ✅ Done | `withAuthRetry()` — catches 401, re-authenticates, retries            |
| 3   | Request tracing                         | ✅ Done | `X-Request-Id` middleware (honours client-supplied or generates UUID) |
| 4   | Structured logging                      | ✅ Done | Winston with JSON format, context per log entry                       |
| 5   | Clean separation of concerns            | ✅ Done | Controller → Service → Adapter layers                                 |

### Stretch / Future Enhancements 🔲

| #   | Enhancement                              | Status | How to add |
| --- | ---------------------------------------- | ------ | ---------- |
| 1   | Kafka/RabbitMQ for async bulk processing |
| 2   | Redis caching for tracking & auth tokens |

---

## High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT / FRONTEND                               │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │ HTTP (REST)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXPRESS APPLICATION                                  │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Helmet      │  │    CORS      │  │  Body Parser │  │  Request ID  │   │
│  │  (Security)   │  │  (Origins)   │  │   (JSON)     │  │  (Tracing)   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        CONTROLLER LAYER                                 │ │
│  │  OrderController: validate input, delegate to service, send response   │ │
│  └───────────────────────────────────┬────────────────────────────────────┘ │
│                                      │                                       │
│  ┌───────────────────────────────────▼────────────────────────────────────┐ │
│  │                        SERVICE LAYER                                    │ │
│  │  OrderService: orchestrate business logic, DB ops                      │ │
│  │  BulkOrderService: bounded concurrency with p-limit                    │ │
│  │                                                                         │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │ │
│  │  │                   COURIER REGISTRY                               │   │ │
│  │  │         resolve("urbanebolt") → UrbaneBoltAdapter                │   │ │
│  │  │         resolve("mock_courier") → MockCourierAdapter             │   │ │
│  │  │         resolve("delhivery") → DelhiveryAdapter (future)         │   │ │
│  │  └───────────────────────────┬─────────────────────────────────────┘   │ │
│  └──────────────────────────────┼─────────────────────────────────────────┘ │
│                                 │                                            │
│  ┌──────────────────────────────▼─────────────────────────────────────────┐ │
│  │                        ADAPTER LAYER                                    │ │
│  │                                                                         │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │ │
│  │  │  UrbaneBolt     │  │  MockCourier    │  │  [Future]       │       │ │
│  │  │  Adapter        │  │  Adapter        │  │  Adapter        │       │ │
│  │  │                 │  │                 │  │                 │       │ │
│  │  │ • authenticate  │  │ • authenticate  │  │ • authenticate  │       │ │
│  │  │ • createShipment│  │ • createShipment│  │ • createShipment│       │ │
│  │  │ • trackShipment │  │ • trackShipment │  │ • trackShipment │       │ │
│  │  │ • cancelShipment│  │ • cancelShipment│  │ • cancelShipment│       │ │
│  │  └────────┬────────┘  └─────────────────┘  └─────────────────┘       │ │
│  │           │                                                            │ │
│  │  ┌────────▼──────────────────────────────┐                            │ │
│  │  │  Cross-Cutting: withRetry + withAuth  │                            │ │
│  │  │  (exponential backoff, 401 refresh)   │                            │ │
│  │  └────────┬──────────────────────────────┘                            │ │
│  └───────────┼────────────────────────────────────────────────────────────┘ │
│              │                                                               │
│  ┌───────────▼──────────────┐    ┌────────────────────────────────────────┐ │
│  │    GLOBAL ERROR HANDLER  │    │           DATABASE LAYER               │ │
│  │  AppError → structured   │    │                                        │ │
│  │  JSON response           │    │  ┌─────────┐  ┌───────────────────┐   │ │
│  │  Unknown → opaque 500    │    │  │ orders  │  │ tracking_history  │   │ │
│  └──────────────────────────┘    │  └─────────┘  └───────────────────┘   │ │
│                                   │                                        │ │
│                                   │  SQLite (dev) / PostgreSQL (prod)      │ │
│                                   └────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ HTTPS (outgoing)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL COURIER APIs                                   │
│                                                                              │
│    UrbaneBolt API        Delhivery API        BlueDart API      ...         │
│    /api/customer/login   /api/v1/packages     /api/shipments                │
│    /api/customer/create  /api/v1/track        /api/track                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Design Patterns Used

| Pattern                   | Where                                             | Purpose                                              |
| ------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| **Adapter** (GoF)         | `src/adapters/*`                                  | Translate courier-specific APIs to unified interface |
| **Strategy**              | `ICourierAdapter` + Registry                      | Pick correct algorithm (courier) at runtime          |
| **Service Locator**       | `CourierRegistry`                                 | Decouple service from concrete adapters              |
| **Error Hierarchy**       | `AppError` subclasses                             | Type-safe error handling with HTTP status mapping    |
| **Composition Root**      | `index.ts bootstrap()`                            | Single place where all dependencies are wired        |
| **Anti-Corruption Layer** | Each adapter's `buildPayload` / `normalizeStatus` | Prevent external API shapes from leaking inward      |

## 3. Scaling with Kafka (Async Bulk Processing)

### Current: Synchronous (p-limit + Promise.allSettled)

```
Client POST /orders/bulk
       │
       ▼
┌─────────────────────┐
│  BulkOrderService   │
│                     │
│  p-limit(10)        │──→ courier API call 1
│  Promise.allSettled │──→ courier API call 2
│                     │──→ courier API call 3
│                     │──→ ...
└─────────────────────┘
       │
       ▼
  202 Response (all results inline)
```

**Pros:** Simple, immediate response, no infra.
**Cons:** Blocks HTTP connection, limited to ~100 orders, no retry on process crash.

### Proposed Enhancement: Kafka-Based Async Processing

```
Client POST /orders/bulk
       │
       ▼
┌─────────────────────┐        ┌─────────────────────────────────┐
│  API Server         │        │         KAFKA                    │
│                     │        │                                   │
│  1. Validate batch  │        │  Topic: order.create.requests    │
│  2. Produce N msgs  │───────▶│  ┌───┐ ┌───┐ ┌───┐ ┌───┐      │
│  3. Return batch_id │        │  │ 1 │ │ 2 │ │ 3 │ │...│      │
│     immediately     │        │  └───┘ └───┘ └───┘ └───┘      │
└─────────────────────┘        │  (partitioned by courier_partner)│
       │                        └──────────────┬──────────────────┘
       ▼                                       │
  202 { batch_id }                             ▼
                                ┌─────────────────────────────────┐
  Client polls:                 │     CONSUMER WORKERS (N pods)   │
  GET /orders/batch/:batch_id   │                                  │
                                │  • Consume message               │
                                │  • Call courier API               │
                                │  • Persist result to DB           │
                                │  • Publish to order.status topic  │
                                │  • On failure: retry or DLQ       │
                                └─────────────────────────────────┘
```

**When to adopt Kafka:**

- Batch sizes gets bigger , example customer base grows ( and kakfa can scale during sales etc , where more workers can process more orders simontaneously)
- Need guaranteed at-least-once delivery
- Multiple consumers scaling independently per courier
- Dead Letter Queue (DLQ) for poison messages
- Event-driven architecture (downstream services react to order events)

**Kafka Topics:**
| Topic | Purpose |
|-------|---------|
| `order.create.requests` | Incoming order creation jobs |
| `order.status.updates` | Status change events (consumed by notification service) |
| `order.dlq` | Failed messages after max retries |

---

## 4. Redis Integration (Caching & Token Store)

### 4.1 Auth Token Caching

Currently, each adapter stores tokens in-memory. Problem: if you have multiple server instances (horizontal scaling), each must authenticate independently.

```
┌────────────┐     ┌────────────┐     ┌────────────┐
│  Server 1  │     │  Server 2  │     │  Server 3  │
│  token: X  │     │  token: Y  │     │  token: Z  │
└────────────┘     └────────────┘     └────────────┘
  3 separate auth calls to courier ❌
```

**With Redis:**

```
┌────────────┐     ┌────────────┐     ┌────────────┐
│  Server 1  │     │  Server 2  │     │  Server 3  │
└─────┬──────┘     └─────┬──────┘     └─────┬──────┘
      │                   │                   │
      └───────────────────┼───────────────────┘
                          ▼
                 ┌─────────────────┐
                 │      REDIS      │
                 │                 │
                 │  urbanebolt:    │
                 │    token: "X"   │
                 │    ttl: 23h     │
                 │                 │
                 │  delhivery:     │
                 │    token: "Y"   │
                 │    ttl: 12h     │
                 └─────────────────┘
  1 auth call shared across all instances ✅
```

**Implementation:**

```typescript
// Token cache with Redis
async authenticate(): Promise<string> {
  const cached = await redis.get(`token:${this.partnerName}`);
  if (cached) return cached;

  const token = await this.callCourierAuthAPI();
  await redis.setex(`token:${this.partnerName}`, 82800, token); // 23h TTL
  return token;
}
```

### 4.2 Tracking Response Caching

Courier tracking APIs are rate-limited and tracking data changes infrequently (every few hours). Cache tracking responses for 5-10 minutes:

```typescript
async trackOrder(orderId: string) {
  const cacheKey = `tracking:${orderId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const result = await adapter.trackShipment(...);
  await redis.setex(cacheKey, 300, JSON.stringify(result)); // 5 min TTL
  return result;
}
```

**Benefits:**

- Reduces outbound API calls by 90%+ for frequently polled orders
- Avoids courier rate-limit bans
- Faster response times for end users

### 4.3 Idempotency Lock (Distributed)

With multiple instances, DB-level duplicate check has a race condition window. Redis provides atomic distributed locking:

```typescript
const lockKey = `lock:order:${dto.internal_order_id}`;
const acquired = await redis.set(lockKey, "1", "NX", "EX", 30);
if (!acquired) throw new DuplicateOrderError(dto.internal_order_id);
try {
  // ... create order
} finally {
  await redis.del(lockKey);
}
```

### 4.4 Redis Use Cases Summary

| Use Case            | Key Pattern                    | TTL  | Benefit                  |
| ------------------- | ------------------------------ | ---- | ------------------------ |
| Auth tokens         | `token:{partner}`              | 23h  | Shared across instances  |
| Tracking cache      | `tracking:{orderId}`           | 5min | Reduce courier API calls |
| Idempotency lock    | `lock:order:{id}`              | 30s  | Prevent race conditions  |
| Rate limit counters | `ratelimit:{partner}:{minute}` | 60s  | Prevent courier ban      |
| Batch status        | `batch:{batchId}`              | 1h   | Poll async bulk results  |

---
