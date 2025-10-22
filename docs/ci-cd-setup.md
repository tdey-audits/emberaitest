# CI/CD Setup Guide

This guide explains how to set up and customize the CI/CD pipeline for Vibekit agents, including how to add CI tests for new agents.

## Table of Contents

- [Overview](#overview)
- [GitHub Actions Workflow](#github-actions-workflow)
- [Adding CI for New Agents](#adding-ci-for-new-agents)
- [Required Secrets](#required-secrets)
- [Local CI Testing](#local-ci-testing)
- [Best Practices](#best-practices)
- [Troubleshooting CI](#troubleshooting-ci)

## Overview

Vibekit uses GitHub Actions for continuous integration and deployment. The CI pipeline automatically runs on:

- Every push to `main` or `master` branch
- Every pull request to `main` or `master` branch
- Manual workflow dispatch

### CI Pipeline Stages

1. **Checkout**: Clones the repository and dependencies
2. **Setup**: Installs Node.js, pnpm, and Foundry
3. **Lint**: Runs ESLint on all packages
4. **Build**: Compiles TypeScript to JavaScript
5. **Test Setup**: Starts Anvil local blockchain
6. **Test Execution**: Runs unit and integration tests
7. **Cleanup**: Shuts down test infrastructure

## GitHub Actions Workflow

The main CI workflow is defined in `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    environment: ci
    steps:
      # ... (see .github/workflows/ci.yml for complete configuration)
```

### Key Features

- **Environment**: Uses `ci` environment for secret management
- **Node.js**: Version 22 (matching development)
- **pnpm**: Version 10 for package management
- **Foundry**: For Ethereum smart contract testing
- **Anvil**: Local blockchain for integration tests

## Adding CI for New Agents

When you create a new agent, follow these steps to integrate it into the CI pipeline:

### Step 1: Write Integration Tests

Create integration tests in your agent's directory:

```typescript
// templates/my-new-agent/test/integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fetch from 'node-fetch';

describe('My New Agent Integration Tests', () => {
  const AGENT_URL = process.env.AGENT_URL || 'http://localhost:3020';
  
  beforeAll(async () => {
    // Wait for agent to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  });
  
  describe('Health Check', () => {
    it('should respond to health check', async () => {
      const response = await fetch(`${AGENT_URL}/health`);
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.status).toBe('ok');
    });
  });
  
  describe('Agent Functionality', () => {
    it('should handle basic queries', async () => {
      const response = await fetch(`${AGENT_URL}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'test query',
        }),
      });
      
      expect(response.ok).toBe(true);
    });
    
    // Add more agent-specific tests
  });
  
  afterAll(async () => {
    // Cleanup if needed
  });
});
```

### Step 2: Configure Test Script

Add test scripts to your agent's `package.json`:

```json
{
  "name": "my-new-agent",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest watch",
    "test:int": "vitest run --testPathPattern=integration"
  }
}
```

### Step 3: Update Root Test Script (if needed)

If your agent requires special test setup, update the root `package.json`:

```json
{
  "scripts": {
    "test": "pnpm run test:vitest && pnpm run test:anvil",
    "test:my-agent": "pnpm --filter my-new-agent run test"
  }
}
```

### Step 4: Add Required Secrets

If your agent needs API keys or secrets:

1. Go to GitHub repository Settings
2. Navigate to Secrets and variables → Actions
3. Click "New repository secret"
4. Add required secrets:
   - `MY_AGENT_API_KEY`
   - `MY_AGENT_CONFIG`
   - etc.

### Step 5: Update CI Workflow (if needed)

If your agent requires additional CI configuration, update `.github/workflows/ci.yml`:

```yaml
- name: Run tests
  working-directory: ./typescript
  env:
    # Existing secrets
    OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
    MNEMONIC: ${{ secrets.MNEMONIC }}
    # Add your agent's secrets
    MY_AGENT_API_KEY: ${{ secrets.MY_AGENT_API_KEY }}
    MY_AGENT_CONFIG: ${{ secrets.MY_AGENT_CONFIG }}
  run: pnpm run test
