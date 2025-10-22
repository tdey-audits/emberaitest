# Troubleshooting: Risk Management Safety Controls

Branch: risk-management-safety-controls-pos-sizing-drawdown-circuit-breakers-kill-switch-cli-api-tests-docs | Updated: 2024-10-22T21:05:00Z

## Current Focus

Working on: Establish risk management modules (position sizing, drawdown, stop loss, circuit breakers, kill switch, CLI/API controls)
Approach: Design RiskManager module integrated with workflow runtime, expose control via server API & CLI, add unit/integration tests, update docs.

## Evidence Collected

- No existing risk management logic; guardrails available via agent card extensions but not enforced.
- Workflow runtime dispatch handled in `WorkflowHandler`; tool interactions via `ToolHandler`.
- CLI architecture supports command dispatch; can add new commands.
- Test utilities (`createTestConfigWorkspace`, `createTestA2AServer`) provide scaffolding for integration testing.

## Assumptions

- Risk guard configuration will be defined under agent card guardrails (e.g., `guardrails.risk`).
- Workflows requiring enforcement will specify notional exposure fields (`notionalUsd`, etc.).
- Circuit breaker triggers can be simulated via explicit API calls providing volatility metrics.

## Attempts Log

2024-10-22T20:30:00Z Attempt 1: Repository exploration and documentation review → Completed.
2024-10-22T21:05:00Z Attempt 2: Draft architecture for RiskManager module & integration touch-points → In progress.

## Discovered Patterns

- Guardrail configs propagate via agent card capabilities extensions (URI `urn:agent:guardrails`).
- Workflow dispatch already surfaces lifecycle events (artifact/update/done/error) suitable for hook-in.

## Blockers/Questions

- None identified yet.

## Resolution (when solved)

### Root Cause

### Solution

### Learnings
