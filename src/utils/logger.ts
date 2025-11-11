import pino from 'pino';
import { config } from '@/config';

// Create logger instance
const logger = pino({
  level: config.logging.level,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(config.logging.format === 'pretty' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        ignore: 'pid,hostname',
        translateTime: 'SYS:standard',
      },
    },
  }),
});

// Create child logger with instance context
export const createLogger = (context?: Record<string, any>) => {
  return logger.child(context || {});
};

// Default logger instance
export default logger;

// Structured logging helpers
export const logRoomEvent = (
  level: 'info' | 'warn' | 'error',
  message: string,
  roomId: string,
  participantId?: string,
  additionalData?: Record<string, any>
) => {
  const logData = {
    roomId,
    participantId,
    ...additionalData,
  };
  
  logger[level](logData, message);
};

export const logWebSocketEvent = (
  level: 'info' | 'warn' | 'error',
  message: string,
  socketId: string,
  userId?: string,
  additionalData?: Record<string, any>
) => {
  const logData = {
    socketId,
    userId,
    ...additionalData,
  };
  
  logger[level](logData, message);
};

export const logSystemEvent = (
  level: 'info' | 'warn' | 'error',
  message: string,
  component: string,
  additionalData?: Record<string, any>
) => {
  const logData = {
    component,
    ...additionalData,
  };
  
  logger[level](logData, message);
};

export const logPerformance = (
  operation: string,
  duration: number,
  additionalData?: Record<string, any>
) => {
  logger.info({
    operation,
    duration,
    ...additionalData,
  }, `Performance: ${operation} took ${duration}ms`);
};

export const logError = (
  error: Error,
  context?: Record<string, any>
) => {
  logger.error({
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
  }, 'Error occurred');
};
