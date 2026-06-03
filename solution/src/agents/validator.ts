// =============================================================================
// validator.ts — ValidatorAgent: Validates parsed fields, requests clarification
// =============================================================================

import { Agent, AgentContext, AgentResult } from '../types';

/**
 * ValidatorAgent checks that all required fields are present and valid.
 *
 * Design decision: Separated from ParserAgent because:
 * 1. Parsing is NLP extraction (can be swapped for LLM-based parser).
 * 2. Validation is business logic (what fields are required for flights vs hotels).
 * 3. Different change rates — validation rules change with product, parser changes with NLP tech.
 *
 * If validation fails, returns 'needs_clarification' status which instructs
 * the orchestrator to STOP the chain and ask the user for more info.
 */
export class ValidatorAgent implements Agent {
  readonly name = 'ValidatorAgent';

  async execute(context: AgentContext): Promise<AgentResult> {
    // Simulate processing time
    await this.delay(20);

    const request = context.travelRequest;

    if (!request) {
      return {
        status: 'error',
        context,
        message: 'No travel request found in context. ParserAgent may have failed.',
      };
    }

    const missingFields: string[] = [];

    // Check required fields
    if (!request.destination) {
      missingFields.push('destination');
    }

    if (!request.date) {
      missingFields.push('date (please specify an exact date, e.g., "December 1st")');
    }

    if (!request.type) {
      missingFields.push('travel type (flight, hotel, or car)');
    }

    // Validate date is in the future
    if (request.date) {
      const requestDate = new Date(request.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (requestDate < today) {
        missingFields.push('date (must be in the future)');
      }
    }

    if (missingFields.length > 0) {
      const newContext: AgentContext = {
        ...context,
        validationPassed: false,
        missingFields,
      };

      return {
        status: 'needs_clarification',
        context: newContext,
        message: `Missing required information: ${missingFields.join(', ')}`,
      };
    }

    // All validations passed
    const newContext: AgentContext = {
      ...context,
      validationPassed: true,
      missingFields: [],
    };

    return {
      status: 'success',
      context: newContext,
      message: `Validation passed: ${request.destination} on ${request.date} (${request.type})`,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
