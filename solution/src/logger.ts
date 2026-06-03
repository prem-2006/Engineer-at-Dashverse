// =============================================================================
// logger.ts — ExecutionLogger: Traces agent execution with timing & observability
// =============================================================================

import { TraceEntry, AgentStatus } from './types';

/**
 * ExecutionLogger captures a full trace of every agent execution.
 *
 * Features:
 * - Records start/end times, status, and messages for each agent
 * - Distinguishes parallel vs sequential execution
 * - Provides a formatted summary with visual indicators
 * - Calculates total pipeline execution time
 *
 * This fulfills the "Observability" requirement from the problem statement.
 */
export class ExecutionLogger {
  private traces: TraceEntry[] = [];
  private pipelineStartTime: number = 0;

  /**
   * Start timing the entire pipeline.
   */
  startPipeline(): void {
    this.pipelineStartTime = Date.now();
    this.traces = [];
    this.log('🚀 Pipeline started');
  }

  /**
   * Record a completed agent execution.
   */
  addTrace(entry: TraceEntry): void {
    this.traces.push(entry);

    const parallel = entry.parallel ? ` [PARALLEL: ${entry.parallelGroup}]` : ' [SEQUENTIAL]';
    const statusIcon = this.getStatusIcon(entry.status);

    this.log(
      `  ${statusIcon} ${entry.agentName}${parallel} — ${entry.executionTimeMs}ms — ${entry.message || entry.status}`
    );
  }

  /**
   * Log a phase header (e.g., "Phase 1: Sequential Processing").
   */
  logPhase(phase: string): void {
    this.log(`\n📍 ${phase}`);
  }

  /**
   * Print the complete execution summary.
   */
  printSummary(): void {
    const totalTime = Date.now() - this.pipelineStartTime;

    console.log('\n' + '═'.repeat(60));
    console.log('📊 EXECUTION TRACE');
    console.log('═'.repeat(60));

    // Group traces by phase
    const sequential = this.traces.filter(t => !t.parallel);
    const parallel = this.traces.filter(t => t.parallel);

    if (sequential.length > 0 || parallel.length > 0) {
      // Show sequential agents
      for (const trace of this.traces) {
        const icon = this.getStatusIcon(trace.status);
        const mode = trace.parallel ? `⚡ PARALLEL` : `→ SEQUENTIAL`;
        const group = trace.parallelGroup ? ` (${trace.parallelGroup})` : '';

        console.log(
          `  ${icon} ${trace.agentName.padEnd(28)} ${mode}${group}  ${trace.executionTimeMs}ms`
        );
      }
    }

    console.log('─'.repeat(60));

    // Calculate parallel savings
    if (parallel.length > 0) {
      const parallelTotal = parallel.reduce((sum, t) => sum + t.executionTimeMs, 0);
      const parallelMax = Math.max(...parallel.map(t => t.executionTimeMs));
      const savings = parallelTotal - parallelMax;

      console.log(`  ⚡ Parallel execution saved ~${savings}ms`);
      console.log(`     (${parallelTotal}ms sequential → ${parallelMax}ms parallel)`);
    }

    console.log(`  ⏱️  Total pipeline time: ${totalTime}ms`);

    // Status counts
    const successCount = this.traces.filter(t => t.status === 'success').length;
    const errorCount = this.traces.filter(t => t.status === 'error').length;
    const clarifyCount = this.traces.filter(t => t.status === 'needs_clarification').length;

    console.log(`  📈 Agents: ${successCount} succeeded, ${errorCount} failed, ${clarifyCount} need clarification`);
    console.log('═'.repeat(60));
  }

  /**
   * Get all trace entries (for programmatic access).
   */
  getTraces(): readonly TraceEntry[] {
    return [...this.traces];
  }

  private getStatusIcon(status: AgentStatus): string {
    switch (status) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'needs_clarification': return '❓';
    }
  }

  private log(message: string): void {
    console.log(message);
  }
}
