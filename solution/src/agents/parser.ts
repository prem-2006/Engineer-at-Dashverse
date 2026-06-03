// =============================================================================
// parser.ts — ParserAgent: Extracts structured data from natural language
// =============================================================================

import { Agent, AgentContext, AgentResult, TravelRequest } from '../types';

/**
 * ParserAgent extracts structured travel information from free-form user input.
 *
 * Design decision: This is a MOCK parser using keyword matching. In production,
 * this would be backed by an LLM (e.g., GPT, Claude) or a trained NER model.
 * The orchestration architecture remains identical regardless of the parser impl.
 *
 * Responsibility: Extract destination, date, origin, and travel type.
 * Does NOT validate — that's the ValidatorAgent's job.
 */
export class ParserAgent implements Agent {
  readonly name = 'ParserAgent';

  async execute(context: AgentContext): Promise<AgentResult> {
    // Simulate processing time (NLP parsing)
    await this.delay(50);

    const input = context.userInput.toLowerCase();
    const request = this.parseInput(input);

    const newContext: AgentContext = {
      ...context,
      travelRequest: request,
    };

    return {
      status: 'success',
      context: newContext,
      message: `Parsed: destination=${request.destination}, date=${request.date}, origin=${request.origin}, type=${request.type}`,
    };
  }

  /**
   * Mock NLP parser using keyword/pattern matching.
   * Extracts destination, date, origin, and travel type from natural language.
   */
  private parseInput(input: string): TravelRequest {
    return {
      destination: this.extractDestination(input),
      date: this.extractDate(input),
      origin: this.extractOrigin(input),
      type: this.extractType(input),
    };
  }

  private extractDestination(input: string): string | null {
    // Match "to <City>" pattern
    const cities = [
      'paris', 'tokyo', 'london', 'new york', 'berlin',
      'rome', 'sydney', 'dubai', 'singapore', 'mumbai',
      'los angeles', 'san francisco', 'chicago', 'toronto',
    ];

    for (const city of cities) {
      if (input.includes(city)) {
        return city.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
      }
    }
    return null;
  }

  private extractDate(input: string): string | null {
    // Match relative dates
    const now = new Date();

    if (input.includes('next friday')) {
      const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
      const friday = new Date(now.getTime() + daysUntilFriday * 86400000);
      return friday.toISOString().split('T')[0];
    }

    if (input.includes('next month')) {
      return null; // Too vague — no specific date
    }

    // Match explicit dates like "December 1st", "Jan 15", etc.
    const months: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
      jan: 0, feb: 1, mar: 2, apr: 3, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };

    for (const [monthName, monthNum] of Object.entries(months)) {
      const regex = new RegExp(`${monthName}\\s+(\\d{1,2})`, 'i');
      const match = input.match(regex);
      if (match) {
        const day = parseInt(match[1], 10);
        const year = monthNum < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();
        const date = new Date(year, monthNum, day);
        return date.toISOString().split('T')[0];
      }
    }

    return null;
  }

  private extractOrigin(input: string): string | null {
    // Match "from <City>" pattern
    const fromMatch = input.match(/from\s+([a-z\s]+?)(?:\s+to\s+|\s*$)/i);
    if (fromMatch) {
      return fromMatch[1].trim().split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
    }
    // Default origin if not specified
    return 'New York';
  }

  private extractType(input: string): 'flight' | 'hotel' | 'car' | null {
    const lower = input.toLowerCase();
    if (lower.includes('flight') || lower.includes('fly') || lower.includes('book')) return 'flight';
    if (lower.includes('hotel') || lower.includes('stay')) return 'hotel';
    if (lower.includes('car') || lower.includes('rent') || lower.includes('drive')) return 'car';
    // If destination is found but no explicit type, assume flight
    if (this.extractDestination(lower)) return 'flight';
    return null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
