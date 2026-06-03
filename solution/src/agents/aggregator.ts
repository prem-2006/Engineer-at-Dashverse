// =============================================================================
// aggregator.ts — AggregatorAgent: Collects parallel results, picks best option
// =============================================================================

import { Agent, AgentContext, AgentResult, FlightOption } from '../types';

/**
 * AggregatorAgent collects results from all parallel provider agents and
 * selects the best option.
 *
 * Design decision: Separated from FormatterAgent because:
 * 1. Aggregation is DECISION LOGIC — "which flight is best?" (could be cheapest,
 *    fastest, or user-preference based). This logic may become complex.
 * 2. Formatting is PRESENTATION — "how do we show this to the user?"
 * 3. They change independently: we might change the selection algorithm
 *    without touching the output format, or vice versa.
 *
 * Error handling strategy (best-effort):
 * - 3/3 succeed → normal flow, pick cheapest
 * - 2/3 succeed → continue with 2 results + note
 * - 1/3 succeed → continue with 1 result + warning
 * - 0/3 succeed → ABORT — return error (can't show nothing)
 */
export class AggregatorAgent implements Agent {
  readonly name = 'AggregatorAgent';

  async execute(context: AgentContext): Promise<AgentResult> {
    // Simulate processing time
    await this.delay(30);

    const results = context.providerResults || [];

    const successful = results.filter(r => r.status === 'success' && r.flight);
    const failed = results.filter(r => r.status !== 'success');

    // Case: ALL providers failed
    if (successful.length === 0) {
      const newContext: AgentContext = {
        ...context,
        bestOption: null,
        totalSuccessful: 0,
        totalFailed: failed.length,
      };

      return {
        status: 'error',
        context: newContext,
        message: `All ${results.length} providers failed. Cannot proceed.`,
      };
    }

    // Select best option (cheapest price)
    const flights = successful
      .map(r => r.flight!)
      .sort((a, b) => a.price - b.price);

    const bestOption = flights[0];

    const newContext: AgentContext = {
      ...context,
      bestOption,
      totalSuccessful: successful.length,
      totalFailed: failed.length,
    };

    let message = `Found ${successful.length} option(s). Best: ${bestOption.airline} $${bestOption.price}`;
    if (failed.length > 0) {
      message += ` (${failed.length} provider(s) failed)`;
    }

    return {
      status: 'success',
      context: newContext,
      message,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
