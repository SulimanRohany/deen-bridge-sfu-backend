import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load environment variables
loadDotenv({ path: path.resolve(process.cwd(), '.env') });

// Fallback: Set environment variables directly if not loaded from .env
if (!process.env['CORS_ORIGINS']) {
  process.env['CORS_ORIGINS'] = 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3005,http://127.0.0.1:3005';
}
if (!process.env['DJANGO_JWT_SECRET']) {
  process.env['DJANGO_JWT_SECRET'] = 'test-secret';
}
if (!process.env['DJANGO_WEBHOOK_SECRET']) {
  process.env['DJANGO_WEBHOOK_SECRET'] = 'test-webhook';
}

// Ensure NODE_ENV is set to development
if (!process.env['NODE_ENV']) {
  process.env['NODE_ENV'] = 'development';
}

// Configuration schema validation
const configSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(3001),
  HOST: z.string().default('127.0.0.1'),

  // Mediasoup Configuration
  MEDIASOUP_WORKER_BIN: z.string().default('mediasoup-worker'),
  MEDIASOUP_WORKER_LOG_LEVEL: z.enum(['debug', 'warn', 'error', 'none']).default('debug'),
  MEDIASOUP_WORKER_LOG_TAG: z.string().default('worker'),
  MEDIASOUP_WORKER_LOG_COLOR: z.coerce.boolean().default(false),
  MEDIASOUP_WORKER_RTC_MIN_PORT: z.coerce.number().min(1024).max(65535).default(10000),
  MEDIASOUP_WORKER_RTC_MAX_PORT: z.coerce.number().min(1024).max(65535).default(10100),

  // Network Configuration
  ANNOUNCED_IP: z.string().default('127.0.0.1'),
  MEDIASOUP_LISTEN_IP: z.string().default('0.0.0.0'),
  MEDIASOUP_LISTEN_PORT: z.coerce.number().min(1).max(65535).default(3001),

  // STUN/TURN Configuration
  STUN_SERVERS: z.string().default('stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302'),
  TURN_SERVERS: z.string().optional(),
  TURN_USERNAME: z.string().optional(),
  TURN_CREDENTIAL: z.string().optional(),

  // Django Integration
  DJANGO_BASE_URL: z.string().url().default('http://127.0.0.1:8000'),
  DJANGO_JWT_SECRET: z.string().default('default-jwt-secret'),
  DJANGO_JWT_ALGORITHM: z.string().default('HS256'),
  DJANGO_JWKS_URL: z.string().optional().refine((val) => !val || z.string().url().safeParse(val).success, {
    message: "Must be a valid URL or empty"
  }),
  DJANGO_WEBHOOK_SECRET: z.string().default('default-webhook-secret'),

  // Redis Configuration
  REDIS_URL: z.string().url().default('redis://127.0.0.1:6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().min(0).max(15).default(0),
  REDIS_KEY_PREFIX: z.string().default('sfu:'),

  // PostgreSQL Configuration
  DATABASE_URL: z.string().url().optional(),
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().min(1).max(65535).default(5432),
  POSTGRES_DB: z.string().default('sfu_backend'),
  POSTGRES_USER: z.string().default('postgres'),
  POSTGRES_PASSWORD: z.string().optional(),

  // Security Configuration
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://127.0.0.1:3000'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().min(1000).default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().min(1).default(100),
  JWT_ISSUER: z.string().default('deensfu'),
  JWT_AUDIENCE: z.string().default('deensfu-client'),

  // Logging Configuration
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),

  // Metrics Configuration
  METRICS_ENABLED: z.coerce.boolean().default(true),
  METRICS_PORT: z.coerce.number().min(1).max(65535).default(9090),

  // Health Check Configuration
  HEALTH_CHECK_INTERVAL: z.coerce.number().min(1000).default(30000),
  HEALTH_CHECK_TIMEOUT: z.coerce.number().min(1000).default(5000),

  // Room Configuration
  MAX_PARTICIPANTS_PER_ROOM: z.coerce.number().min(1).max(1000).default(100),
  ROOM_CLEANUP_INTERVAL: z.coerce.number().min(1000).default(300000),
  ROOM_IDLE_TIMEOUT: z.coerce.number().min(1000).default(1800000),

  // Codec Configuration
  PREFERRED_CODECS: z.string().default('VP8,VP9,AV1'),
  OPUS_BITRATE: z.coerce.number().min(64000).max(512000).default(128000),
  VP8_BITRATE: z.coerce.number().min(100000).max(10000000).default(1000000),
  VP9_BITRATE: z.coerce.number().min(100000).max(10000000).default(1000000),
  AV1_BITRATE: z.coerce.number().min(100000).max(10000000).default(1000000),

  // Simulcast Configuration
  SIMULCAST_ENABLED: z.coerce.boolean().default(true),
  SIMULCAST_LAYERS: z.coerce.number().min(1).max(5).default(3),

  // SVC Configuration
  SVC_ENABLED: z.coerce.boolean().default(true),
  SVC_LAYERS: z.coerce.number().min(1).max(5).default(3),

  // E2EE Configuration
  E2EE_ENABLED: z.coerce.boolean().default(false),
  E2EE_KEY_DERIVATION_ITERATIONS: z.coerce.number().min(10000).max(1000000).default(100000),

  // Load Balancing
  INSTANCE_ID: z.string().default('sfu-001'),
  CLUSTER_MODE: z.coerce.boolean().default(false),
});

