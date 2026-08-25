# DESIGN.md - Multi-Courier Integration Platform

## 1. Architectural Patterns

### 1.1 Adapter Pattern (Hexagonal Architecture Ports)

The core business logic interacts with courier partners exclusively through the `ICourierAdapter` interface. Each courier's integration lives in its own adapter class behind this boundary. The application layer never imports courier-specific code directly.

```
  [OrderService] --uses--> [ICourierAdapter (port)]
                                   |
                 +--------+--------+--------+
                 |                           |
        [UrbaneBoltAdapter]        [MockCourierAdapter]
        (implements port)          (implements port)
```

### 1.2 Factory/Registry Pattern

`CourierRegistry` is a static registry that maps partner name strings to adapter instances at startup. At runtime, the service layer calls `CourierRegistry.resolve(partnerName)` to obtain the correct adapter. This decouples route handlers from adapter selection logic entirely.

### 1.3 Clean Architecture Layering

```
/src/core         - Interfaces, DTOs, enums (no dependencies on frameworks)
/src/adapters     - Courier partner implementations (depend on core)
/src/services     - Business logic (depend on core, adapters, models)
/src/controllers  - HTTP handlers (depend on services)
/src/models       - TypeORM entities (depend on core enums)
/src/errors       - Error hierarchy (standalone)
/src/middleware   - Express middleware (depend on errors)
/src/config       - Environment and database configuration
/src/utils        - Cross-cutting utilities (retry, HTTP client)
```

Dependencies flow inward. The domain layer (`core`) has zero external dependencies.

---

## 2. Database Schema

### 2.1 `orders` Table

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| internal_order_id | VARCHAR(255), UNIQUE | Client-supplied identifier for idempotency |
| courier_partner | VARCHAR(100), INDEXED | Which adapter processed this order |
| courier_shipment_id | VARCHAR, nullable | ID returned by the courier API |
| awb_number | VARCHAR, nullable | Tracking/AWB number from courier |
| status | ENUM, INDEXED | Normalized shipment status |
| sender_* | Various | Sender address fields |
| recipient_* | Various | Recipient address fields |
| weight_kg | DECIMAL(8,3) | Package weight |
| payment_mode | VARCHAR(20) | prepaid or cod |
| raw_request_payload | JSONB | Full request sent to courier |
| raw_response_payload | JSONB | Full response received from courier |
| created_at | TIMESTAMP | Auto-set |
| updated_at | TIMESTAMP | Auto-updated |

### 2.2 `tracking_history` Table (Append-Only)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| order_id | UUID FK, INDEXED | References orders.id |
| status | ENUM | Status at this tracking event |
| description | TEXT | Human-readable event description |
| location | VARCHAR, nullable | City/hub where event occurred |
| raw_payload | JSONB | Full raw response at this snapshot |
| created_at | TIMESTAMP | When this event was recorded |

### 2.3 Indexing Strategy

- `internal_order_id` (unique): Fast duplicate detection during order creation
- `courier_partner`: Enables partner-scoped queries and analytics
- `status`: Supports operational dashboards and retry workflows
- `tracking_history.order_id`: Efficient join for full order timeline

---

## 3. Trade-Off Analysis

### 3.1 Synchronous Bounded Concurrency vs. Async Message Queue

| Dimension | Bounded Concurrency (chosen) | Message Queue (BullMQ/Kafka) |
|-----------|------------------------------|------------------------------|
| Complexity | Low: single process, p-limit | High: Redis/Kafka infra, worker processes |
| Latency | Immediate result in HTTP response | Client must poll or subscribe |
| Partial success reporting | Inline per-item results | Requires separate batch status endpoint |
| Scalability ceiling | ~100 orders/batch (sufficient for spec) | Thousands+ per second |
| Failure isolation | Process crash loses in-flight items | Queue guarantees at-least-once |

**Decision**: For the stated requirement of 100 orders per batch, synchronous processing with p-limit provides the simplest architecture while remaining performant. A queue-based approach would be warranted at >500 orders/batch or under strict SLA guarantees requiring exactly-once semantics.

### 3.2 Append-Only Event History vs. In-Place Status Mutation

| Dimension | Append-Only (chosen) | In-Place Mutation |
|-----------|---------------------|-------------------|
| Audit trail | Complete history preserved | Only latest state visible |
| Storage cost | Higher (one row per event) | Fixed per order |
| Query complexity | Slightly higher for "current status" | Simple |
| Data recovery | Can reconstruct any point in time | Cannot |
| Analytics | Rich event-stream analytics | Limited |

**Decision**: Logistics platforms require full audit trails for dispute resolution, SLA compliance, and regulatory reasons. Append-only is standard practice and the storage overhead is negligible for the expected data volumes.

### 3.3 Monolithic Adapter Registry vs. Courier Microservices

| Dimension | Monolithic Registry (chosen) | Microservices per courier |
|-----------|------------------------------|---------------------------|
| Deployment | Single artifact | N services to deploy |
| Latency | In-process adapter call | Network hop per courier call |
| Isolation | Shared memory/process | Full fault isolation |
| Development velocity | Fast iteration, shared types | Independent teams |
| Operational overhead | Low | High (N monitoring/logging stacks) |

**Decision**: For 2-5 courier partners, a monolithic registry is the right starting point. The adapter interface is the seam where decomposition can occur later without changing the service layer contract.

---

## 4. Error Handling Strategy

```
Layer 1: Input validation (controller) --> 400 with field details
Layer 2: Registry resolution failure   --> 400 with supported list
Layer 3: Idempotency violation          --> 409 Conflict
Layer 4: Courier HTTP 4xx               --> 502 normalized error
Layer 5: Courier HTTP 5xx / timeout     --> Retry with exponential backoff
Layer 6: Auth token 401                 --> Clear token, re-authenticate, retry once
Layer 7: Unhandled exceptions           --> 500 opaque error (never leaks internals)
```

No courier-specific error bodies are ever exposed to the API consumer. The raw payloads are persisted to the database for internal debugging only.

---

## 5. Extension Guide

Adding a new courier partner requires touching exactly these files:

1. `src/adapters/NewCourierAdapter.ts` -- implement `ICourierAdapter`
2. `src/config/env.ts` -- add configuration keys
3. `src/index.ts` -- register the adapter at bootstrap
4. `.env` / `.env.example` -- add credentials

Zero changes to controllers, services, DTOs, error handling, or database schema.
