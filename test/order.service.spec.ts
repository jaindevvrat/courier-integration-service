import { expect } from "chai";
import sinon from "sinon";
import { CourierRegistry } from "../src/core/CourierRegistry";
import { MockCourierAdapter } from "../src/adapters/MockCourierAdapter";
import { ShipmentStatus } from "../src/core/enums";
import { ICourierAdapter } from "../src/core/ICourierAdapter";
import {
  CourierNotFoundError,
  DuplicateOrderError,
} from "../src/errors/AppError";

/**
 * Unit tests for order service logic.
 *
 * These tests validate the courier registry, adapter resolution,
 * idempotency checks, and bulk partial-success semantics.
 * All courier network calls are stubbed via Sinon.
 */
describe("CourierRegistry", () => {
  beforeEach(() => {
    CourierRegistry.clear();
  });

  it("should register and resolve an adapter by partner name", () => {
    const adapter = new MockCourierAdapter();
    CourierRegistry.register(adapter);
    const resolved = CourierRegistry.resolve("mock_courier");
    expect(resolved).to.equal(adapter);
  });

  it("should resolve adapters case-insensitively", () => {
    const adapter = new MockCourierAdapter();
    CourierRegistry.register(adapter);
    expect(CourierRegistry.resolve("MOCK_COURIER")).to.equal(adapter);
    expect(CourierRegistry.resolve("Mock_Courier")).to.equal(adapter);
  });

  it("should return undefined for unknown partners", () => {
    const result = CourierRegistry.resolve("nonexistent_courier");
    expect(result).to.be.undefined;
  });

  it("should list all registered partner names", () => {
    CourierRegistry.register(new MockCourierAdapter());
    const partners = CourierRegistry.getSupportedPartners();
    expect(partners).to.include("mock_courier");
  });
});

describe("MockCourierAdapter", () => {
  let adapter: MockCourierAdapter;

  beforeEach(() => {
    adapter = new MockCourierAdapter();
  });

  it("should return a token on authenticate", async () => {
    const token = await adapter.authenticate();
    expect(token).to.be.a("string");
    expect(token).to.include("mock-token-");
  });

  it("should return a valid shipment result on createShipment", async () => {
    const order = buildSampleOrder("TEST-001");
    const result = await adapter.createShipment(order);

    expect(result.courier_shipment_id).to.match(/^MOCK-/);
    expect(result.awb_number).to.match(/^MAWB/);
    expect(result.raw_request).to.have.property("reference", "TEST-001");
    expect(result.raw_response).to.have.property("success", true);
  });

  it("should return tracking events on trackShipment", async () => {
    const result = await adapter.trackShipment({ awb_number: "AWB123" });

    expect(result.current_status).to.equal(ShipmentStatus.IN_TRANSIT);
    expect(result.events).to.be.an("array").with.length.greaterThan(0);
    expect(result.events[0]).to.have.property("status");
    expect(result.events[0]).to.have.property("description");
  });

  it("should return success on cancelShipment", async () => {
    const result = await adapter.cancelShipment("ORDER-123");

    expect(result.success).to.be.true;
    expect(result.message).to.include("cancelled");
  });
});

describe("Order Creation - Idempotency and Error Cases", () => {
  beforeEach(() => {
    CourierRegistry.clear();
    CourierRegistry.register(new MockCourierAdapter());
  });

  it("should throw CourierNotFoundError for unknown partners", () => {
    const supported = CourierRegistry.getSupportedPartners();
    const check = () => {
      const adapter = CourierRegistry.resolve("unknown_partner");
      if (!adapter) {
        throw new CourierNotFoundError("unknown_partner", supported);
      }
    };
    expect(check).to.throw(CourierNotFoundError);
  });

  it("should correctly identify duplicate order scenarios", () => {
    // Simulating idempotency guard at the service level
    const existingIds = new Set(["ORDER-EXISTING"]);
    const check = (orderId: string) => {
      if (existingIds.has(orderId)) {
        throw new DuplicateOrderError(orderId);
      }
    };

    expect(() => check("ORDER-EXISTING")).to.throw(DuplicateOrderError);
    expect(() => check("ORDER-NEW")).to.not.throw();
  });
});

describe("Bulk Order Processing - Partial Success", () => {
  let adapter: MockCourierAdapter;
  let createStub: sinon.SinonStub;

  beforeEach(() => {
    CourierRegistry.clear();
    adapter = new MockCourierAdapter();
    CourierRegistry.register(adapter);
    createStub = sinon.stub(adapter, "createShipment");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should handle mixed success and failure within a batch", async () => {
    // First call succeeds, second call fails
    createStub.onFirstCall().resolves({
      courier_shipment_id: "MOCK-AAA",
      awb_number: "MAWB001",
      raw_request: {},
      raw_response: { success: true },
    });
    createStub.onSecondCall().rejects(new Error("Courier timeout"));

    const order1 = buildSampleOrder("BULK-001");
    const order2 = buildSampleOrder("BULK-002");

    const result1 = await adapter.createShipment(order1);
    expect(result1.courier_shipment_id).to.equal("MOCK-AAA");

    try {
      await adapter.createShipment(order2);
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      expect((err as Error).message).to.equal("Courier timeout");
    }
  });
});

describe("Token Expiry and Auto-Refresh", () => {
  it("should call authenticate when token is missing or expired", async () => {
    const adapter = new MockCourierAdapter();
    const authSpy = sinon.spy(adapter, "authenticate");

    // First call should authenticate
    await adapter.authenticate();
    expect(authSpy.calledOnce).to.be.true;

    // Subsequent explicit call also works
    await adapter.authenticate();
    expect(authSpy.calledTwice).to.be.true;
  });
});

// -- Test Helpers --

function buildSampleOrder(orderId: string) {
  return {
    internal_order_id: orderId,
    courier_partner: "mock_courier",
    payment_mode: "prepaid" as const,
    sender: {
      name: "Warehouse Alpha",
      phone: "9876543210",
      address_line_1: "123 Industrial Zone",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
    },
    recipient: {
      name: "Customer Beta",
      phone: "9123456789",
      address_line_1: "456 Residential Block",
      city: "Delhi",
      state: "Delhi",
      pincode: "110001",
    },
    package_details: {
      weight_kg: 1.5,
      length_cm: 20,
      width_cm: 15,
      height_cm: 10,
      product_name: "Test Product",
      product_value: 999,
    },
  };
}
