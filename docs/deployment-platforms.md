# Deployment Platform Guide

This guide covers deploying Vibekit to various cloud platforms and hosting providers.

## Table of Contents

- [Docker Compose (Recommended)](#docker-compose-recommended)
- [Railway](#railway)
- [Heroku](#heroku)
- [AWS ECS](#aws-ecs)
- [Google Cloud Run](#google-cloud-run)
- [DigitalOcean App Platform](#digitalocean-app-platform)
- [Self-Hosted VPS](#self-hosted-vps)

## Docker Compose (Recommended)

Docker Compose is the recommended deployment method for all environments. See the [Deployment Guide](./deployment-guide.md) for detailed instructions.

### Advantages

- ✅ Full control over all services
- ✅ Easy local development
- ✅ Consistent across environments
- ✅ Built-in networking and service discovery
- ✅ Resource management with limits and reservations

### Quick Start

```bash
# Development
cd typescript
pnpm deploy:dev

# Paper trading
pnpm deploy:paper

# Production
pnpm deploy:prod
```

## Railway

[Railway](https://railway.app/) offers simple deployment with auto-scaling and managed databases.

### Prerequisites

- Railway account ([Sign up](https://railway.app/))
- Railway CLI: `npm install -g @railway/cli`

### Deployment Steps

1. **Initialize Railway Project**:
   ```bash
   cd typescript
   railway login
   railway init
   ```

2. **Add PostgreSQL**:
   ```bash
   railway add postgres
   ```

3. **Set Environment Variables**:
   ```bash
   railway variables set AUTH_SECRET="$(openssl rand -base64 32)"
   railway variables set OPENAI_API_KEY="sk-your-key"
   railway variables set RPC_URL="https://arbitrum.llamarpc.com"
   # Add other required variables
   ```

4. **Deploy**:
   ```bash
   railway up
   ```

5. **Monitor**:
   ```bash
   railway logs
   ```

### Multi-Service Deployment

For deploying multiple agents as separate services:

1. Create separate Railway services for each agent
2. Configure each service with its own start command:
   - Web: `node clients/web/dist/index.js`
   - Lending Agent: `node community/lending-agent-no-wallet/dist/index.js`
   - Swapping Agent: `node community/swapping-agent-no-wallet/dist/index.js`

3. Share environment variables across services
4. Use Railway's internal networking for inter-service communication

### Railway Configuration

The `railway.toml` file in the repository root provides default configuration:

```toml
[build]
builder = "nixpacks"
buildCommand = "pnpm install --frozen-lockfile && pnpm build"

[deploy]
startCommand = "node clients/web/dist/index.js"
healthcheckPath = "/health"
```

## Heroku

[Heroku](https://www.heroku.com/) provides Platform-as-a-Service with easy scaling and add-ons.

### Prerequisites

- Heroku account ([Sign up](https://signup.heroku.com/))
- Heroku CLI: `brew install heroku/brew/heroku`

### Deployment Steps

1. **Login to Heroku**:
   ```bash
   heroku login
   ```

2. **Create App**:
   ```bash
   cd typescript
   heroku create vibekit-app
   ```

3. **Add PostgreSQL**:
   ```bash
   heroku addons:create heroku-postgresql:essential-0
   ```

4. **Set Environment Variables**:
   ```bash
   heroku config:set AUTH_SECRET="$(openssl rand -base64 32)"
   heroku config:set OPENAI_API_KEY="sk-your-key"
   heroku config:set RPC_URL="https://arbitrum.llamarpc.com"
   # Add other required variables
   ```

5. **Deploy**:
   ```bash
   git push heroku main
   ```

6. **Scale Dynos** (for multiple agents):
   ```bash
   # Scale web dyno
   heroku ps:scale web=1
   
   # Add worker dynos for agents (requires Procfile configuration)
   heroku ps:scale lending-agent=1 swapping-agent=1
   ```

7. **View Logs**:
   ```bash
   heroku logs --tail
   ```

### Procfile Configuration

The `Procfile` in the repository root defines process types:

```
web: cd clients/web && node dist/index.js
lending-agent: cd community/lending-agent-no-wallet && node dist/index.js
swapping-agent: cd community/swapping-agent-no-wallet && node dist/index.js
```

### Limitations

- Heroku dynos sleep after 30 minutes of inactivity (free tier)
- Requires separate dynos for each agent (additional cost)
- File system is ephemeral (use external storage for persistent data)

## AWS ECS

Deploy Vibekit to AWS Elastic Container Service with Docker.

### Prerequisites

- AWS account
- AWS CLI: `brew install awscli`
- ECR access for container registry

### Deployment Steps

1. **Configure AWS CLI**:
   ```bash
   aws configure
   ```

2. **Create ECR Repository**:
   ```bash
   aws ecr create-repository --repository-name vibekit
   ```

3. **Build and Push Docker Image**:
   ```bash
   cd typescript
   
   # Login to ECR
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
   
   # Build image
   docker build -t vibekit -f clients/web/Dockerfile.prod .
   
   # Tag image
   docker tag vibekit:latest YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/vibekit:latest
   
   # Push image
   docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/vibekit:latest
   ```

4. **Create ECS Cluster**:
   ```bash
   aws ecs create-cluster --cluster-name vibekit-cluster
   ```

5. **Create Task Definition**:
   ```json
   {
     "family": "vibekit-task",
     "networkMode": "awsvpc",
     "requiresCompatibilities": ["FARGATE"],
     "cpu": "1024",
     "memory": "2048",
     "containerDefinitions": [
       {
         "name": "vibekit-web",
         "image": "YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/vibekit:latest",
         "portMappings": [
           {
             "containerPort": 3000,
             "protocol": "tcp"
           }
         ],
         "environment": [
           {"name": "NODE_ENV", "value": "production"}
         ],
         "secrets": [
           {"name": "AUTH_SECRET", "valueFrom": "arn:aws:secretsmanager:..."},
           {"name": "OPENAI_API_KEY", "valueFrom": "arn:aws:secretsmanager:..."}
         ],
         "healthCheck": {
           "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
           "interval": 30,
           "timeout": 5,
           "retries": 3
         }
       }
     ]
   }
   ```

6. **Create Service**:
   ```bash
   aws ecs create-service \
     --cluster vibekit-cluster \
     --service-name vibekit-service \
     --task-definition vibekit-task \
     --desired-count 1 \
     --launch-type FARGATE \
     --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
   ```

### Cost Considerations

- Fargate charges per vCPU and memory per second
- Optimize container sizes and resource limits
- Use Spot instances for cost savings

## Google Cloud Run

Deploy containerized Vibekit to Google Cloud Run.

### Prerequisites

- Google Cloud account
- gcloud CLI: `brew install google-cloud-sdk`
- Artifact Registry or Container Registry access

### Deployment Steps

1. **Configure gcloud**:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

2. **Build Container**:
   ```bash
   cd typescript
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/vibekit
   ```

3. **Deploy to Cloud Run**:
   ```bash
   gcloud run deploy vibekit \
     --image gcr.io/YOUR_PROJECT_ID/vibekit \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars AUTH_SECRET="your-secret",RPC_URL="https://arbitrum.llamarpc.com" \
     --set-secrets OPENAI_API_KEY=openai-key:latest \
     --memory 2Gi \
     --cpu 2 \
     --max-instances 10
   ```

4. **Update Service**:
   ```bash
   gcloud run services update vibekit --region us-central1 \
     --set-env-vars NODE_ENV="production"
   ```

### Features

- Auto-scaling from 0 to N instances
- Pay-per-use (charged only when serving requests)
- Built-in HTTPS/SSL
- Integrated with Google Cloud SQL for PostgreSQL

## DigitalOcean App Platform

Deploy Vibekit to DigitalOcean's App Platform.

### Prerequisites

- DigitalOcean account ([Sign up](https://www.digitalocean.com/))
- doctl CLI: `brew install doctl`

### Deployment Steps

1. **Login to doctl**:
   ```bash
   doctl auth init
   ```

2. **Create App Spec** (`app-spec.yaml`):
   ```yaml
   name: vibekit
   services:
     - name: web
       github:
         repo: YOUR_USERNAME/arbitrum-vibekit
         branch: main
         deploy_on_push: true
       dockerfile_path: typescript/clients/web/Dockerfile.prod
       http_port: 3000
       instance_count: 1
       instance_size_slug: professional-xs
       health_check:
         http_path: /health
       envs:
         - key: NODE_ENV
           value: "production"
         - key: AUTH_SECRET
           value: "${AUTH_SECRET}"
           type: SECRET
         - key: OPENAI_API_KEY
           value: "${OPENAI_API_KEY}"
           type: SECRET
   databases:
     - name: db
       engine: PG
       production: true
       version: "15"
   ```

3. **Deploy**:
   ```bash
   doctl apps create --spec app-spec.yaml
   ```

4. **Monitor**:
   ```bash
   doctl apps list
   doctl apps logs YOUR_APP_ID
   ```

### Features

- Automatic HTTPS
- Free SSL certificates
- Integrated PostgreSQL database
- GitHub integration for auto-deployment

## Self-Hosted VPS

Deploy Vibekit to your own VPS (Ubuntu 22.04 example).

### Prerequisites

- VPS with Ubuntu 22.04+ (DigitalOcean, Linode, Vultr, etc.)
- SSH access
- Domain name (optional, but recommended)

### Deployment Steps

1. **SSH into VPS**:
   ```bash
   ssh root@your-server-ip
   ```

2. **Install Docker**:
   ```bash
   # Update system
   apt update && apt upgrade -y
   
   # Install Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   
   # Install Docker Compose
   apt install docker-compose-plugin -y
   ```

3. **Clone Repository**:
   ```bash
   git clone https://github.com/EmberAGI/arbitrum-vibekit.git
   cd arbitrum-vibekit/typescript
   ```

4. **Configure Environment**:
   ```bash
   cp .env.example .env
   nano .env
   # Edit and save environment variables
   ```

5. **Start Services**:
   ```bash
   docker compose up -d
   ```

6. **Configure Firewall**:
   ```bash
   ufw allow 22    # SSH
   ufw allow 80    # HTTP
   ufw allow 443   # HTTPS
   ufw enable
   ```

7. **Set Up Nginx Reverse Proxy** (optional):
   ```bash
   apt install nginx certbot python3-certbot-nginx -y
   
   # Create Nginx config
   cat > /etc/nginx/sites-available/vibekit << 'EOF'
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   EOF
   
   ln -s /etc/nginx/sites-available/vibekit /etc/nginx/sites-enabled/
   nginx -t
   systemctl restart nginx
   
   # Get SSL certificate
   certbot --nginx -d your-domain.com
   ```

8. **Set Up Auto-Updates** (optional):
   ```bash
   # Create update script
   cat > /root/update-vibekit.sh << 'EOF'
   #!/bin/bash
   cd /root/arbitrum-vibekit/typescript
   git pull origin main
   docker compose build
   docker compose up -d
   EOF
   
   chmod +x /root/update-vibekit.sh
   
   # Add to crontab for weekly updates
   (crontab -l 2>/dev/null; echo "0 3 * * 0 /root/update-vibekit.sh") | crontab -
   ```

### Monitoring

1. **Set Up System Monitoring**:
   ```bash
   # Install monitoring tools
   apt install htop nethogs iotop -y
   
   # Monitor Docker
   docker stats
   docker compose logs -f
   ```

2. **Set Up Log Rotation**:
   ```bash
   # Configure Docker log rotation
   cat > /etc/docker/daemon.json << 'EOF'
   {
     "log-driver": "json-file",
     "log-opts": {
       "max-size": "10m",
       "max-file": "3"
     }
   }
   EOF
   
   systemctl restart docker
   ```

### Backup

1. **Automated Database Backups**:
   ```bash
   # Create backup script
   cat > /root/backup-vibekit.sh << 'EOF'
   #!/bin/bash
   BACKUP_DIR="/root/backups"
   DATE=$(date +%Y%m%d_%H%M%S)
   
   mkdir -p $BACKUP_DIR
   
   docker exec vibekit-db pg_dump -U chatbot chatbot > $BACKUP_DIR/db_$DATE.sql
   
   # Keep only last 7 backups
   ls -t $BACKUP_DIR/db_*.sql | tail -n +8 | xargs rm -f
   EOF
   
   chmod +x /root/backup-vibekit.sh
   
   # Run daily at 2 AM
   (crontab -l 2>/dev/null; echo "0 2 * * * /root/backup-vibekit.sh") | crontab -
   ```

## Comparison Matrix

| Platform | Complexity | Cost | Auto-Scaling | Managed DB | Best For |
|----------|-----------|------|--------------|-----------|----------|
| Docker Compose | Low | $ | No | No | Development, Self-hosted |
| Railway | Low | $$ | Yes | Yes | Quick deploys, Startups |
| Heroku | Low | $$$ | Yes | Yes | Rapid prototyping |
| AWS ECS | High | $$ | Yes | Optional | Enterprise, Custom needs |
| Google Cloud Run | Medium | $ | Yes | Optional | Serverless, Variable traffic |
| DigitalOcean | Medium | $$ | Yes | Yes | Balanced approach |
| Self-Hosted VPS | High | $ | No | No | Full control, Cost-sensitive |

## Recommendations

- **Development/Testing**: Use Docker Compose locally
- **MVP/Prototype**: Railway or DigitalOcean App Platform
- **Production (Small)**: Railway, DigitalOcean, or Self-hosted VPS
- **Production (Enterprise)**: AWS ECS, Google Cloud Run, or Kubernetes
- **Cost-Sensitive**: Self-hosted VPS with Docker Compose
- **Serverless/Variable Load**: Google Cloud Run

## Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Railway Documentation](https://docs.railway.app/)
- [Heroku Documentation](https://devcenter.heroku.com/)
- [AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)
- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [DigitalOcean App Platform](https://docs.digitalocean.com/products/app-platform/)
