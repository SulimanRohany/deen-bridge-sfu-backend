import client from 'prom-client';
import { config } from '@/config';
import { logSystemEvent } from '@/utils/logger';
import { roomService } from './room';
import { redisService } from './redis';
import { databaseService } from './database';
// import { authService } from './auth';

// const logger = createLogger({ component: 'metrics' });

// Create a Registry
const register = new client.Registry();

// Add default metrics
client.collectDefaultMetrics({ register });

// Custom metrics
export const metrics = {
  // Room metrics
  roomsTotal: new client.Gauge({
    name: 'sfu_rooms_total',
    help: 'Total number of rooms',
    labelNames: ['instance_id', 'status'],
    registers: [register],
  }),

  roomsActive: new client.Gauge({
    name: 'sfu_rooms_active',
    help: 'Number of active rooms',
    labelNames: ['instance_id'],
    registers: [register],
  }),

  // Participant metrics
  participantsTotal: new client.Gauge({
    name: 'sfu_participants_total',
    help: 'Total number of participants',
    labelNames: ['instance_id', 'room_id'],
    registers: [register],
  }),

  participantsActive: new client.Gauge({
    name: 'sfu_participants_active',
    help: 'Number of active participants',
    labelNames: ['instance_id'],
    registers: [register],
  }),

  // Producer metrics
  producersTotal: new client.Gauge({
    name: 'sfu_producers_total',
    help: 'Total number of producers',
    labelNames: ['instance_id', 'kind'],
    registers: [register],
  }),

  producersActive: new client.Gauge({
    name: 'sfu_producers_active',
    help: 'Number of active producers',
    labelNames: ['instance_id', 'kind'],
    registers: [register],
  }),

  // Consumer metrics
  consumersTotal: new client.Gauge({
    name: 'sfu_consumers_total',
    help: 'Total number of consumers',
    labelNames: ['instance_id', 'kind'],
    registers: [register],
  }),

  consumersActive: new client.Gauge({
    name: 'sfu_consumers_active',
    help: 'Number of active consumers',
    labelNames: ['instance_id', 'kind'],
    registers: [register],
  }),

  // Transport metrics
  transportsTotal: new client.Gauge({
    name: 'sfu_transports_total',
    help: 'Total number of transports',
    labelNames: ['instance_id', 'direction'],
    registers: [register],
  }),

  transportsActive: new client.Gauge({
    name: 'sfu_transports_active',
    help: 'Number of active transports',
    labelNames: ['instance_id', 'direction'],
    registers: [register],
  }),

  // WebSocket metrics
  websocketConnections: new client.Gauge({
    name: 'sfu_websocket_connections',
    help: 'Number of WebSocket connections',
    labelNames: ['instance_id', 'status'],
    registers: [register],
  }),

  websocketMessagesTotal: new client.Counter({
    name: 'sfu_websocket_messages_total',
    help: 'Total number of WebSocket messages',
    labelNames: ['instance_id', 'type', 'status'],
    registers: [register],
  }),

  // Request metrics
  httpRequestsTotal: new client.Counter({
    name: 'sfu_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
  }),

  httpRequestDuration: new client.Histogram({
    name: 'sfu_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
    registers: [register],
  }),

  // Error metrics
  errorsTotal: new client.Counter({
    name: 'sfu_errors_total',
    help: 'Total number of errors',
    labelNames: ['instance_id', 'component', 'error_type'],
    registers: [register],
  }),

  // Database metrics
  databaseConnections: new client.Gauge({
    name: 'sfu_database_connections',
    help: 'Number of database connections',
    labelNames: ['instance_id', 'status'],
    registers: [register],
  }),

  databaseQueryDuration: new client.Histogram({
    name: 'sfu_database_query_duration_seconds',
    help: 'Database query duration in seconds',
    labelNames: ['query_type'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [register],
  }),

  // Redis metrics
  redisConnections: new client.Gauge({
    name: 'sfu_redis_connections',
    help: 'Number of Redis connections',
    labelNames: ['instance_id', 'status'],
    registers: [register],
  }),

  redisOperationsTotal: new client.Counter({
    name: 'sfu_redis_operations_total',
    help: 'Total number of Redis operations',
    labelNames: ['instance_id', 'operation', 'status'],
    registers: [register],
  }),

  // Mediasoup metrics
  mediasoupWorkers: new client.Gauge({
    name: 'sfu_mediasoup_workers',
    help: 'Number of mediasoup workers',
    labelNames: ['instance_id', 'status'],
    registers: [register],
  }),

  mediasoupRouters: new client.Gauge({
    name: 'sfu_mediasoup_routers',
    help: 'Number of mediasoup routers',
    labelNames: ['instance_id'],
    registers: [register],
  }),

  // Business metrics
  roomCreationRate: new client.Counter({
    name: 'sfu_room_creation_rate',
    help: 'Rate of room creation',
    labelNames: ['instance_id'],
    registers: [register],
  }),

  participantJoinRate: new client.Counter({
    name: 'sfu_participant_join_rate',
    help: 'Rate of participant joins',
    labelNames: ['instance_id', 'room_id'],
    registers: [register],
  }),

  participantLeaveRate: new client.Counter({
    name: 'sfu_participant_leave_rate',
    help: 'Rate of participant leaves',
    labelNames: ['instance_id', 'room_id'],
    registers: [register],
  }),

  // System metrics
  memoryUsage: new client.Gauge({
    name: 'sfu_memory_usage_bytes',
    help: 'Memory usage in bytes',
    labelNames: ['instance_id', 'type'],
    registers: [register],
  }),

  cpuUsage: new client.Gauge({
    name: 'sfu_cpu_usage_percent',
    help: 'CPU usage percentage',
    labelNames: ['instance_id'],
    registers: [register],
  }),

  uptime: new client.Gauge({
    name: 'sfu_uptime_seconds',
    help: 'Service uptime in seconds',
    labelNames: ['instance_id'],
    registers: [register],
  }),
};

export class MetricsService {
  private updateInterval?: NodeJS.Timeout | null;
  private startTime = Date.now();

  start(): void {
    if (!config.metrics.enabled) {
      logSystemEvent('info', 'Metrics collection disabled', 'metrics');
      return;
    }

    logSystemEvent('info', 'Starting metrics collection', 'metrics');

    // Update metrics every 30 seconds
    this.updateInterval = setInterval(() => {
      this.updateMetrics();
    }, 30000);

    // Initial metrics update
    this.updateMetrics();
  }

  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    logSystemEvent('info', 'Stopped metrics collection', 'metrics');
  }

  private updateMetrics(): void {
    try {
      this.updateRoomMetrics();
      this.updateSystemMetrics();
      this.updateServiceHealthMetrics();
    } catch (error) {
      logSystemEvent('error', 'Failed to update metrics', 'metrics', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private updateRoomMetrics(): void {
    const stats = roomService.getStats();
    const instanceId = config.cluster.instanceId;

    // Room metrics
    metrics.roomsTotal.set({ instance_id: instanceId, status: 'total' }, stats.rooms.total);
    metrics.roomsActive.set({ instance_id: instanceId }, stats.rooms.active);

    // Participant metrics
    metrics.participantsTotal.set({ instance_id: instanceId }, stats.participants.total);
    metrics.participantsActive.set({ instance_id: instanceId }, stats.participants.active);

    // Producer metrics
    metrics.producersTotal.set({ instance_id: instanceId, kind: 'audio' }, stats.producers.audio);
    metrics.producersTotal.set({ instance_id: instanceId, kind: 'video' }, stats.producers.video);
    metrics.producersActive.set({ instance_id: instanceId, kind: 'audio' }, stats.producers.audio);
    metrics.producersActive.set({ instance_id: instanceId, kind: 'video' }, stats.producers.video);

    // Consumer metrics
    metrics.consumersTotal.set({ instance_id: instanceId, kind: 'audio' }, stats.consumers.audio);
    metrics.consumersTotal.set({ instance_id: instanceId, kind: 'video' }, stats.consumers.video);
    metrics.consumersActive.set({ instance_id: instanceId, kind: 'audio' }, stats.consumers.audio);
    metrics.consumersActive.set({ instance_id: instanceId, kind: 'video' }, stats.consumers.video);

    // Mediasoup metrics
    metrics.mediasoupWorkers.set({ instance_id: instanceId, status: 'active' }, 1); // Assuming 1 worker per instance
    metrics.mediasoupRouters.set({ instance_id: instanceId }, stats.rooms.active);
  }

  private updateSystemMetrics(): void {
    const instanceId = config.cluster.instanceId;
    const memUsage = process.memoryUsage();

    // Memory metrics
    metrics.memoryUsage.set({ instance_id: instanceId, type: 'rss' }, memUsage.rss);
    metrics.memoryUsage.set({ instance_id: instanceId, type: 'heapTotal' }, memUsage.heapTotal);
    metrics.memoryUsage.set({ instance_id: instanceId, type: 'heapUsed' }, memUsage.heapUsed);
    metrics.memoryUsage.set({ instance_id: instanceId, type: 'external' }, memUsage.external);

    // Uptime
    const uptime = (Date.now() - this.startTime) / 1000;
    metrics.uptime.set({ instance_id: instanceId }, uptime);

    // CPU usage (simplified)
    const cpuUsage = process.cpuUsage();
    const totalCpuUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
    metrics.cpuUsage.set({ instance_id: instanceId }, totalCpuUsage);
  }

  private updateServiceHealthMetrics(): void {
    const instanceId = config.cluster.instanceId;

    // Database health
    const dbHealthy = databaseService.isHealthy();
    metrics.databaseConnections.set({ instance_id: instanceId, status: 'healthy' }, dbHealthy ? 1 : 0);

    // Redis health
    const redisHealthy = redisService.isHealthy();
    metrics.redisConnections.set({ instance_id: instanceId, status: 'healthy' }, redisHealthy ? 1 : 0);
  }

  // Increment counters
  incrementWebSocketMessage(type: string, status: 'success' | 'error'): void {
    metrics.websocketMessagesTotal.inc({
      instance_id: config.cluster.instanceId,
      type,
      status,
    });
  }

  incrementHttpRequest(method: string, route: string, statusCode: number): void {
    metrics.httpRequestsTotal.inc({
      method,
      route,
      status_code: statusCode.toString(),
    });
  }

  recordHttpRequestDuration(method: string, route: string, statusCode: number, duration: number): void {
    metrics.httpRequestDuration.observe({
      method,
      route,
      status_code: statusCode.toString(),
    }, duration / 1000); // Convert to seconds
  }

  incrementError(component: string, errorType: string): void {
    metrics.errorsTotal.inc({
      instance_id: config.cluster.instanceId,
      component,
      error_type: errorType,
    });
  }

  incrementRoomCreation(): void {
    metrics.roomCreationRate.inc({
      instance_id: config.cluster.instanceId,
    });
  }

  incrementParticipantJoin(roomId: string): void {
    metrics.participantJoinRate.inc({
      instance_id: config.cluster.instanceId,
      room_id: roomId,
    });
  }

  incrementParticipantLeave(roomId: string): void {
    metrics.participantLeaveRate.inc({
      instance_id: config.cluster.instanceId,
      room_id: roomId,
    });
  }

  recordDatabaseQuery(queryType: string, duration: number): void {
    metrics.databaseQueryDuration.observe({ query_type: queryType }, duration / 1000);
  }

  incrementRedisOperation(operation: string, status: 'success' | 'error'): void {
    metrics.redisOperationsTotal.inc({
      instance_id: config.cluster.instanceId,
      operation,
      status,
    });
  }

  // Get metrics as Prometheus format
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  // Get metrics as JSON
  async getMetricsAsJSON(): Promise<any> {
    return register.getMetricsAsJSON();
  }
}

// Singleton instance
export const metricsService = new MetricsService();
