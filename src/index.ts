import 'module-alias/register';
import express from 'express';
import { createServer } from 'http';
import WebSocket from 'ws';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import { config } from '@/config';
import { logSystemEvent } from '@/utils/logger';

// Import services
import { mediasoupService } from '@/services/mediasoup';
import { redisService } from '@/services/redis';
import { databaseService } from '@/services/database';
import { webSocketService } from '@/services/websocket';
import { metricsService } from '@/services/metrics';
import { healthService } from '@/services/health';

// Import middleware
import {
  corsOptions,
  generalRateLimit,
  helmetOptions,
  securityHeaders,
  validateRequest,
  requestSizeLimit,
  securityErrorHandler,
  securityMonitoring,
} from '@/middleware/security';

// Import controllers
import { healthController } from '@/controllers/health';

// const logger = createLogger({ component: 'app' });

class SFUApplication {
  private app: express.Application;
  private server: any;
  private wss: WebSocket.Server | null = null;
  private isShuttingDown = false;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandling();
    this.setupGracefulShutdown();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(securityHeaders);
    this.app.use(validateRequest);
    this.app.use(securityMonitoring);
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(requestSizeLimit(10 * 1024 * 1024)); // 10MB limit

    // CORS
    this.app.use(cors(corsOptions));

    // Helmet
    this.app.use(helmet(helmetOptions));

