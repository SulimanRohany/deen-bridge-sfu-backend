import { Request, Response } from 'express';
import { healthService } from '@/services/health';
import { metricsService } from '@/services/metrics';
import { logSystemEvent } from '@/utils/logger';

// const logger = createLogger({ component: 'health-controller' });

export class HealthController {
  // Liveness probe - basic check if service is running
  async liveness(_req: Request, res: Response): Promise<void> {
    try {
      const isAlive = await healthService.isAlive();
      
      if (isAlive) {
        res.status(200).json({
          status: 'alive',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        });
      } else {
        res.status(503).json({
          status: 'dead',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logSystemEvent('error', 'Liveness check failed', 'health-controller', {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Liveness check failed',
      });
    }
  }

  // Readiness probe - check if service is ready to accept requests
  async readiness(_req: Request, res: Response): Promise<void> {
    try {
      const isReady = await healthService.isReady();
      
      if (isReady) {
        res.status(200).json({
          status: 'ready',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        });
      } else {
        res.status(503).json({
          status: 'not_ready',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logSystemEvent('error', 'Readiness check failed', 'health-controller', {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Readiness check failed',
      });
    }
  }

  // Detailed health status
  async health(_req: Request, res: Response): Promise<void> {
    try {
      const healthStatus = await healthService.getHealthStatus();
      
      const statusCode = healthStatus.status === 'healthy' ? 200 : 
                        healthStatus.status === 'degraded' ? 200 : 503;

      res.status(statusCode).json(healthStatus);
    } catch (error) {
      logSystemEvent('error', 'Health check failed', 'health-controller', {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
      });
    }
  }

  // Detailed health information for debugging
  async detailedHealth(_req: Request, res: Response): Promise<void> {
    try {
      const detailedHealth = await healthService.getDetailedHealth();
      res.json(detailedHealth);
    } catch (error) {
      logSystemEvent('error', 'Detailed health check failed', 'health-controller', {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Detailed health check failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Metrics endpoint
  async metrics(_req: Request, res: Response): Promise<void> {
    try {
      const metrics = await metricsService.getMetrics();
      res.set('Content-Type', 'text/plain');
      res.send(metrics);
    } catch (error) {
      logSystemEvent('error', 'Metrics retrieval failed', 'health-controller', {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Metrics retrieval failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Metrics as JSON
  async metricsJson(_req: Request, res: Response): Promise<void> {
    try {
      const metrics = await metricsService.getMetricsAsJSON();
      res.json(metrics);
    } catch (error) {
      logSystemEvent('error', 'JSON metrics retrieval failed', 'health-controller', {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'JSON metrics retrieval failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Service status
  async status(_req: Request, res: Response): Promise<void> {
    try {
      const healthStatus = await healthService.getHealthStatus();
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      res.json({
        service: 'sfu-backend',
        version: process.env['npm_package_version'] || '1.0.0',
        status: healthStatus.status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        instance: {
          id: process.env['INSTANCE_ID'] || 'sfu-001',
          pid: process.pid,
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
        },
        system: {
          memory: {
            rss: memUsage.rss,
            heapTotal: memUsage.heapTotal,
            heapUsed: memUsage.heapUsed,
            external: memUsage.external,
          },
          cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system,
          },
        },
        checks: healthStatus.checks,
        metrics: healthStatus.metrics,
      });
    } catch (error) {
      logSystemEvent('error', 'Status check failed', 'health-controller', {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Status check failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// Singleton instance
export const healthController = new HealthController();
