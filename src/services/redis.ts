import Redis from 'ioredis';
import { config } from '@/config';
import { logSystemEvent } from '@/utils/logger';
import { createSystemError, ERROR_CODES } from '@/utils/errors';

// const logger = createLogger({ component: 'redis' });

export class RedisService {
  private client: Redis;
  private subscriber: Redis;
  private publisher: Redis;
  private isConnected = false;

  constructor() {
    // Main client for general operations
    this.client = new Redis(config.redis.url, {
      ...(config.redis.password && { password: config.redis.password }),
      db: config.redis.db,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keyPrefix: config.redis.keyPrefix,
      retryStrategy: (times) => {
        // In development mode, stop retrying after first failure
        if (config.server.env === 'development' && times > 1) {
          return null; // Stop retrying
        }
        return Math.min(times * 50, 2000);
      },
    });

    // Subscriber client for pub/sub
    this.subscriber = new Redis(config.redis.url, {
      ...(config.redis.password && { password: config.redis.password }),
      db: config.redis.db,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keyPrefix: config.redis.keyPrefix,
      retryStrategy: (times) => {
        if (config.server.env === 'development' && times > 1) {
          return null;
        }
        return Math.min(times * 50, 2000);
      },
    });

    // Publisher client for pub/sub
    this.publisher = new Redis(config.redis.url, {
      ...(config.redis.password && { password: config.redis.password }),
      db: config.redis.db,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keyPrefix: config.redis.keyPrefix,
      retryStrategy: (times) => {
        if (config.server.env === 'development' && times > 1) {
          return null;
        }
        return Math.min(times * 50, 2000);
      },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Main client events
    this.client.on('connect', () => {
      logSystemEvent('info', 'Redis client connected', 'redis');
    });

    this.client.on('ready', () => {
      logSystemEvent('info', 'Redis client ready', 'redis');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      logSystemEvent('error', 'Redis client error', 'redis', { error: error.message });
      this.isConnected = false;
    });

    this.client.on('close', () => {
      logSystemEvent('warn', 'Redis client connection closed', 'redis');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      logSystemEvent('info', 'Redis client reconnecting', 'redis');
    });

    // Subscriber events
    this.subscriber.on('connect', () => {
      logSystemEvent('info', 'Redis subscriber connected', 'redis');
    });

    this.subscriber.on('ready', () => {
      logSystemEvent('info', 'Redis subscriber ready', 'redis');
    });

    this.subscriber.on('error', (error) => {
      logSystemEvent('error', 'Redis subscriber error', 'redis', { error: error.message });
    });

    // Publisher events
    this.publisher.on('connect', () => {
      logSystemEvent('info', 'Redis publisher connected', 'redis');
    });

    this.publisher.on('ready', () => {
      logSystemEvent('info', 'Redis publisher ready', 'redis');
    });

    this.publisher.on('error', (error) => {
      logSystemEvent('error', 'Redis publisher error', 'redis', { error: error.message });
    });
  }

  async connect(): Promise<void> {
    try {
      await Promise.all([
        this.client.connect(),
        this.subscriber.connect(),
        this.publisher.connect(),
      ]);

      logSystemEvent('info', 'Redis service connected successfully', 'redis');
    } catch (error) {
      logSystemEvent('error', 'Failed to connect to Redis', 'redis', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      // In development mode, continue without Redis
      if (config.server.env === 'development') {
        logSystemEvent('warn', 'Continuing without Redis in development mode', 'redis');
        return;
      }
      
      throw createSystemError(ERROR_CODES.REDIS_CONNECTION_ERROR, 'Failed to connect to Redis');
    }
  }

  async disconnect(): Promise<void> {
    try {
      await Promise.all([
        this.client.disconnect(),
        this.subscriber.disconnect(),
        this.publisher.disconnect(),
      ]);

      this.isConnected = false;
      logSystemEvent('info', 'Redis service disconnected', 'redis');
    } catch (error) {
      logSystemEvent('error', 'Error disconnecting from Redis', 'redis', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  isHealthy(): boolean {
    return this.isConnected && this.client.status === 'ready';
  }

  // Key operations
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      logSystemEvent('error', 'Failed to set Redis key', 'redis', {
        error: error instanceof Error ? error.message : String(error),
        key,
      });
      throw createSystemError(ERROR_CODES.REDIS_ERROR, 'Failed to set Redis key');
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      logSystemEvent('error', 'Failed to get Redis key', 'redis', {
        error: error instanceof Error ? error.message : String(error),
        key,
      });
      throw createSystemError(ERROR_CODES.REDIS_ERROR, 'Failed to get Redis key');
    }
  }

  async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (error) {
      logSystemEvent('error', 'Failed to delete Redis key', 'redis', {
        error: error instanceof Error ? error.message : String(error),
        key,
      });
      throw createSystemError(ERROR_CODES.REDIS_ERROR, 'Failed to delete Redis key');
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logSystemEvent('error', 'Failed to check Redis key existence', 'redis', {
        error: error instanceof Error ? error.message : String(error),
        key,
      });
      throw createSystemError(ERROR_CODES.REDIS_ERROR, 'Failed to check Redis key existence');
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, ttlSeconds);
      return result === 1;
    } catch (error) {
      logSystemEvent('error', 'Failed to set Redis key expiration', 'redis', {
        error: error instanceof Error ? error.message : String(error),
        key,
        ttlSeconds,
      });
      throw createSystemError(ERROR_CODES.REDIS_ERROR, 'Failed to set Redis key expiration');
    }
  }

  // Hash operations
  async hset(key: string, field: string, value: string): Promise<number> {
    try {
      return await this.client.hset(key, field, value);
    } catch (error) {
      logSystemEvent('error', 'Failed to set Redis hash field', 'redis', {
        error: error instanceof Error ? error.message : String(error),
        key,
        field,
      });
      throw createSystemError(ERROR_CODES.REDIS_ERROR, 'Failed to set Redis hash field');
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    try {
      return await this.client.hget(key, field);
    } catch (error) {
      logSystemEvent('error', 'Failed to get Redis hash field', 'redis', {
        error: error instanceof Error ? error.message : String(error),
        key,
        field,
      });
      throw createSystemError(ERROR_CODES.REDIS_ERROR, 'Failed to get Redis hash field');
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await this.client.hgetall(key);
    } catch (error) {
      logSystemEvent('error', 'Failed to get Redis hash', 'redis', {
        error: error instanceof Error ? error.message : String(error),
        key,
      });
      throw createSystemError(ERROR_CODES.REDIS_ERROR, 'Failed to get Redis hash');
    }
  }

  async hdel(key: string, field: string): Promise<number> {
    try {
      return await this.client.hdel(key, field);
    } catch (error) {
      logSystemEvent('error', 'Failed to delete Redis hash field', 'redis', {
        error: error instanceof Error ? error.message : String(error),
        key,
        field,
      });
      throw createSystemError(ERROR_CODES.REDIS_ERROR, 'Failed to delete Redis hash field');
    }
  }

  // Set operations
  async sadd(key: string, member: string): Promise<number> {
    try {
      return await this.client.sadd(key, member);
    } catch (error) {
      logSystemEvent('error', 'Failed to add Redis set member', 'redis', {
        error: error instanceof Error ? error.message : String(error),
        key,
        member,
      });
      throw createSystemError(ERROR_CODES.REDIS_ERROR, 'Failed to add Redis set member');
    }
  }

  async srem(key: string, member: string): Promise<number> {
    try {
      return await this.client.srem(key, member);
    } catch (error) {
      logSystemEvent('error', 'Failed to remove Redis set member', 'redis', {
        error: error instanceof Error ? error.message : String(error),
        key,
        member,
      });
      throw createSystemError(ERROR_CODES.REDIS_ERROR, 'Failed to remove Redis set member');
    }
  }

  async smembers(key: string): Promise<string[]> {
    try {
      return await this.client.smembers(key);
    } catch (error) {
      logSystemEvent('error', 'Failed to get Redis set members', 'redis', {
        error: error instanceof Error ? error.message : String(error),
        key,
      });
      throw createSystemError(ERROR_CODES.REDIS_ERROR, 'Failed to get Redis set members');
    }
  }

  async sismember(key: string, member: string): Promise<boolean> {
    try {
      const result = await this.client.sismember(key, member);
      return result === 1;
    } catch (error) {
      logSystemEvent('error', 'Failed to check Redis set membership', 'redis', {
        error: error instanceof Error ? error.message : String(error),
        key,
        member,
      });
      throw createSystemError(ERROR_CODES.REDIS_ERROR, 'Failed to check Redis set membership');
    }
  }

  // Pub/Sub operations
  async publish(channel: string, message: string): Promise<number> {
    try {
      return await this.publisher.publish(channel, message);
    } catch (error) {
      logSystemEvent('error', 'Failed to publish Redis message', 'redis', {
        error: error instanceof Error ? error.message : String(error),
        channel,
      });
      throw createSystemError(ERROR_CODES.REDIS_ERROR, 'Failed to publish Redis message');
    }
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    try {
      await this.subscriber.subscribe(channel);
      this.subscriber.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          callback(message);
        }
      });
    } catch (error) {
      logSystemEvent('error', 'Failed to subscribe to Redis channel', 'redis', {
        error: error instanceof Error ? error.message : String(error),
        channel,
      });
      throw createSystemError(ERROR_CODES.REDIS_ERROR, 'Failed to subscribe to Redis channel');
    }
  }

