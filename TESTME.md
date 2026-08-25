# API Testing Guide

Start the dev server first:

```bash
npm run dev
```

---

## 1. Create Order (Mock Courier)

```bash
curl -X POST 'http://localhost:3000/api/v1/orders' \
  -H 'Content-Type: application/json' \
  -d '{
  "internal_order_id": "ORD-100",
  "courier_partner": "mock_courier",
  "payment_mode": "prepaid",
  "sender": {
    "name": "Dev Store",
    "phone": "9876543210",
    "address_line_1": "113 Main Street",
    "city": "Ujjain",
    "state": "MP",
    "pincode": "457950"
  },
  "recipient": {
    "name": "Customer One",
    "phone": "9123456780",
    "address_line_1": "45 Park Road",
    "city": "Pune",
    "state": "MH",
    "pincode": "411001"
  },
  "package_details": {
    "weight_kg": 2.5,
    "product_name": "Shoes",
    "product_value": 1500
  }
}'
```

**Expected:** `201` with `courier_shipment_id` and `awb_number`

---

## 2. Track Order

```bash
curl http://localhost:3000/api/v1/orders/ORD-100/track
```

**Expected:** `200` with `current_status`, `tracking_events` array

---

## 3. Cancel Order

```bash
curl -X POST http://localhost:3000/api/v1/orders/ORD-100/cancel
```

**Expected:** `200` with `status: "CANCELLED"`

---

## 4. Bulk Create Orders

```bash
curl -X POST 'http://localhost:3000/api/v1/orders/bulk' \
  -H 'Content-Type: application/json' \
  -d '{
  "orders": [
    {
      "internal_order_id": "BULK-001",
      "courier_partner": "mock_courier",
      "payment_mode": "prepaid",
      "sender": {
        "name": "Dev Store",
        "phone": "9876543210",
        "address_line_1": "113 Main St",
        "city": "Ujjain",
        "state": "MP",
        "pincode": "457950"
      },
      "recipient": {
        "name": "Customer A",
        "phone": "9123456780",
        "address_line_1": "45 Park Road",
        "city": "Pune",
        "state": "MH",
        "pincode": "411001"
      },
      "package_details": { "weight_kg": 2.5 }
    },
    {
      "internal_order_id": "BULK-002",
      "courier_partner": "mock_courier",
      "payment_mode": "cod",
      "collectable_amount": 599,
      "sender": {
        "name": "Dev Store",
        "phone": "9876543210",
        "address_line_1": "113 Main St",
        "city": "Ujjain",
        "state": "MP",
        "pincode": "457950"
      },
      "recipient": {
        "name": "Customer B",
        "phone": "9988776655",
        "address_line_1": "12 MG Road",
        "city": "Delhi",
        "state": "DL",
        "pincode": "110001"
      },
      "package_details": { "weight_kg": 1.2 }
    },
    {
      "internal_order_id": "BULK-003",
      "courier_partner": "mock_courier",
      "payment_mode": "prepaid",
      "sender": {
        "name": "Dev Store",
        "phone": "9876543210",
        "address_line_1": "113 Main St",
        "city": "Ujjain",
        "state": "MP",
        "pincode": "457950"
      },
      "recipient": {
        "name": "Customer C",
        "phone": "8877665544",
        "address_line_1": "78 Lake View",
        "city": "Bangalore",
        "state": "KA",
        "pincode": "560001"
      },
      "package_details": { "weight_kg": 5, "product_name": "Laptop Stand", "product_value": 1299 }
    }
  ]
}'
```

**Expected:** `202` with `batch_id`, `success_count: 3`, per-order results

---

## 5. List Supported Couriers

```bash
curl http://localhost:3000/api/v1/couriers
```

**Expected:** `200` with `{ "success": true, "data": { "supported_couriers": ["urbanebolt", "mock_courier"] } }`

---

## 6. Health Check

```bash
curl http://localhost:3000/health
```

---

## Error Scenarios

### Duplicate order (run create twice with same ID)

```bash
curl -X POST 'http://localhost:3000/api/v1/orders' \
  -H 'Content-Type: application/json' \
  -d '{"internal_order_id":"ORD-100","courier_partner":"mock_courier","payment_mode":"prepaid","sender":{"name":"S","phone":"9","address_line_1":"A","city":"C","state":"S","pincode":"1"},"recipient":{"name":"R","phone":"8","address_line_1":"B","city":"D","state":"T","pincode":"2"},"package_details":{"weight_kg":1}}'
```

**Expected:** `409` DUPLICATE_ORDER

### Unknown courier partner

```bash
curl -X POST 'http://localhost:3000/api/v1/orders' \
  -H 'Content-Type: application/json' \
  -d '{"internal_order_id":"ORD-ERR","courier_partner":"nonexistent","payment_mode":"prepaid","sender":{"name":"S","phone":"9","address_line_1":"A","city":"C","state":"S","pincode":"1"},"recipient":{"name":"R","phone":"8","address_line_1":"B","city":"D","state":"T","pincode":"2"},"package_details":{"weight_kg":1}}'
```

**Expected:** `400` UNKNOWN_COURIER_PARTNER

### Missing required fields

```bash
curl -X POST 'http://localhost:3000/api/v1/orders' \
  -H 'Content-Type: application/json' \
  -d '{"internal_order_id":"ORD-VAL","courier_partner":"mock_courier"}'
```

**Expected:** `400` VALIDATION_ERROR with details array

### Track non-existent order

```bash
curl http://localhost:3000/api/v1/orders/DOES-NOT-EXIST/track
```

**Expected:** `404` ORDER_NOT_FOUND
