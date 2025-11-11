import { logSystemEvent } from '@/utils/logger';
import { redisService } from './redis';
import { databaseService } from './database';
import { webhookService } from './webhook';
import { mediasoupService } from './mediasoup';
import { config } from '@/config';
import { HealthStatus } from '@/types';

// const logger = createLogger({ component: 'health' });

export class HealthService {
  private checks: Map<string, () => Promise<boolean>> = new Map();
  private lastCheckTime = 0;
  private lastHealthStatus: HealthStatus | null = null;

  constructor() {
    this.setupChecks();
  }

  private setupChecks(): void {
    this.checks.set('database', this.checkDatabase.bind(this));
    this.checks.set('redis', this.checkRedis.bind(this));
    this.checks.set('mediasoup', this.checkMediasoup.bind(this));
    this.checks.set('django', this.checkDjango.bind(this));
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      return await databaseService.ping();
    } catch (error) {
      logSystemEvent('error', 'Database health check failed', 'health', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      return await redisService.ping();
    } catch (error) {
      logSystemEvent('error', 'Redis health check failed', 'health', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async checkMediasoup(): Promise<boolean> {
    try {
      // Check if mediasoup service is initialized and has workers
      const workerCount = mediasoupService.getWorkerCount();
      return workerCount > 0;
    } catch (error) {
      logSystemEvent('error', 'Mediasoup health check failed', 'health', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async checkDjango(): Promise<boolean> {
    try {
      return await webhookService.healthCheck();
    } catch (error) {
      logSystemEvent('error', 'Django health check failed', 'health', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async getHealthStatus(): Promise<HealthStatus> {
    const now = Date.now();
    
    // Return cached result if checked recently (within 5 seconds)
    if (this.lastHealthStatus && (now - this.lastCheckTime) < 5000) {
      return this.lastHealthStatus;
    }

    try {
      const checks = await this.runAllChecks();
      const overallStatus = this.determineOverallStatus(checks);
      const metrics = await this.getSystemMetrics();

      const healthStatus: HealthStatus = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env['npm_package_version'] || '1.0.0',
        instanceId: config.cluster.instanceId,
        checks,
        metrics,
      };

      this.lastHealthStatus = healthStatus;
      this.lastCheckTime = now;

      logSystemEvent('info', 'Health check completed', 'health', {
        status: overallStatus,
        checks,
      });

      return healthStatus;
    } catch (error) {
      logSystemEvent('error', 'Health check failed', 'health', {
        error: error instanceof Error ? error.message : String(error),
      });

      const errorStatus: HealthStatus = {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env['npm_package_version'] || '1.0.0',
        instanceId: config.cluster.instanceId,
        checks: {
          database: 'unhealthy',
          redis: 'unhealthy',
          mediasoup: 'unhealthy',
          django: 'unhealthy',
        },
        metrics: {
          activeRooms: 0,
          activeParticipants: 0,
          activeProducers: 0,
          activeConsumers: 0,
          memoryUsage: 0,
          cpuUsage: 0,
        },
      };

      this.lastHealthStatus = errorStatus;
      this.lastCheckTime = now;

      return errorStatus;
    }
  }

  private async runAllChecks(): Promise<{ database: 'healthy' | 'unhealthy'; redis: 'healthy' | 'unhealthy'; mediasoup: 'healthy' | 'unhealthy'; django: 'healthy' | 'unhealthy' }> {
    const results: { database: 'healthy' | 'unhealthy'; redis: 'healthy' | 'unhealthy'; mediasoup: 'healthy' | 'unhealthy'; django: 'healthy' | 'unhealthy' } = {
      database: 'unhealthy',
      redis: 'unhealthy',
      mediasoup: 'unhealthy',
      django: 'unhealthy'
    };

    // Run checks in parallel
    const checkPromises = Array.from(this.checks.entries()).map(async ([name, checkFn]) => {
      try {
        const isHealthy = await Promise.race([
          checkFn(),
          new Promise<boolean>((_, reject) => 
            setTimeout(() => reject(new Error('Check timeout')), config.health.timeout)
          ),
        ]);
        
        if (name === 'database' || name === 'redis' || name === 'mediasoup' || name === 'django') {
          results[name] = isHealthy ? 'healthy' : 'unhealthy';
        }
      } catch (error) {
        logSystemEvent('warn', `Health check failed for ${name}`, 'health', {
          error: error instanceof Error ? error.message : String(error),
        });
        if (name === 'database' || name === 'redis' || name === 'mediasoup' || name === 'django') {
          results[name] = 'unhealthy';
        }
      }
    });

    await Promise.all(checkPromises);
    return results;
  }

  private determineOverallStatus(checks: { database: 'healthy' | 'unhealthy'; redis: 'healthy' | 'unhealthy'; mediasoup: 'healthy' | 'unhealthy'; django: 'healthy' | 'unhealthy' }): 'healthy' | 'unhealthy' | 'degraded' {
    const checkValues = Object.values(checks);
    const healthyCount = checkValues.filter(status => status === 'healthy').length;
    const totalCount = checkValues.length;

    if (healthyCount === totalCount) {
      return 'healthy';
    } else if (healthyCount >= totalCount * 0.5) {
      return 'degraded';
    } else {
      return 'unhealthy';
    }
  }

  private async getSystemMetrics(): Promise<HealthStatus['metrics']> {
    try {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      // Get room service stats
      const roomStats = await this.getRoomServiceStats();

      return {
        activeRooms: roomStats.rooms.active,
        activeParticipants: roomStats.participants.active,
        activeProducers: roomStats.producers.total,
        activeConsumers: roomStats.consumers.total,
        memoryUsage: memUsage.heapUsed,
        cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
      };
    } catch (error) {
      logSystemEvent('error', 'Failed to get system metrics', 'health', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        activeRooms: 0,
        activeParticipants: 0,
        activeProducers: 0,
        activeConsumers: 0,
        memoryUsage: 0,
        cpuUsage: 0,
      };
    }
  }

  private async getRoomServiceStats(): Promise<any> {
    try {
      // Import roomService dynamically to avoid circular dependencies
      const { roomService } = await import('./room');
      return roomService.getStats();
    } catch (error) {
      logSystemEvent('warn', 'Failed to get room service stats', 'health', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        rooms: { active: 0 },
        participants: { active: 0 },
        producers: { total: 0 },
        consumers: { total: 0 },
      };
    }
  }

  // Liveness probe - basic check if service is running
  async isAlive(): Promise<boolean> {
    try {
      // Simple check - if we can get uptime, we're alive
      return process.uptime() > 0;
    } catch (error) {
      return false;
    }
  }

  // Readiness probe - check if service is ready to accept requests
  async isReady(): Promise<boolean> {
    try {
      const healthStatus = await this.getHealthStatus();
      
      // Service is ready if it's healthy or degraded (but not unhealthy)
      return healthStatus.status === 'healthy' || healthStatus.status === 'degraded';
    } catch (error) {
      logSystemEvent('error', 'Readiness check failed', 'health', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // Get detailed health information for debugging
  async getDetailedHealth(): Promise<any> {
    const healthStatus = await this.getHealthStatus();
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      ...healthStatus,
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        pid: process.pid,
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
        uptime: process.uptime(),
      },
      config: {
        instanceId: config.cluster.instanceId,
        clusterMode: config.cluster.mode,
        mediasoupWorkers: mediasoupService.getWorkerCount(),
      },
    };
  }

  // Start periodic health checks
  startPeriodicChecks(): void {
    setInterval(async () => {
      try {
        await this.getHealthStatus();
      } catch (error) {
        logSystemEvent('error', 'Periodic health check failed', 'health', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, config.health.interval);
  }
}

// Singleton instance
export const healthService = new HealthService();