  async unsubscribe(channel: string): Promise<void> {
    try {
      await this.subscriber.unsubscribe(channel);
    } catch (error) {
      logSystemEvent('error', 'Failed to unsubscribe from Redis channel', 'redis', {
        error: error instanceof Error ? error.message : String(error),
        channel,
      });
      throw createSystemError(ERROR_CODES.REDIS_ERROR, 'Failed to unsubscribe from Redis channel');
    }
  }

  // Room state operations
  async setRoomState(roomId: string, state: any, ttlSeconds: number = 3600): Promise<void> {
    const key = `room:${roomId}`;
    await this.set(key, JSON.stringify(state), ttlSeconds);
  }

  async getRoomState(roomId: string): Promise<any | null> {
    const key = `room:${roomId}`;
    const state = await this.get(key);
    return state ? JSON.parse(state) : null;
  }

  async deleteRoomState(roomId: string): Promise<void> {
    const key = `room:${roomId}`;
    await this.del(key);
  }

  async addParticipantToRoom(roomId: string, participantId: string): Promise<void> {
    const key = `room:${roomId}:participants`;
    await this.sadd(key, participantId);
  }

  async removeParticipantFromRoom(roomId: string, participantId: string): Promise<void> {
    const key = `room:${roomId}:participants`;
    await this.srem(key, participantId);
  }

  async getRoomParticipants(roomId: string): Promise<string[]> {
    const key = `room:${roomId}:participants`;
    return await this.smembers(key);
  }

  async isParticipantInRoom(roomId: string, participantId: string): Promise<boolean> {
    const key = `room:${roomId}:participants`;
    return await this.sismember(key, participantId);
  }

  // Instance coordination
  async registerInstance(instanceId: string, metadata: any): Promise<void> {
    const key = `instance:${instanceId}`;
    await this.set(key, JSON.stringify({
      ...metadata,
      lastSeen: Date.now(),
    }), 60); // 60 seconds TTL
  }

  async getInstances(): Promise<any[]> {
    const pattern = 'instance:*';
    const keys = await this.client.keys(pattern);
    const instances = [];

    for (const key of keys) {
      const data = await this.get(key);
      if (data) {
        instances.push(JSON.parse(data));
      }
    }

    return instances;
  }

  // Health check
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logSystemEvent('error', 'Redis ping failed', 'redis', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

// Singleton instance
export const redisService = new RedisService();