// Parse and validate configuration
const rawConfig = process.env;
const parsedConfig = configSchema.parse(rawConfig);

// Export typed configuration
const appConfig = {
  server: {
    env: parsedConfig.NODE_ENV,
    port: parsedConfig.PORT,
    host: parsedConfig.HOST,
  },
  mediasoup: {
    worker: {
      bin: parsedConfig.MEDIASOUP_WORKER_BIN,
      logLevel: parsedConfig.MEDIASOUP_WORKER_LOG_LEVEL,
      logTag: parsedConfig.MEDIASOUP_WORKER_LOG_TAG,
      logColor: parsedConfig.MEDIASOUP_WORKER_LOG_COLOR,
      rtcMinPort: parsedConfig.MEDIASOUP_WORKER_RTC_MIN_PORT,
      rtcMaxPort: parsedConfig.MEDIASOUP_WORKER_RTC_MAX_PORT,
    },
    listen: {
      ip: parsedConfig.MEDIASOUP_LISTEN_IP,
      port: parsedConfig.MEDIASOUP_LISTEN_PORT,
    },
    announcedIp: parsedConfig.ANNOUNCED_IP,
  },
  network: {
    stunServers: parsedConfig.STUN_SERVERS.split(',').map(server => server.trim()),
    turnServers: parsedConfig.TURN_SERVERS ? parsedConfig.TURN_SERVERS.split(',').map(server => server.trim()) : [],
    turnUsername: parsedConfig.TURN_USERNAME,
    turnCredential: parsedConfig.TURN_CREDENTIAL,
  },
  django: {
    baseUrl: parsedConfig.DJANGO_BASE_URL,
    jwtSecret: parsedConfig.DJANGO_JWT_SECRET,
    jwtAlgorithm: parsedConfig.DJANGO_JWT_ALGORITHM as 'HS256' | 'RS256',
    jwksUrl: parsedConfig.DJANGO_JWKS_URL,
    webhookSecret: parsedConfig.DJANGO_WEBHOOK_SECRET,
  },
  redis: {
    url: parsedConfig.REDIS_URL,
    password: parsedConfig.REDIS_PASSWORD,
    db: parsedConfig.REDIS_DB,
    keyPrefix: parsedConfig.REDIS_KEY_PREFIX,
  },
  postgres: {
    url: parsedConfig.DATABASE_URL || (parsedConfig.POSTGRES_PASSWORD ? `postgresql://${parsedConfig.POSTGRES_USER}:${parsedConfig.POSTGRES_PASSWORD}@${parsedConfig.POSTGRES_HOST}:${parsedConfig.POSTGRES_PORT}/${parsedConfig.POSTGRES_DB}` : ''),
    host: parsedConfig.POSTGRES_HOST,
    port: parsedConfig.POSTGRES_PORT,
    database: parsedConfig.POSTGRES_DB,
    user: parsedConfig.POSTGRES_USER,
    password: parsedConfig.POSTGRES_PASSWORD || '',
  },
  security: {
    corsOrigins: parsedConfig.CORS_ORIGINS.split(',').map(origin => origin.trim()),
    rateLimit: {
      windowMs: parsedConfig.RATE_LIMIT_WINDOW_MS,
      maxRequests: parsedConfig.RATE_LIMIT_MAX_REQUESTS,
    },
    jwt: {
      issuer: parsedConfig.JWT_ISSUER,
      audience: parsedConfig.JWT_AUDIENCE,
    },
  },
  logging: {
    level: parsedConfig.LOG_LEVEL,
    format: parsedConfig.LOG_FORMAT,
  },
  metrics: {
    enabled: parsedConfig.METRICS_ENABLED,
    port: parsedConfig.METRICS_PORT,
  },
  health: {
    interval: parsedConfig.HEALTH_CHECK_INTERVAL,
    timeout: parsedConfig.HEALTH_CHECK_TIMEOUT,
  },
  room: {
    maxParticipants: parsedConfig.MAX_PARTICIPANTS_PER_ROOM,
    cleanupInterval: parsedConfig.ROOM_CLEANUP_INTERVAL,
    idleTimeout: parsedConfig.ROOM_IDLE_TIMEOUT,
  },
  codecs: {
    preferred: parsedConfig.PREFERRED_CODECS.split(',').map(codec => codec.trim()),
    bitrates: {
      opus: parsedConfig.OPUS_BITRATE,
      vp8: parsedConfig.VP8_BITRATE,
      vp9: parsedConfig.VP9_BITRATE,
      av1: parsedConfig.AV1_BITRATE,
    },
  },
  simulcast: {
    enabled: parsedConfig.SIMULCAST_ENABLED,
    layers: parsedConfig.SIMULCAST_LAYERS,
  },
  svc: {
    enabled: parsedConfig.SVC_ENABLED,
    layers: parsedConfig.SVC_LAYERS,
  },
  e2ee: {
    enabled: parsedConfig.E2EE_ENABLED,
    keyDerivationIterations: parsedConfig.E2EE_KEY_DERIVATION_ITERATIONS,
  },
  cluster: {
    instanceId: parsedConfig.INSTANCE_ID,
    mode: parsedConfig.CLUSTER_MODE,
  },
} as const;

export const config = appConfig;
export type Config = typeof appConfig;
