# Deployment Configuration Summary

This document provides a quick reference for all deployment-related files and configurations added to the Vibekit project.

## Files Added/Modified

### Configuration Files

1. **`typescript/compose.dev.yaml`** (NEW)
   - Docker Compose configuration for development
   - Features: Hot reloading, debug logging, source mounting
   - Usage: `pnpm deploy:dev` or `docker compose -f compose.dev.yaml up`

2. **`typescript/compose.paper-trading.yaml`** (NEW)
   - Docker Compose configuration for paper trading on testnets
   - Features: Production builds, testnet configs, resource limits
   - Usage: `pnpm deploy:paper` or `docker compose -f compose.paper-trading.yaml up`

3. **`typescript/compose.yml`** (MODIFIED)
   - Updated production Docker Compose with healthchecks for all services
   - Added healthcheck configurations for agents, web app, and database
   - Usage: `pnpm deploy:prod` or `docker compose up`

4. **`typescript/Procfile`** (NEW)
   - Process configuration for Heroku/Railway deployment
   - Defines web and agent processes
   - Automatically detected by Heroku and Railway

5. **`typescript/railway.toml`** (NEW)
   - Railway-specific deployment configuration
   - Defines build and deploy settings
   - Includes healthcheck configuration

### Scripts

6. **`typescript/scripts/validate-env.sh`** (NEW)
   - Environment validation script
   - Checks required variables, detects placeholders, validates configs
   - Usage: `pnpm validate:env` or `./scripts/validate-env.sh`
   - Exit codes: 0 = success, 1 = validation failed

### Documentation

7. **`docs/deployment-guide.md`** (NEW)
   - Comprehensive deployment guide (500+ lines)
   - Covers all environments: dev, paper trading, production
   - Includes emergency procedures, monitoring, and troubleshooting
   - Reference: [deployment-guide.md](./deployment-guide.md)

8. **`docs/ci-cd-setup.md`** (NEW)
   - Complete CI/CD pipeline documentation
   - How to add CI tests for new agents
   - Secrets management and local testing
   - Reference: [ci-cd-setup.md](./ci-cd-setup.md)

9. **`docs/deployment-platforms.md`** (NEW)
   - Platform-specific deployment guides
   - Covers Railway, Heroku, AWS ECS, Google Cloud Run, DigitalOcean, VPS
   - Includes comparison matrix and recommendations
   - Reference: [deployment-platforms.md](./deployment-platforms.md)

10. **`README.md`** (MODIFIED)
    - Added new "Deployment" section
    - Quick reference to deployment commands
    - Links to comprehensive guides

### Package Scripts

11. **`typescript/package.json`** (MODIFIED)
    - Added deployment convenience scripts:
      - `pnpm deploy:dev` - Development deployment
      - `pnpm deploy:paper` - Paper trading with validation
      - `pnpm deploy:prod` - Production with validation
      - `pnpm validate:env` - Environment validation

## Quick Reference

### Deployment Commands

```bash
# Navigate to typescript directory
cd typescript

# Validate environment configuration
pnpm validate:env

# Deploy to development
pnpm deploy:dev

# Deploy to paper trading (testnet)
pnpm deploy:paper

# Deploy to production
pnpm deploy:prod
```

### Docker Compose Commands

```bash
# Development
docker compose -f compose.dev.yaml up
docker compose -f compose.dev.yaml down

# Paper Trading
docker compose -f compose.paper-trading.yaml up
docker compose -f compose.paper-trading.yaml down

# Production
docker compose up -d
docker compose down

# View logs
docker compose logs -f [service-name]

# Check health status
docker compose ps
```

### Environment Setup

```bash
# Copy example environment file
cp .env.example .env

# Edit with your values
nano .env

# Generate secure secrets
AUTH_SECRET=$(openssl rand -base64 32)

# Validate configuration
./scripts/validate-env.sh
```

## Healthcheck Configuration

All services now include healthchecks:

```yaml
healthcheck:
  test: ["CMD", "node", "-e", "fetch('http://localhost:PORT/health')..."]
  interval: 30s      # Check every 30 seconds
  timeout: 10s       # Timeout after 10 seconds
  retries: 3         # Mark unhealthy after 3 failures
  start_period: 40s  # Grace period during startup (60s for web)
```

### Healthcheck Endpoints

- Lending Agent: `http://localhost:3001/health`
- Swapping Agent: `http://localhost:3005/health`
- Quickstart Agent: `http://localhost:3007/health`
- DeFiSafety Agent: `http://localhost:3010/health`
- CoinGecko MCP: `http://localhost:3011/health`
- Web App: `http://localhost:3000/health`
- Database: PostgreSQL `pg_isready` check

## Environment Variables

### Required

- `AUTH_SECRET` - Authentication secret (generate with `openssl rand -base64 32`)
- One of:
  - `OPENAI_API_KEY`
  - `OPENROUTER_API_KEY`
  - `XAI_API_KEY`
  - `GROQ_API_KEY`
- `RPC_URL` - Blockchain RPC endpoint
- `EMBER_ENDPOINT` - Ember MCP endpoint

### Optional

- `MNEMONIC` - Wallet mnemonic (required for wallet features)
- `QUICKNODE_API_KEY` / `QUICKNODE_SUBDOMAIN` - QuickNode RPC
- `ALLORA_API_KEY` - Allora integration
- `AGENT_CACHE_TOKENS` - Token caching
- `MCP_TOOL_TIMEOUT_MS` - MCP timeout
- `NODE_ENV` - Environment type (development/paper-trading/production)

