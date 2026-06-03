// =============================================================================
// formatter.ts — FormatterAgent: Produces human-readable output
// =============================================================================

import { Agent, AgentContext, AgentResult } from '../types';

/**
 * FormatterAgent produces the final user-facing response.
 *
 * Design decision: Separated from AggregatorAgent because presentation
 * and business logic change at different rates. We might want to output
 * JSON for an API, Markdown for a chatbot, or plain text for CLI —
 * without touching the selection algorithm.
 */
export class FormatterAgent implements Agent {
  readonly name = 'FormatterAgent';

  async execute(context: AgentContext): Promise<AgentResult> {
    // Simulate processing time
    await this.delay(10);

    // Handle error cases
    if (context.validationPassed === false) {
      const missing = context.missingFields?.join(', ') || 'unknown fields';
      const response = [
        `❓ I need a bit more information to help you:`,
        `   Missing: ${missing}`,
        `   Please provide the missing details and try again.`,
      ].join('\n');

      return {
        status: 'needs_clarification',
        context: { ...context, formattedResponse: response },
        message: 'Formatted clarification request',
      };
    }

    if (!context.bestOption && context.totalFailed && context.totalFailed > 0) {
      const response = [
        `❌ Sorry, I couldn't find any flights right now.`,
        `   All ${context.totalFailed} provider(s) failed to respond.`,
        `   Please try again in a few moments.`,
      ].join('\n');

      return {
        status: 'error',
        context: { ...context, formattedResponse: response },
        message: 'Formatted error response',
      };
    }

    // Happy path (or partial success)
    const best = context.bestOption!;
    const request = context.travelRequest!;
    const results = context.providerResults || [];
    const successful = results.filter(r => r.status === 'success');

    const lines: string[] = [
      `✈️  Flight Search Results`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `🔍 I found ${successful.length} flight(s) to ${request.destination} on ${request.date}.`,
      ``,
      `🏆 Best Option:`,
      `   Airline:   ${best.airline}`,
      `   Price:     $${best.price} ${best.currency}`,
      `   Duration:  ${best.duration}${best.stops === 0 ? ' (direct)' : ` (${best.stops} stop${best.stops > 1 ? 's' : ''})`}`,
      `   Departure: ${best.departureTime} → Arrival: ${best.arrivalTime}`,
    ];

    // Show all options if multiple
    if (successful.length > 1) {
      lines.push(``);
      lines.push(`📋 All Options (sorted by price):`);

      const allFlights = successful
        .map(r => r.flight!)
        .sort((a, b) => a.price - b.price);

      for (const flight of allFlights) {
        const marker = flight === best ? ' ← BEST' : '';
        lines.push(
          `   • ${flight.airline}: $${flight.price} (${flight.duration})${marker}`
        );
      }
    }

    // Note partial failures
    if (context.totalFailed && context.totalFailed > 0) {
      lines.push(``);
      lines.push(`⚠️  Note: ${context.totalFailed} provider(s) did not respond. Results may be incomplete.`);
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const response = lines.join('\n');

    return {
      status: 'success',
      context: { ...context, formattedResponse: response },
      message: 'Formatted final response',
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
