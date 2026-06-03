# Agent Orchestrator — Travel Planning Assistant

**Dashverse Problem Statement 003: Conversational Agent Chain with Parallel Execution**

A multi-agent orchestration system that processes natural language travel requests through a chain of specialized agents, with parallel execution for independent tasks and graceful error handling.

## How to Run

```bash
# 1. Install dependencies
npm install

# 2. Build TypeScript
npm run build

# 3. Run all test cases
npm start

# Or build + run in one command:
npm run dev
```

**Requirements:** Node.js 18+ and npm.

---

## Agent Architecture

```
User Input: "Book me a flight to Paris next Friday"

┌─────────────────────────────────────────────────────────────┐
│ Phase 1: SEQUENTIAL                                         │
│                                                             │
│  ┌──────────────┐      ┌────────────────┐                   │
│  │ ParserAgent  │ ───▶ │ ValidatorAgent │                   │
│  │   (~50ms)    │      │    (~20ms)     │                   │
│  └──────────────┘      └────────┬───────┘                   │
│                                 │                            │
│  Parser extracts:               │ Validator checks:          │
│  • destination = "Paris"        │ • All required fields?     │
│  • date = "2026-06-06"          │ • Date in future?          │
│  • origin = "New York"          │ • Valid travel type?       │
│  • type = "flight"              │                            │
└─────────────────────────────────┼────────────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       ▼                       │
┌─────────┴───────────────────────────────────────────────┴───┐
│ Phase 2: PARALLEL                                           │
│                                                             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌───────────────┐ │
│  │ ProviderAgent   │ │ ProviderAgent   │ │ ProviderAgent │ │
│  │ (Air France)    │ │ (Delta)         │ │ (United)      │ │
│  │   ~280ms        │ │   ~150ms        │ │   ~220ms      │ │
│  │ ──────────────  │ │ ──────────────  │ │ ────────────  │ │
│  │ $450, 7h 30m    │ │ $520, 9h 15m    │ │ $480, 8h 45m  │ │
│  └────────┬────────┘ └────────┬────────┘ └──────┬────────┘ │
│           │                   │                  │          │
│           └───────────┬───────┴──────────────────┘          │
│                       ▼                                     │
│  All 3 run CONCURRENTLY via Promise.allSettled              │
│  Total wait ≈ max(280, 150, 220) = ~280ms                  │
│  (NOT 650ms if run sequentially)                            │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: SEQUENTIAL                                         │
│                                                             │
│  ┌──────────────────┐      ┌────────────────┐               │
│  │ AggregatorAgent  │ ───▶ │ FormatterAgent │               │
│  │    (~30ms)       │      │    (~10ms)     │               │
│  └──────────────────┘      └────────────────┘               │
│                                                             │
│  Aggregator:                Formatter:                      │
│  • Collects all results     • Builds user-facing response   │
│  • Picks cheapest flight    • Shows all options sorted      │
│  • Notes any failures       • Adds failure warnings         │
└─────────────────────────────────────────────────────────────┘
```

---

## Design Decisions & Trade-offs

### Why 6 Agents?

| Agent | Responsibility | Why Separate? |
|-------|---------------|---------------|
| **ParserAgent** | NLP extraction from natural language | Can be swapped for LLM-based parser without touching validation |
| **ValidatorAgent** | Business rule validation | Validation rules change with product requirements, not NLP tech |
| **ProviderAgent ×3** | Mock flight provider API calls | Independent, parameterized — same code, different config |
| **AggregatorAgent** | Decision logic (pick best option) | Selection criteria may change (cheapest → fastest → preferred airline) |
| **FormatterAgent** | Presentation formatting | Output format may change (CLI → API → chatbot) independently |

**Why not combine Parser + Validator?**
- Different change rates: parser changes with NLP technology; validator changes with business rules.
- Different testing needs: parser needs NLP test cases; validator needs boundary/edge case tests.
- Clear debugging: if a request fails, logs show exactly WHERE it failed.

**Why not combine Aggregator + Formatter?**
- Aggregation is decision logic ("which is best?") — may become complex (weighted scoring, user preferences).
- Formatting is presentation ("how to show it?") — may need different formats for CLI/API/chatbot.
- Single Responsibility Principle: each agent does exactly one thing well.

### Which Agents Run in Parallel and Why?

