// =============================================================================
// main.ts — Entry point: Runs all 4 test cases demonstrating the orchestrator
// =============================================================================

import { AgentContext, PipelineStep } from './types';
import { ParserAgent } from './agents/parser';
import { ValidatorAgent } from './agents/validator';
import { ProviderAgent, ProviderConfig } from './agents/provider';
import { AggregatorAgent } from './agents/aggregator';
import { FormatterAgent } from './agents/formatter';
import { ExecutionLogger } from './logger';
import { Orchestrator } from './orchestrator';

// =============================================================================
// Pipeline Builder
// =============================================================================

/**
 * Builds the standard travel planning pipeline.
 *
 * Architecture:
 *   Phase 1 (Sequential): ParserAgent → ValidatorAgent
 *   Phase 2 (Parallel):   ProviderAgent × 3
 *   Phase 3 (Sequential): AggregatorAgent → FormatterAgent
 *
 * @param providerConfigs - Provider configurations (allows overriding for tests)
 */
function buildPipeline(providerConfigs: ProviderConfig[]): PipelineStep[] {
  const providers = providerConfigs.map(config => new ProviderAgent(config));

  return [
    // Phase 1: Sequential — Parse and validate (halt on validation failure)
    {
      type: 'sequential',
      agents: [new ParserAgent()],
    },
    {
      type: 'sequential',
      agents: [new ValidatorAgent()],
    },
    // Phase 2: Parallel — Query all providers concurrently
    {
      type: 'parallel',
      agents: providers,
      timeoutMs: 5000, // 5s timeout per provider
    },
    // Phase 3: Sequential — Aggregate and format
    // haltOnError: false on aggregator so errors flow to formatter for nice output
    {
      type: 'sequential',
      agents: [new AggregatorAgent()],
      haltOnError: false,
    },
    {
      type: 'sequential',
      agents: [new FormatterAgent()],
    },
  ];
}

// =============================================================================
// Test Cases
// =============================================================================

/**
 * Test Case 1: Happy Path — All 3 providers succeed
 */
async function testCase1_HappyPath(): Promise<void> {
  console.log('\n' + '█'.repeat(60));
  console.log('█  TEST CASE 1: Happy Path — All Providers Succeed');
  console.log('█'.repeat(60));

  const providers: ProviderConfig[] = [
    { name: 'Air France', basePrice: 450, baseDurationMs: 280, failureRate: 0 },
    { name: 'Delta', basePrice: 520, baseDurationMs: 150, failureRate: 0 },
    { name: 'United', basePrice: 480, baseDurationMs: 220, failureRate: 0 },
  ];

  const pipeline = buildPipeline(providers);
  const logger = new ExecutionLogger();
  const orchestrator = new Orchestrator(logger);

  const context: AgentContext = {
    userInput: 'Book a flight to Tokyo for December 1st',
  };

  const result = await orchestrator.execute(pipeline, context);

  console.log('\n📬 Final Response:');
  console.log(result.context.formattedResponse || result.message);
}

/**
 * Test Case 2: Partial Failure — 1 provider fails, 2 succeed
 */
async function testCase2_PartialFailure(): Promise<void> {
  console.log('\n' + '█'.repeat(60));
  console.log('█  TEST CASE 2: Partial Failure — 1 Provider Times Out');
  console.log('█'.repeat(60));

  const providers: ProviderConfig[] = [
    { name: 'Air France', basePrice: 450, baseDurationMs: 280, failureRate: 0 },
    { name: 'Delta', basePrice: 520, baseDurationMs: 150, failureRate: 0, forceFailure: true },
    { name: 'United', basePrice: 480, baseDurationMs: 220, failureRate: 0 },
  ];

  const pipeline = buildPipeline(providers);
  const logger = new ExecutionLogger();
  const orchestrator = new Orchestrator(logger);

  const context: AgentContext = {
    userInput: 'Book me a flight to Paris next Friday',
  };

  const result = await orchestrator.execute(pipeline, context);

  console.log('\n📬 Final Response:');
  console.log(result.context.formattedResponse || result.message);
}

/**
 * Test Case 3: All Providers Fail
 */
async function testCase3_AllFail(): Promise<void> {
  console.log('\n' + '█'.repeat(60));
  console.log('█  TEST CASE 3: All Providers Fail');
  console.log('█'.repeat(60));

  const providers: ProviderConfig[] = [
    { name: 'Air France', basePrice: 450, baseDurationMs: 280, failureRate: 0, forceFailure: true },
    { name: 'Delta', basePrice: 520, baseDurationMs: 150, failureRate: 0, forceFailure: true },
    { name: 'United', basePrice: 480, baseDurationMs: 220, failureRate: 0, forceFailure: true },
  ];

  const pipeline = buildPipeline(providers);
  const logger = new ExecutionLogger();
  const orchestrator = new Orchestrator(logger);

  const context: AgentContext = {
    userInput: 'Book a flight to London for December 15th',
  };

  const result = await orchestrator.execute(pipeline, context);

  console.log('\n📬 Final Response:');
  console.log(result.context.formattedResponse || result.message);
}

/**
 * Test Case 4: Missing Information — Validation catches missing fields
 */
async function testCase4_MissingInfo(): Promise<void> {
  console.log('\n' + '█'.repeat(60));
  console.log('█  TEST CASE 4: Missing Information — Needs Clarification');
  console.log('█'.repeat(60));

  const providers: ProviderConfig[] = [
    { name: 'Air France', basePrice: 450, baseDurationMs: 280, failureRate: 0 },
    { name: 'Delta', basePrice: 520, baseDurationMs: 150, failureRate: 0 },
    { name: 'United', basePrice: 480, baseDurationMs: 220, failureRate: 0 },
  ];

  const pipeline = buildPipeline(providers);
  const logger = new ExecutionLogger();
  const orchestrator = new Orchestrator(logger);

  const context: AgentContext = {
    userInput: 'I want to travel next month',
  };

  const result = await orchestrator.execute(pipeline, context);

  console.log('\n📬 Final Response:');
  console.log(result.context.formattedResponse || result.message);
}

// =============================================================================
// Run all test cases
// =============================================================================

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   🛫 Travel Planning Assistant — Agent Orchestrator       ║');
  console.log('║   Dashverse Problem Statement 003                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  await testCase1_HappyPath();
  await testCase2_PartialFailure();
  await testCase3_AllFail();
  await testCase4_MissingInfo();

  console.log('\n' + '═'.repeat(60));
  console.log('✅ All test cases completed.');
  console.log('═'.repeat(60));
}

main().catch(console.error);
