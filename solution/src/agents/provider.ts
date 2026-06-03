// =============================================================================
// provider.ts — ProviderAgent: Mock flight provider with simulated latency
// =============================================================================

import { Agent, AgentContext, AgentResult, FlightOption, ProviderResult } from '../types';

/**
 * Configuration for a mock flight provider.
 * Each provider is created with different config to simulate real-world variance.
 */
export interface ProviderConfig {
  name: string;           // e.g., "Air France"
  basePrice: number;      // Base price in USD
  baseDurationMs: number; // Simulated API latency
  failureRate: number;    // 0.0 to 1.0 — probability of failure
  forceFailure?: boolean; // Override: always fail (for testing)
  forceTimeout?: boolean; // Override: always timeout (for testing)
}

/**
 * ProviderAgent queries a single flight provider (mocked).
 *
 * Design decision: This is a PARAMETERIZED agent — the same class is instantiated
 * 3 times with different ProviderConfig objects. This means:
 * - Adding a new provider = adding one config object (no new code)
 * - All providers share identical orchestration behavior
 * - Each provider has independent failure characteristics
 *
 * These agents are designed to run IN PARALLEL because they are completely
 * independent — no provider needs data from another provider.
 */
export class ProviderAgent implements Agent {
  readonly name: string;

  constructor(private config: ProviderConfig) {
    this.name = `ProviderAgent(${config.name})`;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    const request = context.travelRequest!;

    try {
      // Check forced failure modes (for testing)
      if (this.config.forceTimeout) {
        // Simulate a very long response that will exceed the orchestrator's timeout
        await this.delay(30000);
        throw new Error('Timeout');
      }

      if (this.config.forceFailure) {
        await this.delay(50); // Brief delay before failing
        throw new Error(`${this.config.name} service unavailable`);
      }

      // Simulate random failure based on failure rate
      if (Math.random() < this.config.failureRate) {
        await this.delay(50);
        throw new Error(`${this.config.name} returned an error`);
      }

      // Simulate API call latency (variable)
      const latency = this.config.baseDurationMs + Math.random() * 100;
      await this.delay(latency);

      // Generate mock flight data
      const flight = this.generateFlight(request.destination!, request.origin!);
      const executionTimeMs = Date.now() - startTime;

      const providerResult: ProviderResult = {
        provider: this.config.name,
        status: 'success',
        flight,
        executionTimeMs,
      };

      // Append this provider's result to any existing results
      const existingResults = context.providerResults || [];
      const newContext: AgentContext = {
        ...context,
        providerResults: [...existingResults, providerResult],
      };

      return {
        status: 'success',
        context: newContext,
        message: `${this.config.name}: ${flight.airline} $${flight.price} (${flight.duration})`,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      const providerResult: ProviderResult = {
        provider: this.config.name,
        status: this.config.forceTimeout ? 'timeout' : 'error',
        flight: null,
        error: errorMessage,
        executionTimeMs,
      };

      const existingResults = context.providerResults || [];
      const newContext: AgentContext = {
        ...context,
        providerResults: [...existingResults, providerResult],
      };

      return {
        status: 'error',
        context: newContext,
        message: `${this.config.name} failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Generates a mock flight option with realistic-looking data.
   */
  private generateFlight(destination: string, origin: string): FlightOption {
    const priceVariance = Math.floor(Math.random() * 100) - 50;
    const price = this.config.basePrice + priceVariance;

    const hours = 5 + Math.floor(Math.random() * 10);
    const minutes = Math.floor(Math.random() * 60);
    const stops = Math.random() > 0.6 ? 1 : 0;

    return {
      provider: this.config.name,
      airline: this.config.name,
      price,
      currency: 'USD',
      duration: `${hours}h ${minutes}m`,
      stops,
      departureTime: '08:00',
      arrivalTime: `${(8 + hours) % 24}:${minutes.toString().padStart(2, '0')}`,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Pre-configured provider instances
// =============================================================================

/**
 * Default provider configurations for the 3 mock airlines.
 * These simulate real-world differences in response time and reliability.
 */
export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    name: 'Air France',
    basePrice: 450,
    baseDurationMs: 280,
    failureRate: 0.05,
  },
  {
    name: 'Delta',
    basePrice: 520,
    baseDurationMs: 150,
    failureRate: 0.05,
  },
  {
    name: 'United',
    basePrice: 480,
    baseDurationMs: 220,
    failureRate: 0.05,
  },
];