## Deployment Environments

### Development

- **Purpose**: Local development with hot reloading
- **Config**: `compose.dev.yaml`
- **Features**: Debug logging, source mounting, development builds
- **Command**: `pnpm deploy:dev`

### Paper Trading

- **Purpose**: Testnet testing with real transactions
- **Config**: `compose.paper-trading.yaml`
- **Features**: Production builds, resource limits, testnet configs
- **Command**: `pnpm deploy:paper`
- **Requirements**: Testnet RPC URL, testnet wallet with funds

### Production

- **Purpose**: Mainnet deployment
- **Config**: `compose.yml`
- **Features**: Optimized builds, security hardening, healthchecks
- **Command**: `pnpm deploy:prod`
- **Requirements**: Production API keys, mainnet RPC, secure wallet

## CI/CD Pipeline

### GitHub Actions Workflow

Location: `.github/workflows/ci.yml`

**Stages**:
1. Checkout and setup (Node.js 22, pnpm 10, Foundry)
2. Lint (ESLint on all packages)
3. Build (TypeScript compilation)
4. Test setup (Start Anvil blockchain)
5. Test execution (Unit and integration tests)
6. Cleanup

**Triggers**:
- Push to main/master
- Pull requests to main/master
- Manual workflow dispatch

**Adding New Agent CI**:
1. Write integration tests in agent's `test/` directory
2. Add test script to agent's `package.json`
3. Add required secrets to GitHub repository settings
4. Update CI workflow if needed (see ci-cd-setup.md)

## Platform Support

Vibekit can be deployed to:

- ✅ Docker Compose (Recommended for all environments)
- ✅ Railway (Simple deployment with auto-scaling)
- ✅ Heroku (Platform-as-a-Service)
- ✅ AWS ECS (Enterprise container orchestration)
- ✅ Google Cloud Run (Serverless containers)
- ✅ DigitalOcean App Platform (Balanced approach)
- ✅ Self-Hosted VPS (Full control)

See [deployment-platforms.md](./deployment-platforms.md) for detailed platform-specific guides.

## Monitoring and Health

### Check Service Health

```bash
# View health status
docker compose ps

# Detailed health information
docker inspect --format='{{json .State.Health}}' vibekit-lending-agent-no-wallet | jq

# View health logs
docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' vibekit-web-app
```

### Monitor Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f lending-agent-no-wallet

# Filter by level
docker compose logs | grep -i error
docker compose logs | grep -i warn
```

### Resource Monitoring

```bash
# Container stats
docker stats

# Disk usage
docker system df

# Database monitoring
docker exec -it vibekit-db psql -U chatbot -d chatbot
```

## Emergency Procedures

Quick reference for common issues:

### Service Won't Start

```bash
# Check logs
docker compose logs <service-name>

# Validate environment
./scripts/validate-env.sh

# Restart service
docker compose restart <service-name>

# Rebuild if needed
docker compose up -d --force-recreate --build <service-name>
```

### Service Unhealthy

```bash
# Check health status
docker inspect <container-name> | jq '.State.Health'

# Test health endpoint
curl http://localhost:PORT/health

# Restart service
docker compose restart <service-name>
```

### Database Issues

```bash
# Check database
docker compose ps db
docker compose logs db

# Test connection
docker compose exec db pg_isready -U chatbot

# Backup database
docker exec vibekit-db pg_dump -U chatbot chatbot > backup.sql

# Restore database
docker exec -i vibekit-db psql -U chatbot chatbot < backup.sql
```

### Complete System Failure

```bash
# Stop everything
docker compose down

# Clean start
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

See [deployment-guide.md](./deployment-guide.md) for detailed emergency procedures.

## Best Practices

### Before Deployment

1. ✅ Validate environment: `pnpm validate:env`
2. ✅ Run tests: `pnpm test`
3. ✅ Run linter: `pnpm lint`
4. ✅ Build successfully: `pnpm build`
5. ✅ Test on paper trading first
6. ✅ Backup existing data
7. ✅ Review recent changes

### Security

1. ✅ Use strong `AUTH_SECRET` (32+ bytes)
2. ✅ Never commit `.env` files
3. ✅ Rotate secrets regularly
4. ✅ Use separate keys for dev/staging/prod
5. ✅ Enable HTTPS/TLS in production
6. ✅ Configure firewall rules
7. ✅ Use non-root user in containers

### Monitoring

1. ✅ Set up healthcheck monitoring
2. ✅ Configure log aggregation
3. ✅ Monitor resource usage
4. ✅ Set up alerts for failures
5. ✅ Regular database backups
6. ✅ Document incident response

## Additional Resources

- [Main README](../README.md) - Project overview and quickstart
- [Deployment Guide](./deployment-guide.md) - Comprehensive deployment instructions
- [CI/CD Setup](./ci-cd-setup.md) - Continuous integration documentation
- [Deployment Platforms](./deployment-platforms.md) - Platform-specific guides
- [Architecture](../ARCHITECTURE.md) - System architecture
- [Contributions](../CONTRIBUTIONS.md) - Contributing guidelines

## Support

- **Discord**: https://discord.com/invite/bgxWQ2fSBR
- **Telegram**: https://t.me/EmberChat
- **GitHub Issues**: https://github.com/EmberAGI/arbitrum-vibekit/issues
- **Documentation**: https://docs.emberai.xyz/vibekit/introduction
