// =============================================================================
// types.ts — Core interfaces for the Agent Orchestration System
// =============================================================================

/**
 * Represents the status of an agent's execution.
 *
 * - 'success': Agent completed its task normally
 * - 'error': Agent encountered an unrecoverable error
 * - 'needs_clarification': Agent needs more info from the user (e.g., missing fields)
 */
export type AgentStatus = 'success' | 'error' | 'needs_clarification';

/**
 * Parsed travel request extracted from natural language input.
 */
export interface TravelRequest {
  destination: string | null;
  date: string | null;
  origin: string | null;
  type: 'flight' | 'hotel' | 'car' | null;
}

/**
 * A single flight option returned by a provider agent.
 */
export interface FlightOption {
  provider: string;
  airline: string;
  price: number;
  currency: string;
  duration: string;
  stops: number;
  departureTime: string;
  arrivalTime: string;
}

/**
 * Result from a single provider agent (may succeed or fail).
 */
export interface ProviderResult {
  provider: string;
  status: 'success' | 'error' | 'timeout';
  flight: FlightOption | null;
  error?: string;
  executionTimeMs: number;
}

/**
 * Immutable context passed between agents.
 *
 * Design decision: Context is frozen (Object.freeze) before being passed to
 * each agent. Agents return a NEW context object with their additions.
 * This prevents race conditions when parallel agents share a context snapshot.
 */
export interface AgentContext {
  // Original user input
  readonly userInput: string;

  // Phase 1: Parser output
  readonly travelRequest?: TravelRequest;

  // Phase 1: Validator output
  readonly validationPassed?: boolean;
  readonly missingFields?: string[];

  // Phase 2: Parallel provider results
  readonly providerResults?: ProviderResult[];

  // Phase 3: Aggregator output
  readonly bestOption?: FlightOption | null;
  readonly totalSuccessful?: number;
  readonly totalFailed?: number;

  // Phase 3: Formatter output
  readonly formattedResponse?: string;
}

/**
 * The result returned by every agent after execution.
 */
export interface AgentResult {
  status: AgentStatus;
  context: AgentContext;
  message?: string;
}

/**
 * Common interface for all agents.
 *
 * Every agent in the system implements this interface:
 * - `name`: Unique identifier for logging and tracing
 * - `execute(context)`: Takes immutable context, returns new context + status
 */
export interface Agent {
  readonly name: string;
  execute(context: AgentContext): Promise<AgentResult>;
}

/**
 * A single entry in the execution trace log.
 */
export interface TraceEntry {
  agentName: string;
  status: AgentStatus;
  startTime: number;
  endTime: number;
  executionTimeMs: number;
  parallel: boolean;
  parallelGroup?: string;
  input: Partial<AgentContext>;
  output: Partial<AgentContext>;
  message?: string;
}

/**
 * Defines a step in the orchestration pipeline.
 *
 * - Sequential steps contain a single agent.
 * - Parallel steps contain multiple agents that execute concurrently.
 */
export interface PipelineStep {
  type: 'sequential' | 'parallel';
  agents: Agent[];
  timeoutMs?: number; // Per-agent timeout for parallel steps
  haltOnError?: boolean; // If true (default), non-success halts the pipeline. If false, error context flows to next step.
}