**Parallel: The 3 ProviderAgents**
- They are **completely independent** — no provider needs data from another.
- They all need the SAME input (destination, date, origin) from the ValidatorAgent.
- Running them in parallel cuts total wait time from ~650ms to ~280ms (~57% savings).

**Sequential: Everything else**
- ParserAgent → ValidatorAgent: Validator NEEDS parser output (data dependency).
- AggregatorAgent: NEEDS all provider results (waits for parallel phase to complete).
- FormatterAgent: NEEDS aggregation output (the selected best option).

### How We Handle Parallel Agent Failures

| Scenario | Behavior |
|----------|----------|
| 3/3 succeed | Normal flow — pick cheapest flight |
| 2/3 succeed | Continue with 2 results, note partial failure |
| 1/3 succeed | Continue with 1 result, show warning |
| 0/3 succeed | **Abort** — return meaningful error (can't show nothing) |

**Why best-effort over fail-fast?**
- Users would rather see 2 options than none.
- The missing provider can be noted ("not all providers responded").
- Fail-fast penalizes users for infrastructure issues outside their control.

### Technology Choice: TypeScript + Promise.allSettled

| Choice | Alternative | Why This One? |
|--------|-------------|---------------|
| `Promise.allSettled` | `Promise.all` | `.all` fails fast — if ANY promise rejects, it aborts. `.allSettled` waits for ALL, which we need for best-effort. |
| `Object.freeze` | Deep clone | Freeze is cheaper and catches mutations at runtime (throws in strict mode). Prevents race conditions in parallel agents. |
| Per-agent timeout | Global timeout | Different providers may have different SLAs. Per-agent timeout is more granular. |
| No external deps | Express, FastAPI | Problem says CLI is fine. Zero deps = easy to review, no version conflicts. |

### Immutable Context Pattern

```typescript
// Each agent receives frozen context
const frozenContext = Object.freeze({ ...context });
const result = await agent.execute(frozenContext);

// Agent returns a NEW context (does not mutate input)
return { status: 'success', context: { ...context, newField: 'value' } };
```

**Why immutable?**
- Parallel agents share the same input context snapshot.
- If agents could mutate context, we'd have race conditions.
- Each agent's additions are merged AFTER all parallel agents complete.

---

## Assumptions

1. **Mock data**: All flight data is randomly generated. Real implementation would call actual APIs.
2. **Default origin**: If no origin city is specified, defaults to "New York".
3. **Date parsing**: Handles relative dates ("next Friday") and explicit dates ("December 1st"). Ambiguous dates ("next month") are treated as missing.
4. **Single travel type**: Only flights are implemented. The architecture supports hotels/cars by adding new provider types.
5. **No persistence**: Results are not stored. Production would log to a database.

---

## Project Structure

```
solution/
├── src/
│   ├── types.ts              ← Core interfaces (Agent, Context, PipelineStep)
│   ├── agents/
│   │   ├── parser.ts         ← ParserAgent: NLP extraction
│   │   ├── validator.ts      ← ValidatorAgent: field validation
│   │   ├── provider.ts       ← ProviderAgent: mock flight API (parameterized)
│   │   ├── aggregator.ts     ← AggregatorAgent: result selection
│   │   └── formatter.ts      ← FormatterAgent: user-facing output
│   ├── orchestrator.ts       ← Core engine: sequential + parallel execution
│   ├── logger.ts             ← Execution trace & observability
│   └── main.ts               ← Entry point: runs all 4 test cases
├── package.json
├── tsconfig.json
└── README.md                 ← This file
```

---

## Extensibility

### Adding a New Provider
```typescript
// Just add a config object — no new code needed:
{ name: 'Emirates', basePrice: 600, baseDurationMs: 200, failureRate: 0.1 }
```

### Adding Hotel Search
```typescript
// Create HotelProviderAgent implementing the same Agent interface
// Add to the parallel step alongside flight providers
// Aggregator handles both types via the ProviderResult union
```

### Swapping the Parser for an LLM
```typescript
// Create LLMParserAgent implementing the same Agent interface
// Replace ParserAgent in the pipeline — everything else stays the same
```

---

## Example Output

See the output of `npm start` which runs all 4 test cases with full execution traces showing:
- Which agents ran sequentially vs. in parallel
- Execution timing for each agent
- Time savings from parallel execution
- Graceful handling of failures and missing information
