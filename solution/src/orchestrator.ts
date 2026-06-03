// =============================================================================
// orchestrator.ts — Core orchestration engine: sequential + parallel execution
// =============================================================================

import {
  Agent,
  AgentContext,
  AgentResult,
  PipelineStep,
  TraceEntry,
} from './types';
import { ExecutionLogger } from './logger';

/**
 * Orchestrator manages the execution of agent pipelines.
 *
 * Key design decisions:
 *
 * 1. PIPELINE STEPS: The pipeline is defined as an array of PipelineStep objects.
 *    Each step is either 'sequential' (single agent) or 'parallel' (multiple agents).
 *    This declarative approach makes it easy to modify the pipeline structure.
 *
 * 2. PARALLEL EXECUTION: Uses Promise.allSettled to run parallel agents concurrently.
 *    Promise.allSettled (not Promise.all) ensures we wait for ALL agents even if some
 *    fail — essential for the best-effort strategy.
 *
 * 3. IMMUTABLE CONTEXT: Each agent receives Object.freeze(context). For parallel
 *    agents, each receives the SAME frozen snapshot. Results are merged after all
 *    complete. This prevents race conditions.
 *
 * 4. TIMEOUT: Parallel agents have a configurable per-agent timeout. If an agent
 *    exceeds the timeout, its promise is rejected (timeout error).
 *
 * 5. SHORT-CIRCUITING: If a sequential agent returns 'needs_clarification' or
 *    'error', the pipeline stops early (no point querying providers if validation failed).
 */
export class Orchestrator {
  private logger: ExecutionLogger;

  constructor(logger?: ExecutionLogger) {
    this.logger = logger || new ExecutionLogger();
  }

  /**
   * Execute a full pipeline of steps.
   *
   * @param steps - Ordered array of pipeline steps (sequential or parallel)
   * @param initialContext - Starting context (usually just { userInput: "..." })
   * @returns Final agent result after all steps complete
   */
  async execute(
    steps: PipelineStep[],
    initialContext: AgentContext
  ): Promise<AgentResult> {
    this.logger.startPipeline();

    let currentContext = Object.freeze({ ...initialContext });
    let phaseNumber = 1;

    for (const step of steps) {
      if (step.type === 'sequential') {
        // Execute sequential agents one by one
        for (const agent of step.agents) {
          this.logger.logPhase(
            `Phase ${phaseNumber}: Sequential — ${agent.name}`
          );

          const result = await this.executeAgent(agent, currentContext, false);

          // Short-circuit on non-success ONLY if haltOnError is true (default)
          const shouldHalt = step.haltOnError !== false; // defaults to true
          if (result.status !== 'success' && shouldHalt) {
            this.logger.printSummary();
            return result;
          }

          currentContext = Object.freeze({ ...result.context });
          phaseNumber++;
        }
      } else if (step.type === 'parallel') {
        // Execute parallel agents concurrently
        this.logger.logPhase(
          `Phase ${phaseNumber}: PARALLEL — ${step.agents.map(a => a.name).join(', ')}`
        );

        const result = await this.executeParallel(
          step.agents,
          currentContext,
          step.timeoutMs || 5000
        );

        currentContext = Object.freeze({ ...result.context });
        phaseNumber++;
      }
    }

    this.logger.printSummary();

    return {
      status: 'success',
      context: currentContext,
    };
  }

  /**
   * Execute a single agent with timing and tracing.
   */
  private async executeAgent(
    agent: Agent,
    context: AgentContext,
    parallel: boolean,
    parallelGroup?: string
  ): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      const result = await agent.execute(context);
      const endTime = Date.now();

      const trace: TraceEntry = {
        agentName: agent.name,
        status: result.status,
        startTime,
        endTime,
        executionTimeMs: endTime - startTime,
        parallel,
        parallelGroup,
        input: { userInput: context.userInput },
        output: this.contextDiff(context, result.context),
        message: result.message,
      };

      this.logger.addTrace(trace);
      return result;
    } catch (error) {
      const endTime = Date.now();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      const trace: TraceEntry = {
        agentName: agent.name,
        status: 'error',
        startTime,
        endTime,
        executionTimeMs: endTime - startTime,
        parallel,
        parallelGroup,
        input: { userInput: context.userInput },
        output: {},
        message: `Unhandled error: ${errorMessage}`,
      };

      this.logger.addTrace(trace);

      return {
        status: 'error',
        context,
        message: `Agent ${agent.name} threw an unhandled error: ${errorMessage}`,
      };
    }
  }

  /**
   * Execute multiple agents in parallel using Promise.allSettled.
   *
   * Why Promise.allSettled over Promise.all?
   * - Promise.all fails fast: if ANY promise rejects, it short-circuits.
   * - Promise.allSettled waits for ALL promises, regardless of outcome.
   * - For best-effort strategy, we NEED all results (even failures) to decide
   *   whether we have enough data to continue.
   *
   * Timeout mechanism:
   * - Each agent is wrapped in a Promise.race against a timeout promise.
   * - If the agent exceeds the timeout, the race resolves with a timeout error.
   * - The agent's promise is NOT cancelled (Node.js doesn't support cancellation),
   *   but the orchestrator moves on.
   */
  private async executeParallel(
    agents: Agent[],
    context: AgentContext,
    timeoutMs: number
  ): Promise<AgentResult> {
    const groupName = agents.map(a => a.name).join(' + ');

    // Create timeout-wrapped promises for each agent
    const agentPromises = agents.map(agent => {
      return this.withTimeout(
        this.executeAgent(agent, context, true, groupName),
        timeoutMs,
        agent.name
      );
    });

    // Execute ALL in parallel — Promise.allSettled never rejects
    const settledResults = await Promise.allSettled(agentPromises);

    // Merge results from all parallel agents into a single context
    let mergedContext: AgentContext = { ...context, providerResults: [] };

    for (const settled of settledResults) {
      if (settled.status === 'fulfilled') {
        const result = settled.value;
        // Merge provider results from each agent
        if (result.context.providerResults) {
          mergedContext = {
            ...mergedContext,
            providerResults: [
              ...(mergedContext.providerResults || []),
              ...result.context.providerResults.filter(
                pr => !(context.providerResults || []).some(
                  existing => existing.provider === pr.provider
                )
              ),
            ],
          };
        }
      }
      // Rejected promises (from timeout) are already logged via the trace
    }

    return {
      status: 'success',
      context: mergedContext,
    };
  }

  /**
   * Wraps a promise with a timeout. If the promise doesn't resolve within
   * the specified time, it resolves with a timeout error result.
   */
  private async withTimeout(
    promise: Promise<AgentResult>,
    timeoutMs: number,
    agentName: string
  ): Promise<AgentResult> {
    const timeoutPromise = new Promise<AgentResult>((resolve) => {
      setTimeout(() => {
        resolve({
          status: 'error',
          context: {
            userInput: '',
            providerResults: [{
              provider: agentName,
              status: 'timeout',
              flight: null,
              error: `Timed out after ${timeoutMs}ms`,
              executionTimeMs: timeoutMs,
            }],
          },
          message: `${agentName} timed out after ${timeoutMs}ms`,
        });
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Compute the diff between input and output context (for logging).
   * Shows only the keys that were added or changed.
   */
  private contextDiff(
    input: AgentContext,
    output: AgentContext
  ): Partial<AgentContext> {
    const diff: Record<string, unknown> = {};

    for (const key of Object.keys(output) as (keyof AgentContext)[]) {
      if (JSON.stringify(input[key]) !== JSON.stringify(output[key])) {
        diff[key] = output[key];
      }
    }

    return diff as Partial<AgentContext>;
  }
}