```

### Step 6: Add Agent to Test Matrix (Optional)

For parallel testing of multiple agents:

```yaml
jobs:
  test:
    strategy:
      matrix:
        agent:
          - lending-agent-no-wallet
          - swapping-agent-no-wallet
          - my-new-agent
    steps:
      - name: Test ${{ matrix.agent }}
        run: pnpm --filter ${{ matrix.agent }} run test
```

## Required Secrets

The CI pipeline requires these secrets to be configured in GitHub:

### Core Secrets

- **`GH_PAT`**: GitHub Personal Access Token (for cloning private repositories)
- **`MNEMONIC`**: Test wallet mnemonic phrase
- **`OPENAI_API_KEY`**: OpenAI API key for LLM features

### Provider API Keys

- **`OPENROUTER_API_KEY`**: OpenRouter API key
- **`COINGECKO_API_KEY`**: CoinGecko API key
- **`SQUID_INTEGRATOR_ID`**: Squid integrator ID
- **`DUNE_API_KEY`**: Dune Analytics API key
- **`ALLORA_API_KEY`**: Allora API key
- **`QUICKNODE_API_KEY`**: QuickNode API key
- **`QUICKNODE_SUBDOMAIN`**: QuickNode subdomain

### Testnet Configuration

- **`DUST_CHAIN_RECEIVER_ADDRESS`**: Test receiver address
- **`DUST_ACCOUNT_PRIVATE_KEY`**: Test account private key
- **`DUST_CHAIN_ID`**: Test chain ID

### Adding New Secrets

```bash
# Using GitHub CLI
gh secret set MY_AGENT_API_KEY --body "your-api-key-here"

# Or via GitHub UI
# 1. Go to Settings → Secrets and variables → Actions
# 2. Click "New repository secret"
# 3. Enter name and value
# 4. Click "Add secret"
```

## Local CI Testing

Test your CI pipeline locally before pushing:

### Prerequisites

```bash
# Install dependencies
brew install gh         # GitHub CLI
brew install act        # Local GitHub Actions runner (optional)
```

### Run Full CI Pipeline Locally

```bash
cd typescript

# 1. Install dependencies
pnpm install

# 2. Validate environment
./scripts/validate-env.sh

# 3. Run linter
pnpm lint

# 4. Build all packages
pnpm build

# 5. Start test infrastructure
pnpm start:anvil &
ANVIL_PID=$!

# 6. Wait for Anvil to be ready
sleep 5

# 7. Run tests
pnpm test

# 8. Cleanup
kill $ANVIL_PID
```

### Run Specific Agent Tests

```bash
# Test single agent
pnpm --filter my-new-agent run test

# Test with coverage
pnpm --filter my-new-agent run test:coverage

# Test in watch mode (for development)
pnpm --filter my-new-agent run test:watch
```

### Use Act for GitHub Actions Locally

```bash
# Install act
brew install act

# Run CI workflow locally
act -j build

# Run with secrets
act -j build --secret-file .env.secrets

