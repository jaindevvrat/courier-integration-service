import { expect } from "chai";
import sinon from "sinon";
import axios from "axios";
import { UrbaneBoltAdapter } from "../src/adapters/UrbaneBoltAdapter";
import { CourierAuthError, CourierApiError } from "../src/errors/AppError";
import { ShipmentStatus } from "../src/core/enums";

/**
 * Unit tests for UrbaneBolt adapter.
 *
 * All external HTTP calls are stubbed using Sinon to ensure tests
 * run fully offline. Tests cover authentication, request transformation,
 * response mapping, status normalization, and error handling.
 */
describe("UrbaneBoltAdapter", () => {
  let adapter: UrbaneBoltAdapter;
  let postStub: sinon.SinonStub;
  let getStub: sinon.SinonStub;

  beforeEach(() => {
    adapter = new UrbaneBoltAdapter();
    // Stub the underlying axios methods on the adapter's client
    postStub = sinon.stub(axios, "create").returns({
      post: sinon.stub(),
      get: sinon.stub(),
      defaults: { headers: { common: {} } },
      interceptors: {
        request: { use: sinon.stub() },
        response: { use: sinon.stub() },
      },
    } as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("authenticate", () => {
    it("should store token on successful authentication", async () => {
      // Access the internal client and stub its post method
      const fakeClient = {
        post: sinon.stub(),
        get: sinon.stub(),
        defaults: { headers: { common: {} as Record<string, string> } },
      };
      fakeClient.post.resolves({ data: { token: "test-token-123" } });

      // Replace internal client via prototype manipulation for testing
      (adapter as any).client = fakeClient;

      const token = await adapter.authenticate();
      expect(token).to.equal("test-token-123");
      expect(fakeClient.defaults.headers.common["Authorization"]).to.equal(
        "Bearer test-token-123",
      );
    });

    it("should throw CourierAuthError when no token is returned", async () => {
      const fakeClient = {
        post: sinon.stub(),
        get: sinon.stub(),
        defaults: { headers: { common: {} } },
      };
      fakeClient.post.resolves({ data: { token: null } });
      (adapter as any).client = fakeClient;

      try {
        await adapter.authenticate();
        expect.fail("Should have thrown CourierAuthError");
      } catch (err: unknown) {
        expect(err).to.be.instanceOf(CourierAuthError);
      }
    });

    it("should throw CourierAuthError on network failure during auth", async () => {
      const fakeClient = {
        post: sinon.stub(),
        get: sinon.stub(),
        defaults: { headers: { common: {} } },
      };
      fakeClient.post.rejects(new Error("ECONNREFUSED"));
      (adapter as any).client = fakeClient;

      try {
        await adapter.authenticate();
        expect.fail("Should have thrown");
      } catch (err: unknown) {
        expect(err).to.be.instanceOf(CourierAuthError);
      }
    });
  });

  describe("createShipment", () => {
    it("should map unified DTO to UrbaneBolt payload format", async () => {
      const fakeClient = {
        post: sinon.stub(),
        get: sinon.stub(),
        defaults: { headers: { common: {} } },
      };

      // Auth call
      fakeClient.post.onFirstCall().resolves({ data: { token: "tok" } });
      // Create order call
      fakeClient.post.onSecondCall().resolves({
        data: {
          order_id: "UB-12345",
          awb_number: "AWB9876",
          status: "created",
        },
      });
      (adapter as any).client = fakeClient;

      const order = {
        internal_order_id: "ORD-001",
        courier_partner: "urbanebolt",
        payment_mode: "prepaid" as const,
        sender: {
          name: "Sender",
          phone: "9999999999",
          address_line_1: "Sender St",
          city: "Mumbai",
          state: "MH",
          pincode: "400001",
        },
        recipient: {
          name: "Receiver",
          phone: "8888888888",
          address_line_1: "Receiver St",
          city: "Delhi",
          state: "DL",
          pincode: "110001",
        },
        package_details: {
          weight_kg: 2.0,
        },
      };

      const result = await adapter.createShipment(order);

      expect(result.courier_shipment_id).to.equal("UB-12345");
      expect(result.awb_number).to.equal("AWB9876");
      expect(result.raw_request).to.have.property("order_id", "ORD-001");
      expect(result.raw_request).to.have.nested.property(
        "sender.name",
        "Sender",
      );
    });

    it("should throw CourierApiError when response lacks shipment identifiers", async () => {
      const fakeClient = {
        post: sinon.stub(),
        get: sinon.stub(),
        defaults: { headers: { common: {} } },
      };
      fakeClient.post.onFirstCall().resolves({ data: { token: "tok" } });
      fakeClient.post.onSecondCall().resolves({ data: {} });
      (adapter as any).client = fakeClient;

      const order = {
        internal_order_id: "ORD-FAIL",
        courier_partner: "urbanebolt",
        payment_mode: "prepaid" as const,
        sender: {
          name: "S",
          phone: "9",
          address_line_1: "A",
          city: "C",
          state: "S",
          pincode: "1",
        },
        recipient: {
          name: "R",
          phone: "8",
          address_line_1: "B",
          city: "D",
          state: "T",
          pincode: "2",
        },
        package_details: { weight_kg: 1 },
      };

      try {
        await adapter.createShipment(order);
        expect.fail("Should have thrown");
      } catch (err: unknown) {
        expect(err).to.be.instanceOf(CourierApiError);
      }
    });
  });

  describe("trackShipment", () => {
    it("should normalize tracking events into platform statuses", async () => {
      const fakeClient = {
        post: sinon.stub(),
        get: sinon.stub(),
        defaults: { headers: { common: {} } },
      };
      fakeClient.post.resolves({ data: { token: "tok" } });
      fakeClient.get.resolves({
        data: {
          tracking_history: [
            {
              status: "created",
              description: "Order placed",
              timestamp: "2024-01-01T00:00:00Z",
            },
            {
              status: "picked_up",
              description: "Picked up",
              timestamp: "2024-01-02T00:00:00Z",
            },
            {
              status: "in_transit",
              description: "Moving",
              location: "Hub A",
              timestamp: "2024-01-03T00:00:00Z",
            },
          ],
        },
      });
      (adapter as any).client = fakeClient;

      const result = await adapter.trackShipment({ awb_number: "AWB123" });

      expect(result.current_status).to.equal(ShipmentStatus.IN_TRANSIT);
      expect(result.events).to.have.lengthOf(3);
      expect(result.events[0].status).to.equal(ShipmentStatus.CREATED);
      expect(result.events[1].status).to.equal(ShipmentStatus.PICKED_UP);
      expect(result.events[2].location).to.equal("Hub A");
    });
  });

  describe("cancelShipment", () => {
    it("should return success true when courier confirms cancellation", async () => {
      const fakeClient = {
        post: sinon.stub(),
        get: sinon.stub(),
        defaults: { headers: { common: {} } },
      };
      fakeClient.post.onFirstCall().resolves({ data: { token: "tok" } });
      fakeClient.post.onSecondCall().resolves({
        data: { success: true, message: "Cancelled" },
      });
      (adapter as any).client = fakeClient;

      const result = await adapter.cancelShipment("UB-12345");

      expect(result.success).to.be.true;
      expect(result.message).to.include("Cancel");
    });
  });

  describe("Auth retry on 401", () => {
    it("should re-authenticate and retry when receiving 401", async () => {
      const fakeClient = {
        post: sinon.stub(),
        get: sinon.stub(),
        defaults: { headers: { common: {} } },
      };

      // First auth succeeds
      fakeClient.post.onCall(0).resolves({ data: { token: "old-token" } });
      // Create call fails with 401
      const axiosErr = new Error("Unauthorized") as any;
      axiosErr.response = { status: 401 };
      axiosErr.isAxiosError = true;
      fakeClient.post.onCall(1).rejects(axiosErr);
      // Re-auth succeeds
      fakeClient.post.onCall(2).resolves({ data: { token: "new-token" } });
      // Retry of create succeeds
      fakeClient.post.onCall(3).resolves({
        data: { order_id: "RETRY-OK", awb_number: "AWB-RETRY" },
      });

      (adapter as any).client = fakeClient;

      const order = {
        internal_order_id: "AUTH-RETRY-TEST",
        courier_partner: "urbanebolt",
        payment_mode: "prepaid" as const,
        sender: {
          name: "S",
          phone: "9",
          address_line_1: "A",
          city: "C",
          state: "S",
          pincode: "1",
        },
        recipient: {
          name: "R",
          phone: "8",
          address_line_1: "B",
          city: "D",
          state: "T",
          pincode: "2",
        },
        package_details: { weight_kg: 1 },
      };

      const result = await adapter.createShipment(order);
      expect(result.courier_shipment_id).to.equal("RETRY-OK");
    });
  });
});
