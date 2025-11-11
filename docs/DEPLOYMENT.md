# SFU Backend Deployment Guide

This guide covers deploying the SFU Backend in various environments, from development to production.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development Deployment](#development-deployment)
- [Docker Deployment](#docker-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Production Considerations](#production-considerations)
- [Monitoring and Observability](#monitoring-and-observability)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

- **Node.js**: 20 LTS or higher
- **Memory**: Minimum 2GB RAM (4GB+ recommended for production)
- **CPU**: 2+ cores (4+ cores recommended for production)
- **Storage**: 10GB+ available space
- **Network**: Stable internet connection with open ports

### Dependencies

- **Redis**: 6.0+ for state management
- **PostgreSQL**: 12+ for persistent storage
- **Django Backend**: For authentication and user management

### Ports

- **3000**: HTTP API and WebSocket
- **3001**: Mediasoup RTC (UDP)
- **9090**: Prometheus metrics (optional)

## Development Deployment

### 1. Clone and Install

```bash
git clone <repository-url>
cd sfu-backend
npm install
```

### 2. Environment Setup

```bash
cp env.example .env
# Edit .env with your configuration
```

### 3. Database Setup

```bash
# Create database
createdb sfu_backend

# Run migrations
npm run migrate
```

### 4. Start Services

```bash
# Start Redis (if not running)
redis-server

# Start PostgreSQL (if not running)
pg_ctl start

# Start SFU Backend
npm run dev
```

### 5. Verify Deployment

```bash
# Check health
curl http://localhost:3000/healthz

# Check metrics
curl http://localhost:9090/metrics
```

## Docker Deployment

### 1. Build Image

```bash
docker build -t sfu-backend .
```

### 2. Run Container

```bash
docker run -d \
  --name sfu-backend \
  -p 3000:3000 \
  -p 3001:3001/udp \
  -p 9090:9090 \
  -e DJANGO_JWT_SECRET=your-secret \
  -e REDIS_URL=redis://redis:6379 \
  -e DATABASE_URL=postgresql://user:pass@postgres:5432/sfu \
  sfu-backend
```

### 3. Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  sfu-backend:
    build: .
    ports:
      - "3000:3000"
      - "3001:3001/udp"
      - "9090:9090"
    environment:
      - NODE_ENV=production
      - DJANGO_JWT_SECRET=${DJANGO_JWT_SECRET}
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/sfu
    depends_on:
      - redis
      - postgres
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=sfu
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

Start services:

```bash
docker-compose up -d
```

## Kubernetes Deployment

### 1. Prerequisites

- Kubernetes cluster (1.20+)
- kubectl configured
- Helm (optional)

### 2. Create Namespace

```bash
kubectl apply -f k8s/namespace.yaml
```

### 3. Configure Secrets

```bash
# Create secrets
kubectl create secret generic sfu-secrets \
  --from-literal=DJANGO_JWT_SECRET=your-secret \
  --from-literal=POSTGRES_PASSWORD=your-password \
  --namespace=sfu
```

### 4. Deploy Services

```bash
# Deploy all resources
kubectl apply -f k8s/

# Or deploy individually
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/rbac.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/pdb.yaml
kubectl apply -f k8s/ingress.yaml
```

### 5. Verify Deployment

```bash
# Check pods
kubectl get pods -n sfu

# Check services
kubectl get services -n sfu

# Check logs
kubectl logs -f deployment/sfu-backend -n sfu
```

### 6. Scale Deployment

```bash
# Manual scaling
kubectl scale deployment sfu-backend --replicas=5 -n sfu

# Check HPA
kubectl get hpa -n sfu
```

## Production Considerations

### 1. Resource Limits

Set appropriate resource limits:

```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "2Gi"
    cpu: "2000m"
```

### 2. Horizontal Pod Autoscaler

Configure HPA for automatic scaling:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: sfu-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: sfu-backend
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### 3. Pod Disruption Budget

Ensure availability during updates:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: sfu-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: sfu-backend
```

### 4. Network Policies

Secure network communication:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: sfu-netpol
spec:
  podSelector:
    matchLabels:
      app: sfu-backend
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: redis
    ports:
    - protocol: TCP
      port: 6379
  - to:
    - namespaceSelector:
        matchLabels:
          name: postgres
    ports:
    - protocol: TCP
      port: 5432
```

### 5. Ingress Configuration

Configure ingress for external access:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: sfu-ingress
  annotations:
    nginx.ingress.kubernetes.io/websocket-services: "sfu-service"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
spec:
  rules:
  - host: sfu.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: sfu-service
            port:
              number: 3000
```

### 6. SSL/TLS Configuration

Enable HTTPS:

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: sfu-tls
spec:
  secretName: sfu-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
  - sfu.yourdomain.com
```

## Monitoring and Observability

### 1. Prometheus Metrics

The SFU exposes metrics at `/metrics`:

```yaml
apiVersion: v1
kind: ServiceMonitor
metadata:
  name: sfu-monitor
spec:
  selector:
    matchLabels:
      app: sfu-backend
  endpoints:
  - port: metrics
    path: /metrics
```

### 2. Grafana Dashboard

Create a Grafana dashboard with:

- Room metrics (total, active, participants)
- Media metrics (producers, consumers, transports)
- System metrics (CPU, memory, uptime)
- Error rates and response times

### 3. Logging

Configure centralized logging:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluentd-config
data:
  fluent.conf: |
    <source>
      @type tail
      path /var/log/containers/sfu-backend*.log
      pos_file /var/log/fluentd-containers.log.pos
      tag kubernetes.*
      format json
    </source>
    
    <match kubernetes.**>
      @type elasticsearch
      host elasticsearch.logging.svc.cluster.local
      port 9200
      index_name sfu-logs
    </match>
```

### 4. Alerting

Set up alerts for:

- High error rates
- Memory usage > 80%
- CPU usage > 90%
- Pod restarts
- Service unavailable

## Troubleshooting

### Common Issues

#### 1. WebSocket Connection Failed

**Symptoms:**
- Clients can't connect to WebSocket
- CORS errors in browser

**Solutions:**
- Check CORS configuration
- Verify ingress annotations
- Check firewall rules
- Validate JWT tokens

#### 2. Media Not Working

**Symptoms:**
- No audio/video in conference
- ICE connection failed

**Solutions:**
- Check STUN/TURN configuration
- Verify UDP port 3001 is open
- Check firewall settings
- Validate codec support

#### 3. High Memory Usage

**Symptoms:**
- Pods getting OOMKilled
- Slow performance

**Solutions:**
- Increase memory limits
- Check for memory leaks
- Optimize worker count
- Monitor garbage collection

#### 4. Database Connection Issues

**Symptoms:**
- Database connection errors
- Slow queries

**Solutions:**
- Check connection string
- Verify database availability
- Tune connection pool
- Check network connectivity

### Debug Commands

```bash
# Check pod status
kubectl get pods -n sfu

# Check pod logs
kubectl logs -f deployment/sfu-backend -n sfu

# Check service endpoints
kubectl get endpoints -n sfu

# Check ingress
kubectl get ingress -n sfu

# Check HPA
kubectl get hpa -n sfu

# Check events
kubectl get events -n sfu --sort-by='.lastTimestamp'

# Debug pod
kubectl exec -it deployment/sfu-backend -n sfu -- /bin/sh

# Check resource usage
kubectl top pods -n sfu
```

### Performance Tuning

#### 1. Worker Configuration

Adjust mediasoup workers based on CPU cores:

```yaml
env:
- name: MEDIASOUP_WORKER_COUNT
  value: "4"  # Adjust based on CPU cores
```

#### 2. Memory Optimization

Set appropriate memory limits and monitor usage:

```yaml
resources:
  requests:
    memory: "1Gi"
  limits:
    memory: "4Gi"
```

#### 3. Connection Pooling

Tune database connections:

```yaml
env:
- name: DATABASE_POOL_SIZE
  value: "20"
- name: DATABASE_POOL_MIN
  value: "5"
```

#### 4. Redis Configuration

Optimize Redis for SFU workload:

```yaml
redis:
  image: redis:7-alpine
  command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru
```

### Health Checks

Configure proper health checks:

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /readyz
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

### Backup and Recovery

#### 1. Database Backup

```bash
# Create backup
kubectl exec -it postgres-0 -n postgres -- pg_dump sfu > backup.sql

# Restore backup
kubectl exec -i postgres-0 -n postgres -- psql sfu < backup.sql
```

#### 2. Configuration Backup

```bash
# Backup configurations
kubectl get configmap sfu-config -n sfu -o yaml > config-backup.yaml
kubectl get secret sfu-secrets -n sfu -o yaml > secrets-backup.yaml
```

#### 3. Disaster Recovery

1. **Identify failure**: Check pod status and logs
2. **Scale down**: Reduce replicas to 0
3. **Restore data**: Restore from backup
4. **Scale up**: Increase replicas gradually
5. **Verify**: Check health endpoints and functionality

## Security Considerations

### 1. Network Security

- Use network policies to restrict traffic
- Enable TLS/SSL for all communications
- Use private networks for internal services

### 2. Authentication

- Implement proper JWT validation
- Use strong secrets and rotate regularly
- Implement rate limiting

### 3. Data Protection

- Encrypt data at rest
- Use secure communication protocols
- Implement proper access controls

### 4. Monitoring

- Monitor for security events
- Set up alerts for suspicious activity
- Regular security audits

## Maintenance

### 1. Updates

- Regular security updates
- Monitor for new versions
- Test updates in staging first

### 2. Scaling

- Monitor resource usage
- Scale based on demand
- Use HPA for automatic scaling

### 3. Monitoring

- Regular health checks
- Monitor performance metrics
- Set up alerting

### 4. Backup

- Regular database backups
- Configuration backups
- Test restore procedures