# Run specific event
act pull_request
```

## Best Practices

### Test Organization

1. **Separate Unit and Integration Tests**:
   ```
   my-agent/
   ├── src/
   ├── test/
   │   ├── unit/
   │   │   ├── utils.test.ts
   │   │   └── handlers.test.ts
   │   └── integration/
   │       ├── api.test.ts
   │       └── e2e.test.ts
   ```

2. **Use Descriptive Test Names**:
   ```typescript
   describe('Swap Agent', () => {
     describe('Token Swapping', () => {
       it('should successfully swap USDC to WETH on Arbitrum', async () => {
         // ...
       });
       
       it('should handle insufficient balance error gracefully', async () => {
         // ...
       });
     });
   });
   ```

3. **Mock External Dependencies**:
   ```typescript
   import { vi } from 'vitest';
   
   vi.mock('./external-api', () => ({
     fetchPrice: vi.fn(() => Promise.resolve({ price: 100 })),
   }));
   ```

### CI Performance

1. **Cache Dependencies**:
   ```yaml
   - uses: actions/cache@v3
     with:
       path: |
         ~/.pnpm-store
         node_modules
       key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}
   ```

2. **Parallelize Tests**:
   ```yaml
   strategy:
     matrix:
       agent: [lending, swapping, liquidity]
   ```

3. **Fail Fast**:
   ```yaml
   strategy:
     fail-fast: true
     matrix:
       agent: [lending, swapping]
   ```

### Security

1. **Never Commit Secrets**:
   ```bash
   # Add to .gitignore
   .env
   .env.*
   !.env.example
   ```

2. **Use Minimal Permissions**:
   ```yaml
   permissions:
     contents: read
     pull-requests: write
   ```

3. **Rotate Secrets Regularly**:
   - Update secrets every 90 days
   - Use different secrets for dev/staging/prod
   - Audit secret usage regularly

### Debugging Failed CI

1. **Enable Debug Logging**:
   ```yaml
   - name: Run tests
     run: DEBUG=* pnpm test
   ```

2. **Upload Artifacts on Failure**:
   ```yaml
   - uses: actions/upload-artifact@v3
     if: failure()
     with:
       name: test-logs
       path: |
         typescript/logs/
         typescript/anvil_server.log
   ```

3. **Add Step Summaries**:
   ```yaml
   - name: Test Summary
     if: always()
     run: |
       echo "## Test Results" >> $GITHUB_STEP_SUMMARY
       echo "✅ Tests passed" >> $GITHUB_STEP_SUMMARY
   ```

## Troubleshooting CI

### Common CI Failures

#### 1. Linting Errors

```bash
# Error: ESLint found issues
Error: Process completed with exit code 1

# Solution: Fix linting issues locally
pnpm lint:fix
git add .
git commit -m "fix: resolve linting issues"
```

#### 2. Build Failures

```bash
# Error: TypeScript compilation failed
TSError: ⨯ Unable to compile TypeScript

# Solution: Fix type errors
pnpm build
# Fix reported errors
git commit -am "fix: resolve type errors"
```

#### 3. Test Timeouts

```bash
# Error: Test exceeded timeout
Error: Timeout - Async callback was not invoked within the 5000 ms timeout

# Solution: Increase timeout or optimize test
it('should complete operation', async () => {
  // ...
}, 30000); // 30 second timeout
```

#### 4. Anvil Not Ready

```bash
# Error: Connection refused to localhost:8545
Error: connect ECONNREFUSED 127.0.0.1:8545

# Solution: Increase wait time in CI
until grep -q "You can run integration tests now" anvil_server.log; do
  sleep 1
done
```

#### 5. Missing Secrets

```bash
# Error: Missing required environment variable
Error: OPENAI_API_KEY is not defined

# Solution: Add secret in GitHub Settings
gh secret set OPENAI_API_KEY --body "sk-..."
```

### Debugging Steps

1. **Check CI Logs**:
   - Go to Actions tab in GitHub
   - Click on failed workflow
   - Expand failed step
   - Look for error messages

2. **Reproduce Locally**:
   ```bash
   # Run exact CI commands
   pnpm install --frozen-lockfile
   pnpm lint
   pnpm build
   pnpm test
   ```

3. **Check Dependencies**:
   ```bash
   # Verify lockfile is up to date
   pnpm install
   git diff pnpm-lock.yaml
   ```

4. **Review Recent Changes**:
   ```bash
   # What changed in last commit?
   git show HEAD
   
   # What changed in PR?
   git diff main...feature-branch
   ```

### Getting Help

If CI issues persist:

1. **Check Workflow Runs**: Review successful runs for comparison
2. **Search Issues**: Look for similar problems in GitHub Issues
3. **Ask Community**: Post in Discord or Telegram with:
   - Link to failed workflow run
   - Error messages
   - Recent changes
   - Steps already tried

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Vitest Documentation](https://vitest.dev/)
- [pnpm CI Guide](https://pnpm.io/continuous-integration)
- [Foundry Testing Guide](https://book.getfoundry.sh/forge/tests)
