import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '@/config';
import { logSystemEvent } from '@/utils/logger';
import { metricsService } from '@/services/metrics';

// const logger = createLogger({ component: 'security' });

// CORS configuration
export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = config.security.corsOrigins;
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    logSystemEvent('warn', 'CORS blocked request', 'security', { origin });
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key',
  ],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
};

// Rate limiting configuration
export const createRateLimit = (windowMs: number, max: number, message?: string) => {
  return rateLimit({
    windowMs,
    max,
    message: message || 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      logSystemEvent('warn', 'Rate limit exceeded', 'security', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
      });

      metricsService.incrementError('security', 'rate_limit_exceeded');

      res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(windowMs / 1000),
      });
    },
    skip: (req: Request) => {
      // Skip rate limiting for health checks
      return req.path === '/healthz' || req.path === '/readyz';
    },
  });
};

// General rate limiter
export const generalRateLimit = createRateLimit(
  config.security.rateLimit.windowMs,
  config.security.rateLimit.maxRequests,
  'Too many requests from this IP, please try again later.'
);

// WebSocket rate limiter (more restrictive)
export const websocketRateLimit = createRateLimit(
  60000, // 1 minute
  10, // 10 connections per minute
  'Too many WebSocket connection attempts, please try again later.'
);

// API rate limiter (less restrictive for authenticated users)
export const apiRateLimit = createRateLimit(
  300000, // 5 minutes
  1000, // 1000 requests per 5 minutes
  'Too many API requests, please try again later.'
);

// Helmet configuration
export const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for WebRTC
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: false,
};

// Security headers middleware
export const securityHeaders = (_req: Request, res: Response, next: NextFunction): void => {
  // Remove X-Powered-By header
  res.removeHeader('X-Powered-By');

  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  next();
};

// Request validation middleware
export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  // Check for suspicious patterns
  const suspiciousPatterns = [
    /\.\./, // Path traversal
    /<script/i, // XSS attempts
    /union.*select/i, // SQL injection
    /javascript:/i, // JavaScript injection
    /vbscript:/i, // VBScript injection
    /onload/i, // Event handler injection
  ];

  const url = req.url.toLowerCase();
  const userAgent = req.get('User-Agent')?.toLowerCase() || '';

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(url) || pattern.test(userAgent)) {
      logSystemEvent('warn', 'Suspicious request detected', 'security', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.url,
        method: req.method,
        pattern: pattern.toString(),
      });

      metricsService.incrementError('security', 'suspicious_request');

      return res.status(400).json({
        error: 'Bad Request',
        message: 'Suspicious request detected',
      });
    }
  }

  return next();
};

// IP whitelist middleware (optional)
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.connection.remoteAddress || '';
    
    if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
      logSystemEvent('warn', 'IP not in whitelist', 'security', {
        ip: clientIP,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });

      metricsService.incrementError('security', 'ip_not_whitelisted');

      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied from this IP address',
      });
    }

    return next();
  };
};

// Request size limiter
export const requestSizeLimit = (maxSize: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.get('Content-Length') || '0');
    
    if (contentLength > maxSize) {
      logSystemEvent('warn', 'Request too large', 'security', {
        ip: req.ip,
        contentLength,
        maxSize,
        path: req.path,
      });

      metricsService.incrementError('security', 'request_too_large');

      return res.status(413).json({
        error: 'Payload Too Large',
        message: 'Request size exceeds maximum allowed size',
      });
    }

    return next();
  };
};

// WebSocket security middleware
export const websocketSecurity = (req: any, res: Response, next: NextFunction) => {
  // Validate WebSocket upgrade request
  const upgrade = req.headers.upgrade;
  const connection = req.headers.connection;
  const secWebSocketKey = req.headers['sec-websocket-key'];
  const secWebSocketVersion = req.headers['sec-websocket-version'];

  if (upgrade !== 'websocket' || !connection?.includes('upgrade')) {
    logSystemEvent('warn', 'Invalid WebSocket upgrade request', 'security', {
      ip: req.ip,
      upgrade,
      connection,
    });

    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid WebSocket upgrade request',
    });
  }

  if (!secWebSocketKey || !secWebSocketVersion) {
    logSystemEvent('warn', 'Missing WebSocket headers', 'security', {
      ip: req.ip,
      secWebSocketKey: !!secWebSocketKey,
      secWebSocketVersion: !!secWebSocketVersion,
    });

    return res.status(400).json({
      error: 'Bad Request',
      message: 'Missing required WebSocket headers',
    });
  }

  return next();
};

// Error handler for security-related errors
export const securityErrorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
  if (error.type === 'entity.too.large') {
    logSystemEvent('warn', 'Request entity too large', 'security', {
      ip: req.ip,
      path: req.path,
      error: error.message,
    });

    metricsService.incrementError('security', 'entity_too_large');

    return res.status(413).json({
      error: 'Payload Too Large',
      message: 'Request entity too large',
    });
  }

  if (error.type === 'entity.parse.failed') {
    logSystemEvent('warn', 'Request parse failed', 'security', {
      ip: req.ip,
      path: req.path,
      error: error.message,
    });

    metricsService.incrementError('security', 'parse_failed');

    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid request format',
    });
  }

  return next(error);
};

// Security monitoring middleware
export const securityMonitoring = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Log suspicious activity
    if (statusCode >= 400) {
      logSystemEvent('warn', 'HTTP error response', 'security', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        method: req.method,
        path: req.path,
        statusCode,
        duration,
      });

      metricsService.incrementError('security', `http_${statusCode}`);
    }

    // Log slow requests
    if (duration > 5000) { // 5 seconds
      logSystemEvent('warn', 'Slow request detected', 'security', {
        ip: req.ip,
        method: req.method,
        path: req.path,
        duration,
        statusCode,
      });
    }
  });

  next();
};
