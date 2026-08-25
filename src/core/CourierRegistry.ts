import { ICourierAdapter } from "./ICourierAdapter";

/**
 * Registry (Factory) that holds all registered courier adapters.
 *
 * At application startup, each adapter instance is registered here.
 * The service layer resolves adapters by partner name at runtime,
 * achieving full Open-Closed compliance: new couriers are added
 * without modifying any existing business logic or routing code.
 */
export class CourierRegistry {
  private static adapters: Map<string, ICourierAdapter> = new Map();

  static register(adapter: ICourierAdapter): void {
    const key = adapter.partnerName.toLowerCase();
    CourierRegistry.adapters.set(key, adapter);
  }

  static resolve(partnerName: string): ICourierAdapter | undefined {
    return CourierRegistry.adapters.get(partnerName.toLowerCase());
  }

  static getSupportedPartners(): string[] {
    return Array.from(CourierRegistry.adapters.keys());
  }

  /** Used in tests to reset state between test runs. */
  static clear(): void {
    CourierRegistry.adapters.clear();
  }
}
