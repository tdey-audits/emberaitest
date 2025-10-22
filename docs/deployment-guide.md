# Vibekit Deployment Guide

This guide covers the complete deployment process for Vibekit agents across different environments: development, paper trading (testnet), and production.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Development Deployment](#development-deployment)
- [Paper Trading Deployment (Testnet)](#paper-trading-deployment-testnet)
- [Production Deployment](#production-deployment)
- [Healthchecks and Monitoring](#healthchecks-and-monitoring)
- [Emergency Procedures](#emergency-procedures)
- [CI/CD Pipeline](#cicd-pipeline)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before deploying Vibekit, ensure you have:

### Required Software

- **Docker Desktop** v2.24+ with Docker Compose ([Download](https://www.docker.com/products/docker-desktop/))
  - **For M-series Mac users**: Install using the official [dmg package](https://docs.docker.com/desktop/setup/install/mac-install/) rather than Homebrew
- **Node.js** 22.0.0 or higher
- **pnpm** 10.7.0 or higher (`corepack enable` or `npm install -g pnpm`)
- **Git** for version control

### Required Accounts and API Keys

You'll need API keys from at least one AI provider:

- **OpenAI**: [Get API key](https://platform.openai.com/api-keys)
- **OpenRouter**: [Get API key](https://openrouter.ai/keys)
- **xAI**: [Get API key](https://console.x.ai/)
- **Groq**: [Get API key](https://console.groq.com/keys)

Optional but recommended:

- **QuickNode**: For reliable RPC access ([Sign up](https://www.quicknode.com/))
- **Allora**: For price prediction capabilities ([Get API key](https://allora.ai/))
- **CoinGecko**: For enhanced market data ([Get API key](https://www.coingecko.com/en/api))

## Environment Configuration

### 1. Clone the Repository

```bash
git clone https://github.com/EmberAGI/arbitrum-vibekit.git
cd arbitrum-vibekit/typescript
```

### 2. Create Environment File

```bash
cp .env.example .env
```

### 3. Configure Environment Variables

Edit `.env` and set the required values:

```bash
# Generate a secure secret (required)
AUTH_SECRET=$(openssl rand -base64 32)

# Set at least one AI provider API key (required)
OPENAI_API_KEY=sk-your-key-here
# OR
OPENROUTER_API_KEY=sk-or-v1-your-key-here
# OR
XAI_API_KEY=xai-your-key-here
# OR
GROQ_API_KEY=gsk-your-key-here

# Blockchain RPC (required)
RPC_URL=https://arbitrum.llamarpc.com

# For production/paper trading with wallet features
MNEMONIC="your twelve word mnemonic phrase here"

# Optional: QuickNode for better RPC reliability
QUICKNODE_SUBDOMAIN=your-subdomain
QUICKNODE_API_KEY=your-api-key

# Optional: Additional services
ALLORA_API_KEY=your-allora-key
AGENT_CACHE_TOKENS=false
```

### 4. Validate Configuration

Before deployment, validate your environment configuration:

```bash
chmod +x scripts/validate-env.sh
./scripts/validate-env.sh
```

This script will:
- Check all required environment variables are set
- Warn about placeholder values
- Verify environment-specific requirements
- Provide clear error messages for missing configuration

## Development Deployment

Development mode is optimized for local development with hot reloading and debug logging.

### Features

- Source code mounting for hot reloading
- Debug logging enabled
- Development-friendly restart policies
- Port mapping for direct access to all services

### Deploy

```bash
# Validate environment first
./scripts/validate-env.sh

# Start all services in development mode
docker compose -f compose.dev.yaml up

# Or build from scratch
docker compose -f compose.dev.yaml up --build

# Run in detached mode (background)
docker compose -f compose.dev.yaml up -d
```

### Access Services

Once running:

- **Web Interface**: http://localhost:3000
- **Lending Agent**: http://localhost:3001
- **Swapping Agent**: http://localhost:3005
- **Quickstart Agent**: http://localhost:3007
- **DeFiSafety Agent**: http://localhost:3010
- **CoinGecko MCP Server**: http://localhost:3011
- **PostgreSQL Database**: localhost:5432

### Development Workflow

1. Make code changes in `src/` directories
2. Changes are mounted into containers via volumes
3. Services automatically reload on file changes
4. View logs: `docker compose -f compose.dev.yaml logs -f [service-name]`

### Stop Services

```bash
# Stop all services
docker compose -f compose.dev.yaml down

# Stop and remove volumes (clean slate)
docker compose -f compose.dev.yaml down -v
```

## Paper Trading Deployment (Testnet)

Paper trading mode is designed for testing with real testnet transactions before production deployment.

### Features

- Production-like builds with resource limits
- Testnet-specific environment variables
- Transaction logging and monitoring
- Cost-free testing with testnet tokens

### Prerequisites

1. **Get Testnet Tokens**:
   - Arbitrum Sepolia: [Faucet](https://faucet.quicknode.com/arbitrum/sepolia)
   - Ethereum Sepolia: [Faucet](https://sepoliafaucet.com/)

2. **Configure Testnet RPC**:
   ```bash
   # In .env, use testnet RPC
   RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
   # OR use QuickNode testnet endpoint
   RPC_URL=https://your-subdomain.arbitrum-sepolia.quiknode.pro/your-api-key/
   ```

3. **Set Testnet Wallet**:
   ```bash
   # Use a testnet-only wallet mnemonic
   MNEMONIC="your testnet wallet twelve word phrase"
   ```

### Deploy

```bash
# Validate environment (checks for testnet configuration)
NODE_ENV=paper-trading ./scripts/validate-env.sh

# Start paper trading environment
docker compose -f compose.paper-trading.yaml up --build
```

### Testing Workflow

1. **Verify Connection**:
   ```bash
   # Check if agents are connected to testnet
   docker compose -f compose.paper-trading.yaml logs swapping-agent-no-wallet | grep -i "connected\|testnet"
   ```

2. **Test Transactions**:
   - Access web interface at http://localhost:3000
   - Connect your testnet wallet
   - Execute test swaps, loans, or other operations
   - Monitor transactions on [Arbiscan Sepolia](https://sepolia.arbiscan.io/)

3. **Monitor Resource Usage**:
   ```bash
   docker stats
   ```

4. **Review Logs**:
   ```bash
   # View all logs
   docker compose -f compose.paper-trading.yaml logs -f
   
   # View specific agent
   docker compose -f compose.paper-trading.yaml logs -f lending-agent-no-wallet
   ```

### Testnet Validation Checklist

Before moving to production, verify:

- [ ] All agents start successfully
- [ ] Healthchecks pass for all services
- [ ] Can connect wallet to web interface
- [ ] Can execute test transactions on testnet
- [ ] Transactions confirm on block explorer
- [ ] Error handling works correctly
- [ ] Resource limits are appropriate
- [ ] Logs show expected behavior

## Production Deployment

Production deployment is optimized for security, performance, and reliability.

### Pre-Deployment Checklist

- [ ] All tests pass: `pnpm test`
- [ ] Linting passes: `pnpm lint`
- [ ] Build succeeds: `pnpm build`
- [ ] Environment validated: `./scripts/validate-env.sh`
- [ ] Testnet validation complete
- [ ] API keys are for production endpoints
- [ ] RPC URL points to mainnet
- [ ] MNEMONIC is for production wallet (SECURE IT!)
- [ ] AUTH_SECRET is cryptographically secure
- [ ] Database backups configured
- [ ] Monitoring and alerting set up

### Security Configuration

1. **Secure Environment Variables**:
   ```bash
   # Use environment variable management tools
   # - AWS Secrets Manager
   # - HashiCorp Vault
   # - Docker Secrets
   # - Kubernetes Secrets
   
   # Never commit .env to git
   # Add to .gitignore (already done)
   ```

2. **Database Security**:
   ```bash
   # Change default database password
   POSTGRES_PASSWORD=$(openssl rand -base64 32)
   
   # Update in compose.yml:
   environment:
     POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
   ```

3. **Network Security**:
   - Use reverse proxy (nginx, Traefik, Caddy)
   - Enable HTTPS/TLS
   - Configure firewall rules
   - Limit exposed ports

### Deploy to Production

```bash
# Validate production environment
NODE_ENV=production ./scripts/validate-env.sh

# Pull latest images (if using pre-built)
docker compose pull

# Start production services
docker compose up -d

# Monitor startup
docker compose logs -f
```

### Production Monitoring

1. **Check Service Health**:
   ```bash
   # View health status of all services
   docker compose ps
   
   # Should show "healthy" for all services
   ```

2. **Monitor Logs**:
   ```bash
   # Follow all logs
   docker compose logs -f
   
   # Filter by severity
   docker compose logs | grep -i error
   docker compose logs | grep -i warn
   ```

3. **Resource Monitoring**:
   ```bash
   # Monitor resource usage
   docker stats
   
   # Check disk usage
   docker system df
   ```

4. **Database Monitoring**:
   ```bash
   # Connect to database
   docker exec -it vibekit-db psql -U chatbot -d chatbot
   
   # Check database size
   \l+
   
   # List tables
   \dt
   ```

### Backup Procedures

1. **Database Backup**:
   ```bash
   # Create backup
   docker exec vibekit-db pg_dump -U chatbot chatbot > backup_$(date +%Y%m%d_%H%M%S).sql
   
   # Restore from backup
   docker exec -i vibekit-db psql -U chatbot chatbot < backup_20250101_120000.sql
   ```

2. **Configuration Backup**:
   ```bash
   # Backup environment file (securely!)
   tar czf vibekit-config-$(date +%Y%m%d).tar.gz .env docker-compose.yml
   
   # Store in secure location (encrypted storage)
   ```

### Updates and Maintenance

1. **Update Services**:
   ```bash
   # Pull latest code
   git pull origin main
   
   # Rebuild images
   docker compose build
   
   # Rolling update (minimal downtime)
   docker compose up -d --no-deps --build <service-name>
   
   # Or update all services
   docker compose up -d --build
   ```

2. **Database Migration**:
   ```bash
   # Backup before migration
   docker exec vibekit-db pg_dump -U chatbot chatbot > backup_pre_migration.sql
   
   # Run migration scripts (if any)
   docker exec vibekit-web-app node scripts/migrate.js
   ```

## Healthchecks and Monitoring

All services include healthchecks to monitor their status.

### Healthcheck Configuration

Each service exposes a `/health` endpoint:

```yaml
healthcheck:
  test: ["CMD", "node", "-e", "fetch('http://localhost:PORT/health').then(() => process.exit(0)).catch(() => process.exit(1))"]
  interval: 30s      # Check every 30 seconds
  timeout: 10s       # Timeout after 10 seconds
  retries: 3         # Mark unhealthy after 3 failures
  start_period: 40s  # Grace period during startup
```

### Check Service Health

```bash
# View health status
docker compose ps

# Detailed health information
docker inspect --format='{{json .State.Health}}' vibekit-lending-agent-no-wallet | jq

# View health logs
docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' vibekit-lending-agent-no-wallet
```

### Automated Monitoring

Set up monitoring with:

1. **Docker Health Events**:
   ```bash
   # Watch for health status changes
   docker events --filter 'event=health_status'
   ```

2. **Prometheus + Grafana**:
   - Use [cAdvisor](https://github.com/google/cadvisor) for container metrics
   - Configure Prometheus to scrape Docker metrics
   - Create Grafana dashboards for visualization

3. **Alerting**:
   - Configure alerts for unhealthy services
   - Set up notifications (email, Slack, PagerDuty)
   - Monitor disk space, memory, CPU usage

## Emergency Procedures

### Service Not Starting

1. **Check Logs**:
   ```bash
   docker compose logs <service-name>
   ```

2. **Verify Environment**:
   ```bash
   ./scripts/validate-env.sh
   ```

3. **Check Dependencies**:
   ```bash
   # Ensure database is running for web app
   docker compose ps db
   
   # Check network connectivity
   docker compose exec <service-name> ping db
   ```

4. **Restart Service**:
   ```bash
   docker compose restart <service-name>
   
   # Or rebuild
   docker compose up -d --force-recreate --build <service-name>
   ```

### Service Unhealthy

1. **Check Health Status**:
   ```bash
   docker inspect --format='{{json .State.Health}}' vibekit-<service-name> | jq
   ```

2. **Review Recent Logs**:
   ```bash
   docker compose logs --tail=100 <service-name>
   ```

3. **Test Health Endpoint Manually**:
   ```bash
   docker compose exec <service-name> node -e "fetch('http://localhost:PORT/health').then(r => r.text()).then(console.log)"
   ```

4. **Restart if Necessary**:
   ```bash
   docker compose restart <service-name>
   ```

### Database Issues

1. **Database Not Accessible**:
   ```bash
   # Check if database is running
   docker compose ps db
   
   # Check database logs
   docker compose logs db
   
   # Test connection
   docker compose exec db pg_isready -U chatbot
   ```

2. **Connection Pool Exhausted**:
   ```bash
   # Restart web app
   docker compose restart web
   
   # Check for connection leaks in logs
   docker compose logs web | grep -i "connection\|pool"
   ```

3. **Database Corruption**:
   ```bash
   # Stop all services
   docker compose down
   
   # Restore from backup
   docker compose up -d db
   docker exec -i vibekit-db psql -U chatbot chatbot < latest_backup.sql
   
   # Restart other services
   docker compose up -d
   ```

### Out of Memory

1. **Identify Memory Hog**:
   ```bash
   docker stats
   ```

2. **Increase Memory Limits** (in compose file):
   ```yaml
   deploy:
     resources:
       limits:
         memory: 2G
   ```

3. **Restart Service**:
   ```bash
   docker compose up -d <service-name>
   ```

### Disk Space Full

1. **Check Disk Usage**:
   ```bash
   docker system df
   df -h
   ```

2. **Clean Up**:
   ```bash
   # Remove unused images
   docker image prune -a
   
   # Remove unused volumes
   docker volume prune
   
   # Remove stopped containers
   docker container prune
   
   # Clean all (careful!)
   docker system prune -a --volumes
   ```

3. **Archive Old Logs**:
   ```bash
   # Configure log rotation in compose file
   logging:
     driver: "json-file"
     options:
       max-size: "10m"
       max-file: "3"
   ```

### Complete System Failure

1. **Stop All Services**:
   ```bash
   docker compose down
   ```

2. **Backup Critical Data**:
   ```bash
   # Backup database
   docker compose up -d db
   docker exec vibekit-db pg_dump -U chatbot chatbot > emergency_backup.sql
   docker compose down
   ```

3. **Clean Start**:
   ```bash
   # Remove all containers and volumes
   docker compose down -v
   
   # Pull latest code
   git pull origin main
   
   # Rebuild everything
   docker compose build --no-cache
   
   # Start fresh
   docker compose up -d
   ```

4. **Restore Data**:
   ```bash
   # Wait for database to be ready
   docker compose exec db pg_isready -U chatbot
   
   # Restore backup
   docker exec -i vibekit-db psql -U chatbot chatbot < emergency_backup.sql
   ```

### Rollback Deployment

1. **Identify Last Working Version**:
   ```bash
   git log --oneline -10
   ```

2. **Rollback Code**:
   ```bash
   git checkout <commit-hash>
   ```

3. **Rebuild and Deploy**:
   ```bash
   docker compose down
   docker compose build --no-cache
   docker compose up -d
   ```

4. **Verify**:
   ```bash
   docker compose ps
   docker compose logs -f
   ```

## CI/CD Pipeline

Vibekit includes a GitHub Actions CI pipeline that runs on every push and pull request.

### Current CI Pipeline

The pipeline (`.github/workflows/ci.yml`) includes:

1. **Build & Lint**:
   - Installs dependencies
   - Runs ESLint on all packages
   - Attempts TypeScript build

2. **Testing**:
   - Starts Anvil local blockchain
   - Deploys test contracts
   - Runs integration tests

3. **Environment**:
   - Ubuntu latest runner
   - Node.js 22
   - pnpm 10

### Adding New Agents to CI

When creating a new agent, ensure CI tests it properly:

1. **Add Integration Tests**:
   ```typescript
   // In your-agent/test/integration.test.ts
   import { describe, it, expect } from 'vitest';
   
   describe('Your Agent Integration', () => {
     it('should respond to health check', async () => {
       const response = await fetch('http://localhost:YOUR_PORT/health');
       expect(response.ok).toBe(true);
     });
     
     it('should handle basic requests', async () => {
       // Add agent-specific tests
     });
   });
   ```

2. **Update CI Workflow** (if needed):
   ```yaml
   # Add agent-specific environment variables
   env:
     YOUR_AGENT_API_KEY: ${{ secrets.YOUR_AGENT_API_KEY }}
   
   # Add agent-specific test command
   - name: Test your agent
     run: pnpm --filter your-agent run test
   ```

3. **Add Required Secrets**:
   - Go to GitHub repository Settings → Secrets → Actions
   - Add secrets required by your agent
   - Reference them in the workflow file

### Running CI Locally

Test CI pipeline locally before pushing:

```bash
# Install dependencies
cd typescript
pnpm install

# Run linter
pnpm lint

# Run build
pnpm build

# Run tests (requires Anvil)
pnpm start:anvil &
pnpm test
```

### CI Best Practices

1. **Keep Tests Fast**:
   - Use mocks for external services
   - Parallelize test execution
   - Cache dependencies

2. **Fail Fast**:
   - Run lint and build before tests
   - Stop on first failure in development

3. **Comprehensive Coverage**:
   - Test all critical paths
   - Include edge cases
   - Test error handling

4. **Secure Secrets**:
   - Never commit secrets
   - Use GitHub Secrets
   - Rotate secrets regularly

## Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>

# Or change port in compose file
ports:
  - 3001:3000  # Host:Container
```

#### Docker Build Fails

```bash
# Clear Docker cache
docker builder prune -a

# Rebuild without cache
docker compose build --no-cache
```

#### Slow Performance

1. **Increase Docker Resources**:
   - Docker Desktop → Settings → Resources
   - Increase CPU, Memory, Swap

2. **Optimize Images**:
   - Use multi-stage builds
   - Minimize layers
   - Use .dockerignore

3. **Enable BuildKit**:
   ```bash
   export DOCKER_BUILDKIT=1
   docker compose build
   ```

#### Container Exits Immediately

```bash
# Check exit code and logs
docker compose ps
docker compose logs <service-name>

# Run interactively for debugging
docker compose run --rm <service-name> sh
```

#### Network Issues

```bash
# Recreate networks
docker compose down
docker network prune
docker compose up -d

# Check network connectivity
docker compose exec <service-name> ping google.com
docker compose exec <service-name> ping db
```

### Getting Help

1. **Check Logs First**:
   ```bash
   docker compose logs -f
   ```

2. **Review Documentation**:
   - [README.md](../README.md)
   - [ARCHITECTURE.md](../ARCHITECTURE.md)
   - [CONTRIBUTIONS.md](../CONTRIBUTIONS.md)

3. **Community Support**:
   - [Discord](https://discord.com/invite/bgxWQ2fSBR)
   - [Telegram](https://t.me/EmberChat)
   - [GitHub Issues](https://github.com/EmberAGI/arbitrum-vibekit/issues)

4. **Include in Bug Reports**:
   - Environment details (OS, Docker version)
   - Compose file configuration
   - Complete error logs
   - Steps to reproduce
   - Environment variables (sanitized!)

## Additional Resources

- **Docker Documentation**: https://docs.docker.com/
- **Docker Compose Reference**: https://docs.docker.com/compose/compose-file/
- **Node.js Best Practices**: https://github.com/goldbergyoni/nodebestpractices
- **Production Checklist**: https://github.com/goldbergyoni/nodebestpractices#6-going-to-production-practices