    // Rate limiting
    this.app.use(generalRateLimit);
  }

  private setupRoutes(): void {
    // Health check routes
    this.app.get('/healthz', healthController.liveness.bind(healthController));
    this.app.get('/readyz', healthController.readiness.bind(healthController));
    this.app.get('/health', healthController.health.bind(healthController));
    this.app.get('/health/detailed', healthController.detailedHealth.bind(healthController));
    this.app.get('/status', healthController.status.bind(healthController));

    // Metrics routes
    this.app.get('/metrics', healthController.metrics.bind(healthController));
    this.app.get('/metrics/json', healthController.metricsJson.bind(healthController));

    // API routes
    this.app.get('/api/version', (_req, res) => {
      res.json({
        service: 'sfu-backend',
        version: process.env['npm_package_version'] || '1.0.0',
        timestamp: new Date().toISOString(),
      });
    });

    // Catch-all for undefined routes
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found',
        path: req.originalUrl,
      });
    });
  }

  private setupWebSocket(): void {
    this.wss = new WebSocket.Server({
      server: this.server,
      path: '/ws',
      verifyClient: (info: any) => {
        // In development mode, allow all origins
        if (config.server.env === 'development') {
          return true;
        }
        
        // Basic WebSocket security check for production
        const origin = info.origin;
        const allowedOrigins = config.security.corsOrigins;
        
        if (allowedOrigins.length > 0 && origin && !allowedOrigins.includes(origin)) {
          logSystemEvent('warn', 'WebSocket connection blocked by CORS', 'websocket', { origin });
          return false;
        }

        return true;
      },
    });

    this.wss.on('connection', (ws: WebSocket, req) => {
      try {
        logSystemEvent('info', 'New WebSocket connection attempt', 'websocket', {
          url: req.url,
          origin: req.headers.origin,
          userAgent: req.headers['user-agent'],
        });
        
        // Extract token from query parameters for browser compatibility
        const url = new URL(req.url || '/', `http://${req.headers.host}`);
        const token = url.searchParams.get('token');
        
        if (token) {
          // Add token to headers for authentication
          req.headers.authorization = `Bearer ${token}`;
          logSystemEvent('info', 'Token extracted from query parameters', 'websocket');
        } else {
          logSystemEvent('warn', 'No token found in WebSocket connection', 'websocket');
        }
        
        webSocketService.handleConnection(ws, req).catch(error => {
          logSystemEvent('error', 'WebSocket connection handler failed', 'websocket', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
        });
      } catch (error) {
        logSystemEvent('error', 'Error in WebSocket connection setup', 'websocket', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    this.wss.on('error', (error) => {
      logSystemEvent('error', 'WebSocket server error', 'websocket', {
        error: error.message,
      });
    });

    logSystemEvent('info', 'WebSocket server configured', 'websocket', {
      path: '/ws',
    });
  }

  private setupErrorHandling(): void {
    // Security error handler
    this.app.use(securityErrorHandler);

    // Global error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logSystemEvent('error', 'Unhandled error', 'app', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        ip: req.ip,
      });

      metricsService.incrementError('app', 'unhandled_error');

      if (res.headersSent) {
        return next(error);
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: process.env['NODE_ENV'] === 'production' ? 'Something went wrong' : error.message,
        timestamp: new Date().toISOString(),
      });
    });
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        logSystemEvent('warn', 'Shutdown already in progress', 'app', { signal });
        return;
      }

      this.isShuttingDown = true;
      logSystemEvent('info', `Received ${signal}, starting graceful shutdown`, 'app');

      try {
        // Stop accepting new connections
        this.server.close(() => {
          logSystemEvent('info', 'HTTP server closed', 'app');
        });

        // Close WebSocket connections
        if (this.wss) {
          this.wss.close(() => {
            logSystemEvent('info', 'WebSocket server closed', 'app');
          });
        }

        // Cleanup services
        await this.cleanupServices();

        logSystemEvent('info', 'Graceful shutdown completed', 'app');
        process.exit(0);
      } catch (error) {
        logSystemEvent('error', 'Error during graceful shutdown', 'app', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logSystemEvent('error', 'Uncaught exception', 'app', {
        error: error.message,
        stack: error.stack,
      });
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logSystemEvent('error', 'Unhandled promise rejection', 'app', {
        reason: reason instanceof Error ? reason.message : String(reason),
        promise: promise.toString(),
      });
      process.exit(1);
    });
  }

  private async cleanupServices(): Promise<void> {
    try {
      // Stop metrics collection
      metricsService.stop();

      // Cleanup WebSocket service
      webSocketService.cleanup();

      // Close mediasoup service
      await mediasoupService.close();

      // Close Redis connections
      await redisService.disconnect();

      // Close database connections
      await databaseService.disconnect();

      logSystemEvent('info', 'All services cleaned up', 'app');
    } catch (error) {
      logSystemEvent('error', 'Error during service cleanup', 'app', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async start(): Promise<void> {
    try {
      logSystemEvent('info', 'Starting SFU application', 'app', {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        instanceId: config.cluster.instanceId,
      });

      // Initialize services
      await this.initializeServices();

      // Start HTTP server
      await new Promise<void>((resolve, reject) => {
        this.server.on('error', (error: any) => {
          logSystemEvent('error', 'Server binding error', 'app', {
            error: error.message,
            code: error.code,
            port: config.server.port,
            host: config.server.host,
          });
          reject(error);
        });

        this.server.listen(config.server.port, config.server.host, (error?: Error) => {
          if (error) {
            logSystemEvent('error', 'Server listen error', 'app', {
              error: error.message,
              port: config.server.port,
              host: config.server.host,
            });
            reject(error);
          } else {
            logSystemEvent('info', 'Server successfully bound to port', 'app', {
              port: config.server.port,
              host: config.server.host,
            });
            resolve();
          }
        });
      });

      // Start periodic health checks
      healthService.startPeriodicChecks();

      // Start metrics collection
      metricsService.start();

      logSystemEvent('info', 'SFU application started successfully', 'app', {
        port: config.server.port,
        host: config.server.host,
        environment: config.server.env,
        websocketPath: '/ws',
      });
    } catch (error) {
      logSystemEvent('error', 'Failed to start SFU application', 'app', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async initializeServices(): Promise<void> {
    logSystemEvent('info', 'Initializing services', 'app');

    // Initialize mediasoup (required)
    await mediasoupService.initialize();
    logSystemEvent('info', 'Mediasoup service initialized', 'app');

    // Connect to Redis (optional in development)
    try {
      await redisService.connect();
      logSystemEvent('info', 'Redis service connected', 'app');
    } catch (error) {
      if (config.server.env === 'development') {
        logSystemEvent('warn', 'Redis connection failed - continuing without Redis', 'app', {
          error: error instanceof Error ? error.message : String(error),
        });
      } else {
        throw error;
      }
    }

    // Connect to database (optional in development)
    try {
      await databaseService.connect();
      logSystemEvent('info', 'Database service connected', 'app');
    } catch (error) {
      if (config.server.env === 'development') {
        logSystemEvent('warn', 'Database connection failed - continuing without database', 'app', {
          error: error instanceof Error ? error.message : String(error),
        });
      } else {
        throw error;
      }
    }

    logSystemEvent('info', 'All services initialized', 'app');
  }

  getApp(): express.Application {
    return this.app;
  }

  getServer(): any {
    return this.server;
  }
}

// Create and start application
const app = new SFUApplication();

// Start the application
app.start().catch((error) => {
  logSystemEvent('error', 'Failed to start application', 'app', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});

export default app;
