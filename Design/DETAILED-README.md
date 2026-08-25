# Multi-Courier Integration Platform

Production-grade backend service providing a unified REST API for managing shipments across multiple courier partners. Built using Clean Architecture principles with pluggable courier adapters.

---

## Tech Stack

- **Runtime**: Node.js / TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with TypeORM / Used SQLite for dev testing , (use npm run dev and swagger to test)
- **Testing**: Mocha, Chai, Sinon
- **API Docs**: OpenAPI 3.0 / Swagger UI
- **Concurrency**: p-limit for bounded parallel processing , currently for bulk orders using Promises , we can switch to Kafka for better scalability
- **HTTP Resilience**: Axios with exponential backoff and jitter

---

## Project Structure

```
src/
  core/           Domain interfaces, DTOs, enums (zero external deps)
  adapters/       Courier partner implementations
  services/       Business logic
  controllers/    Express route handlers
  models/         TypeORM entities
  errors/         Error class hierarchy
  config/         Environment and data source config
  middleware/     Express middleware (error handler, request ID)
  utils/          Retry, HTTP client helpers
test/             Mocha/Sinon test suites
swagger.yaml      OpenAPI 3.0 specification
```

---

## Setup and Run

### Prerequisites

- Node.js >= 18
- PostgreSQL >= 14

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your database credentials and courier API keys
```

### 3. Start PostgreSQL (Docker)

```bash
docker-compose up -d
```

### 4. Run in development

```bash
npm run dev
```

Server starts at `http://localhost:3000`. Swagger UI at `http://localhost:3000/api-docs`.

### 5. Run tests

```bash
npm test
```

### 6. Build for production

```bash
npm run build
npm start
```

---

## Docker Commands

```bash
# Start PostgreSQL only
docker-compose up -d

# Stop all containers
docker-compose down

# Reset database (destroy volumes)
docker-compose down -v
```

---

## API Endpoints

| Method | Path                            | Description             |
| ------ | ------------------------------- | ----------------------- |
| GET    | /health                         | Health check            |
| POST   | /api/v1/orders                  | Create a single order   |
| GET    | /api/v1/orders/:order_id/track  | Track an order          |
| POST   | /api/v1/orders/:order_id/cancel | Cancel an order         |
| POST   | /api/v1/orders/bulk             | Create up to 100 orders |
| GET    | /api/v1/couriers                | List supported couriers |

---

## How to Add a New Courier in 4 Steps

### Step 1: Create the adapter file

Create `src/adapters/DelhiveryAdapter.ts`:

```typescript
import { ICourierAdapter } from "../core/ICourierAdapter";
import { UnifiedCreateOrderDTO, CourierShipmentResult, ... } from "../core/dtos";

export class DelhiveryAdapter implements ICourierAdapter {
  readonly partnerName = "delhivery";

  async authenticate(): Promise<string> { /* ... */ }
  async createShipment(order: UnifiedCreateOrderDTO): Promise<CourierShipmentResult> { /* ... */ }
  async trackShipment(tracking: UnifiedTrackDTO): Promise<CourierTrackingResult> { /* ... */ }
  async cancelShipment(orderId: string): Promise<CourierCancelResult> { /* ... */ }
}
```

### Step 2: Add configuration

In `src/config/env.ts`, add:

```typescript
delhivery: {
  baseUrl: process.env.DELHIVERY_BASE_URL || "",
  apiToken: process.env.DELHIVERY_API_TOKEN || "",
},
```

### Step 3: Register at startup

In `src/index.ts`, add:

```typescript
import { DelhiveryAdapter } from "./adapters/DelhiveryAdapter";
CourierRegistry.register(new DelhiveryAdapter());
```

### Step 4: Add env vars

In `.env`:

```
DELHIVERY_BASE_URL=https://api.delhivery.com
DELHIVERY_API_TOKEN=your_token
```

Done. Zero changes to controllers, services, routes, or tests.

---

## Sample cURL Commands

### Create Order (Mock Courier)

```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{
    "internal_order_id": "ORD-001",
    "courier_partner": "mock_courier",
    "payment_mode": "prepaid",
    "sender": {
      "name": "Warehouse Alpha",
      "phone": "9876543210",
      "address_line_1": "123 Industrial Zone",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400001"
    },
    "recipient": {
      "name": "Customer Beta",
      "phone": "9123456789",
      "address_line_1": "456 Residential Block",
      "city": "Delhi",
      "state": "Delhi",
      "pincode": "110001"
    },
    "package_details": {
      "weight_kg": 1.5,
      "length_cm": 20,
      "width_cm": 15,
      "height_cm": 10,
      "product_name": "Wireless Headphones",
      "product_value": 2499
    }
  }'
```

### Track Order

```bash
curl http://localhost:3000/api/v1/orders/ORD-001/track
```

### Cancel Order

```bash
curl -X POST http://localhost:3000/api/v1/orders/ORD-001/cancel
```

### Bulk Create Orders

```bash
curl -X POST http://localhost:3000/api/v1/orders/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "orders": [
      {
        "internal_order_id": "BULK-001",
        "courier_partner": "mock_courier",
        "payment_mode": "prepaid",
        "sender": { "name": "WH", "phone": "9999999999", "address_line_1": "A", "city": "Mumbai", "state": "MH", "pincode": "400001" },
        "recipient": { "name": "C1", "phone": "8888888888", "address_line_1": "B", "city": "Delhi", "state": "DL", "pincode": "110001" },
        "package_details": { "weight_kg": 1.0 }
      },
      {
        "internal_order_id": "BULK-002",
        "courier_partner": "mock_courier",
        "payment_mode": "cod",
        "collectable_amount": 500,
        "sender": { "name": "WH", "phone": "9999999999", "address_line_1": "A", "city": "Mumbai", "state": "MH", "pincode": "400001" },
        "recipient": { "name": "C2", "phone": "7777777777", "address_line_1": "C", "city": "Pune", "state": "MH", "pincode": "411001" },
        "package_details": { "weight_kg": 2.5 }
      }
    ]
  }'
```

### List Supported Couriers

```bash
curl http://localhost:3000/api/v1/couriers
```

### Health Check

```bash
curl http://localhost:3000/health
```

---

## Error Response Format

All errors follow this envelope:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": ["internal_order_id is required", "sender.phone is required"]
  }
}
```

Error codes: `VALIDATION_ERROR`, `UNKNOWN_COURIER_PARTNER`, `DUPLICATE_ORDER`, `ORDER_NOT_FOUND`, `COURIER_API_ERROR`, `COURIER_AUTH_FAILED`, `COURIER_TIMEOUT`, `BULK_LIMIT_EXCEEDED`, `CANCEL_NOT_ALLOWED`, `INTERNAL_SERVER_ERROR`

---

## Design Decisions

See [DESIGN.md](./DESIGN.md) for full architectural documentation and trade-off analysis.
