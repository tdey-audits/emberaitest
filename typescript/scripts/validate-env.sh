#!/bin/bash
# Environment Validation Script
# Validates that all required environment variables are set before deployment

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track validation status
VALIDATION_FAILED=0

echo "=================================="
echo "Environment Validation"
echo "=================================="
echo ""

# Function to check if a variable is set
check_var() {
    local var_name=$1
    local var_value="${!var_name}"
    local is_required=$2
    
    if [ -z "$var_value" ]; then
        if [ "$is_required" = "true" ]; then
            echo -e "${RED}✗ $var_name is not set (REQUIRED)${NC}"
            VALIDATION_FAILED=1
        else
            echo -e "${YELLOW}⚠ $var_name is not set (optional)${NC}"
        fi
    else
        echo -e "${GREEN}✓ $var_name is set${NC}"
    fi
}

# Function to check if a variable contains a placeholder value
check_placeholder() {
    local var_name=$1
    local var_value="${!var_name}"
    local placeholder=$2
    
    if [ "$var_value" = "$placeholder" ]; then
        echo -e "${RED}✗ $var_name contains placeholder value '$placeholder' - please update${NC}"
        VALIDATION_FAILED=1
    fi
}

echo "Checking core environment variables..."
echo ""

# Core required variables
check_var "AUTH_SECRET" "true"
check_placeholder "AUTH_SECRET" "****"

# AI Provider API Keys (at least one is required)
echo ""
echo "Checking AI provider API keys (at least one required)..."
if [ -z "$OPENAI_API_KEY" ] && [ -z "$OPENROUTER_API_KEY" ] && [ -z "$XAI_API_KEY" ] && [ -z "$GROQ_API_KEY" ]; then
    echo -e "${RED}✗ No AI provider API key is set. At least one of OPENAI_API_KEY, OPENROUTER_API_KEY, XAI_API_KEY, or GROQ_API_KEY must be set${NC}"
    VALIDATION_FAILED=1
else
    check_var "OPENAI_API_KEY" "false"
    check_var "OPENROUTER_API_KEY" "false"
    check_var "XAI_API_KEY" "false"
    check_var "GROQ_API_KEY" "false"
fi

# Check for placeholder values in API keys
if [ ! -z "$OPENAI_API_KEY" ]; then
    check_placeholder "OPENAI_API_KEY" "sk-placeholder-key"
fi
if [ ! -z "$XAI_API_KEY" ]; then
    check_placeholder "XAI_API_KEY" "****"
fi
if [ ! -z "$GROQ_API_KEY" ]; then
    check_placeholder "GROQ_API_KEY" "****"
fi

echo ""
echo "Checking blockchain configuration..."
check_var "RPC_URL" "true"
check_var "MNEMONIC" "false"

echo ""
echo "Checking MCP configuration..."
check_var "EMBER_ENDPOINT" "true"

echo ""
echo "Checking optional API keys..."
check_var "QUICKNODE_SUBDOMAIN" "false"
check_var "QUICKNODE_API_KEY" "false"
check_var "ALLORA_API_KEY" "false"
check_var "AGENT_CACHE_TOKENS" "false"
check_var "MCP_TOOL_TIMEOUT_MS" "false"

# Environment-specific checks
echo ""
echo "Checking environment type..."
ENV_TYPE="${NODE_ENV:-production}"
echo "Environment: $ENV_TYPE"

if [ "$ENV_TYPE" = "production" ]; then
    echo ""
    echo "Production environment detected - performing additional checks..."
    
    # In production, we should have a proper MNEMONIC or wallet setup
    if [ -z "$MNEMONIC" ]; then
        echo -e "${YELLOW}⚠ MNEMONIC not set in production - ensure wallet is configured${NC}"
    fi
    
    # Check database configuration for web app
    if [ -z "$POSTGRES_URL" ]; then
        echo -e "${YELLOW}⚠ POSTGRES_URL not set - web app may use default${NC}"
    else
        check_var "POSTGRES_URL" "false"
    fi
fi

if [ "$ENV_TYPE" = "development" ]; then
    echo ""
    echo "Development environment - some keys can use test values"
fi

if [ "$ENV_TYPE" = "paper-trading" ]; then
    echo ""
    echo "Paper trading environment - ensure testnet RPC is configured"
    if [[ ! "$RPC_URL" =~ "testnet" ]] && [[ ! "$RPC_URL" =~ "sepolia" ]] && [[ ! "$RPC_URL" =~ "goerli" ]]; then
        echo -e "${YELLOW}⚠ RPC_URL may not be pointing to a testnet${NC}"
    fi
fi

# Summary
echo ""
echo "=================================="
if [ $VALIDATION_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ Environment validation passed${NC}"
    echo "=================================="
    exit 0
else
    echo -e "${RED}✗ Environment validation failed${NC}"
    echo "=================================="
    echo ""
    echo "Please fix the issues above before proceeding."
    echo "Refer to .env.example for guidance on required variables."
    exit 1
fi
