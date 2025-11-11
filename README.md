# SFU Backend - Production-Ready Selective Forwarding Unit

A production-ready, horizontally scalable Selective Forwarding Unit (SFU) backend built with Node.js, TypeScript, and mediasoup. This service handles low-latency real-time media routing and integrates seamlessly with your existing Django backend and Next.js frontend.

## 🚀 Features

- **High Performance**: Built on mediasoup for optimal WebRTC performance
- **Horizontal Scaling**: Multi-instance deployment with Redis coordination
- **Production Ready**: Comprehensive logging, metrics, health checks, and monitoring
- **Secure**: JWT authentication, rate limiting, CORS, and input validation
- **Observable**: Prometheus metrics, structured logging, and health endpoints
- **Resilient**: Graceful shutdown, error handling, and automatic reconnection
- **Django Integration**: Seamless integration with existing Django backend
- **TypeScript**: Full type safety and excellent developer experience

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [Monitoring](#monitoring)
- [Development](#development)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## 🚀 Quick Start

### Prerequisites

- Node.js 20 LTS or higher
- Redis 6.0 or higher
- PostgreSQL 12 or higher
- Docker (optional)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd sfu-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

4. **Set up the database**
   ```bash
   # Run migrations
   npm run migrate
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

The SFU service will be available at:
- WebSocket: `ws://localhost:3000/ws`
- HTTP API: `http://localhost:3000`
- Metrics: `http://localhost:9090/metrics`

## 🏗️ Architecture

### High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Next.js       │    │   Django        │    │   SFU Backend   │
│   Frontend      │◄──►│   Backend       │◄──►│   (mediasoup)   │
│                 │    │                 │    │                 │
│ - Video UI      │    │ - Auth          │    │ - Media Routing │
│ - SFU Client    │    │ - User Mgmt     │    │ - WebRTC        │
│ - Media Streams │    │ - Room Metadata │    │ - Scaling       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   PostgreSQL    │    │     Redis       │
                       │   (Persistent)  │    │   (Ephemeral)   │
                       └─────────────────┘    └─────────────────┘
```

### Core Components

- **MediasoupService**: Manages mediasoup workers and routers
- **RoomService**: Handles room and participant management
- **AuthService**: JWT authentication and Django integration
- **WebSocketService**: Real-time communication with clients
- **RedisService**: State management and inter-instance coordination
- **DatabaseService**: Persistent storage and audit logging
- **MetricsService**: Prometheus metrics collection
- **HealthService**: Health checks and monitoring

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment mode | `development` | No |
| `PORT` | HTTP server port | `3000` | No |
| `HOST` | Server host | `0.0.0.0` | No |
| `DJANGO_BASE_URL` | Django backend URL | `http://127.0.0.1:8000` | Yes |
| `DJANGO_JWT_SECRET` | JWT secret key | - | Yes |
| `REDIS_URL` | Redis connection URL | `redis://127.0.0.1:6379` | Yes |
| `DATABASE_URL` | PostgreSQL connection URL | - | Yes |
| `MEDIASOUP_WORKER_RTC_MIN_PORT` | Min RTC port | `10000` | No |
| `MEDIASOUP_WORKER_RTC_MAX_PORT` | Max RTC port | `10100` | No |

### Mediasoup Configuration

The SFU uses mediasoup for WebRTC media routing. Key configuration options:

- **Workers**: One worker per CPU core (max 8)
- **Routers**: One router per room
- **Codecs**: VP8, VP9, AV1, H264, Opus
- **Simulcast**: Enabled by default (3 layers)
- **SVC**: Enabled for supported codecs

### Security Configuration

- **CORS**: Configurable allowed origins
- **Rate Limiting**: Per-IP and per-user limits
- **JWT**: RS256 or HS256 with Django integration
- **Input Validation**: Zod schema validation
- **Helmet**: Security headers

## 📚 API Reference

### WebSocket API

The SFU uses WebSocket for real-time communication. All messages follow this format:

```typescript
{
  type: string;
  data?: any;
  requestId?: string;
  error?: string;
}
```

#### Authentication

```typescript
// Client sends
{
  type: 'authenticate',
  data: { token: 'jwt-token' }
}

// Server responds
{
  type: 'connected',
  data: {
    connectionId: 'uuid',
    user: { id, email, fullName, role }
  }
}
```

#### Room Management

**Create Room**
```typescript
// Request
{
  type: 'createRoom',
  data: {
    name: string;
    description?: string;
    maxParticipants?: number;
  }
}

// Response
{
  type: 'createRoomResponse',
  data: {
    roomId: string;
    name: string;
    description?: string;
    maxParticipants: number;
  }
}
```

**Join Room**
```typescript
// Request
{
  type: 'joinRoom',
  data: {
    roomId: string;
    displayName: string;
  }
}

// Response
{
  type: 'joinRoomResponse',
  data: {
    roomId: string;
    participants: ParticipantInfo[];
    routerRtpCapabilities: RtpCapabilities;
  }
}
```

#### Media Publishing

**Create Transport**
```typescript
// Request
{
  type: 'createWebRtcTransport',
  data: {
    roomId: string;
    direction: 'send' | 'recv';
  }
}

// Response
{
  type: 'createWebRtcTransportResponse',
  data: {
    transportId: string;
    iceParameters: IceParameters;
    iceCandidates: IceCandidate[];
    dtlsParameters: DtlsParameters;
  }
}
```

**Publish Media**
```typescript
// Request
{
  type: 'publish',
  data: {
    roomId: string;
    kind: 'audio' | 'video';
    rtpParameters: RtpParameters;
  }
}

// Response
{
  type: 'publishResponse',
  data: {
    producerId: string;
    kind: 'audio' | 'video';
    rtpParameters: RtpParameters;
  }
}
```

### HTTP API

#### Health Endpoints

- `GET /healthz` - Liveness probe
- `GET /readyz` - Readiness probe
- `GET /health` - Detailed health status
- `GET /metrics` - Prometheus metrics

#### Status Endpoint

- `GET /status` - Service status and statistics

## 🚀 Deployment

### Docker Deployment

1. **Build the image**
   ```bash
   docker build -t sfu-backend .
   ```

2. **Run the container**
   ```bash
   docker run -p 3000:3000 -p 3001:3001/udp \
     -e DJANGO_JWT_SECRET=your-secret \
     -e REDIS_URL=redis://redis:6379 \
     -e DATABASE_URL=postgresql://user:pass@postgres:5432/sfu \
     sfu-backend
   ```

### Kubernetes Deployment

1. **Apply the manifests**
   ```bash
   kubectl apply -f k8s/
   ```

2. **Check the deployment**
   ```bash
   kubectl get pods -n sfu
   kubectl get services -n sfu
   ```

### Production Considerations

- **Resource Limits**: Set appropriate CPU and memory limits
- **Horizontal Scaling**: Use HPA for automatic scaling
- **Load Balancing**: Configure ingress for WebSocket support
- **Monitoring**: Set up Prometheus and Grafana
- **Logging**: Configure centralized logging
- **Security**: Use secrets for sensitive data

## 📊 Monitoring

### Metrics

The SFU exposes Prometheus metrics at `/metrics`:

- **Room metrics**: Total rooms, active rooms, participants
- **Media metrics**: Producers, consumers, transports
- **System metrics**: CPU, memory, uptime
- **Error metrics**: Error counts by type and component

### Health Checks

- **Liveness**: Basic service availability
- **Readiness**: Service ready to accept requests
- **Dependencies**: Database, Redis, Django connectivity

### Logging

Structured JSON logging with:
- Request/response logging
- Error tracking
- Performance metrics
- Security events

## 🛠️ Development

### Project Structure

```
sfu-backend/
├── src/
│   ├── config/          # Configuration
│   ├── controllers/     # HTTP controllers
│   ├── middleware/      # Express middleware
│   ├── migrations/      # Database migrations
│   ├── services/        # Business logic
│   ├── types/           # TypeScript types
│   ├── utils/           # Utility functions
│   └── index.ts         # Application entry point
├── tests/               # Test files
├── k8s/                 # Kubernetes manifests
├── Dockerfile           # Docker configuration
└── package.json         # Dependencies
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run test` - Run unit tests
- `npm run test:e2e` - Run E2E tests
- `npm run test:load` - Run load tests
- `npm run lint` - Run linter
- `npm run type-check` - Run TypeScript compiler

### Adding New Features

1. **Define types** in `src/types/`
2. **Implement service** in `src/services/`
3. **Add validation** in `src/utils/validation.ts`
4. **Create tests** in `tests/`
5. **Update documentation**

## 🧪 Testing

### Unit Tests

```bash
npm run test
```

### E2E Tests

```bash
npm run test:e2e
```

### Load Tests

```bash
npm run test:load
```

### Test Coverage

```bash
npm run test:coverage
```

## 🔧 Troubleshooting

### Common Issues

**WebSocket Connection Failed**
- Check CORS configuration
- Verify JWT token validity
- Check network connectivity

**Media Not Working**
- Verify STUN/TURN configuration
- Check firewall settings
- Ensure proper codec support

**High Memory Usage**
- Check for memory leaks
- Adjust worker count
- Monitor garbage collection

**Database Connection Issues**
- Verify connection string
- Check database availability
- Review connection pool settings

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug npm run dev
```

### Performance Tuning

- **Worker Count**: Adjust based on CPU cores
- **Memory Limits**: Set appropriate limits
- **Connection Pooling**: Tune database connections
- **Caching**: Optimize Redis usage

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📞 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review the troubleshooting guide

---

**Built with ❤️ using Node.js, TypeScript, and mediasoup**
