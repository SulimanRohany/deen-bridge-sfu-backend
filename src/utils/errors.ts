import { SFUError } from '@/types';

// Error codes
export const ERROR_CODES = {
  // Authentication errors
  AUTH_TOKEN_MISSING: 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_USER_NOT_FOUND: 'AUTH_USER_NOT_FOUND',
  AUTH_INSUFFICIENT_PERMISSIONS: 'AUTH_INSUFFICIENT_PERMISSIONS',

  // Room errors
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_ALREADY_EXISTS: 'ROOM_ALREADY_EXISTS',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_INACTIVE: 'ROOM_INACTIVE',
  ROOM_ACCESS_DENIED: 'ROOM_ACCESS_DENIED',

  // Participant errors
  PARTICIPANT_NOT_FOUND: 'PARTICIPANT_NOT_FOUND',
  PARTICIPANT_ALREADY_JOINED: 'PARTICIPANT_ALREADY_JOINED',
  PARTICIPANT_NOT_IN_ROOM: 'PARTICIPANT_NOT_IN_ROOM',

  // Producer errors
  PRODUCER_NOT_FOUND: 'PRODUCER_NOT_FOUND',
  PRODUCER_ALREADY_EXISTS: 'PRODUCER_ALREADY_EXISTS',
  PRODUCER_KIND_INVALID: 'PRODUCER_KIND_INVALID',
  PRODUCER_RTP_PARAMETERS_INVALID: 'PRODUCER_RTP_PARAMETERS_INVALID',

  // Consumer errors
  CONSUMER_NOT_FOUND: 'CONSUMER_NOT_FOUND',
  CONSUMER_ALREADY_EXISTS: 'CONSUMER_ALREADY_EXISTS',
  CONSUMER_RTP_CAPABILITIES_INVALID: 'CONSUMER_RTP_CAPABILITIES_INVALID',

  // Transport errors
  TRANSPORT_NOT_FOUND: 'TRANSPORT_NOT_FOUND',
  TRANSPORT_ALREADY_EXISTS: 'TRANSPORT_ALREADY_EXISTS',
  TRANSPORT_DTLS_PARAMETERS_INVALID: 'TRANSPORT_DTLS_PARAMETERS_INVALID',
  TRANSPORT_ICE_PARAMETERS_INVALID: 'TRANSPORT_ICE_PARAMETERS_INVALID',

  // Router errors
  ROUTER_NOT_FOUND: 'ROUTER_NOT_FOUND',
  ROUTER_RTP_CAPABILITIES_INVALID: 'ROUTER_RTP_CAPABILITIES_INVALID',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_REQUEST: 'INVALID_REQUEST',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // System errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  CONNECTION_REFUSED: 'CONNECTION_REFUSED',

  // Database errors
  DATABASE_ERROR: 'DATABASE_ERROR',
  DATABASE_CONNECTION_ERROR: 'DATABASE_CONNECTION_ERROR',
  DATABASE_QUERY_ERROR: 'DATABASE_QUERY_ERROR',

  // Redis errors
  REDIS_ERROR: 'REDIS_ERROR',
  REDIS_CONNECTION_ERROR: 'REDIS_CONNECTION_ERROR',

  // Django integration errors
  DJANGO_ERROR: 'DJANGO_ERROR',
  DJANGO_CONNECTION_ERROR: 'DJANGO_CONNECTION_ERROR',
  DJANGO_WEBHOOK_ERROR: 'DJANGO_WEBHOOK_ERROR',

  // Mediasoup errors
  MEDIASOUP_ERROR: 'MEDIASOUP_ERROR',
  MEDIASOUP_WORKER_ERROR: 'MEDIASOUP_WORKER_ERROR',
  MEDIASOUP_ROUTER_ERROR: 'MEDIASOUP_ROUTER_ERROR',
} as const;

// Error factory functions
export const createAuthError = (code: string, message: string, details?: any) => {
  return new SFUError(code, message, details);
};

export const createRoomError = (code: string, message: string, roomId?: string, details?: any) => {
  return new SFUError(code, message, { roomId, ...details });
};

export const createParticipantError = (code: string, message: string, participantId?: string, roomId?: string, details?: any) => {
  return new SFUError(code, message, { participantId, roomId, ...details });
};

export const createProducerError = (code: string, message: string, producerId?: string, roomId?: string, details?: any) => {
  return new SFUError(code, message, { producerId, roomId, ...details });
};

export const createConsumerError = (code: string, message: string, consumerId?: string, roomId?: string, details?: any) => {
  return new SFUError(code, message, { consumerId, roomId, ...details });
};

export const createTransportError = (code: string, message: string, transportId?: string, roomId?: string, details?: any) => {
  return new SFUError(code, message, { transportId, roomId, ...details });
};

export const createValidationError = (message: string, field?: string, details?: any) => {
  return new SFUError(ERROR_CODES.VALIDATION_ERROR, message, { field, ...details });
};

export const createSystemError = (message: string, component?: string, details?: any) => {
  return new SFUError(ERROR_CODES.INTERNAL_ERROR, message, { component, ...details });
};

// Common error messages
export const ERROR_MESSAGES = {
  AUTH_TOKEN_MISSING: 'Authentication token is required',
  AUTH_TOKEN_INVALID: 'Invalid authentication token',
  AUTH_TOKEN_EXPIRED: 'Authentication token has expired',
  AUTH_USER_NOT_FOUND: 'User not found',
  AUTH_INSUFFICIENT_PERMISSIONS: 'Insufficient permissions',

  ROOM_NOT_FOUND: 'Room not found',
  ROOM_ALREADY_EXISTS: 'Room already exists',
  ROOM_FULL: 'Room is full',
  ROOM_INACTIVE: 'Room is inactive',
  ROOM_ACCESS_DENIED: 'Access denied to room',

  PARTICIPANT_NOT_FOUND: 'Participant not found',
  PARTICIPANT_ALREADY_JOINED: 'Participant already joined',
  PARTICIPANT_NOT_IN_ROOM: 'Participant not in room',

  PRODUCER_NOT_FOUND: 'Producer not found',
  PRODUCER_ALREADY_EXISTS: 'Producer already exists',
  PRODUCER_KIND_INVALID: 'Invalid producer kind',
  PRODUCER_RTP_PARAMETERS_INVALID: 'Invalid RTP parameters for producer',

  CONSUMER_NOT_FOUND: 'Consumer not found',
  CONSUMER_ALREADY_EXISTS: 'Consumer already exists',
  CONSUMER_RTP_CAPABILITIES_INVALID: 'Invalid RTP capabilities for consumer',

  TRANSPORT_NOT_FOUND: 'Transport not found',
  TRANSPORT_ALREADY_EXISTS: 'Transport already exists',
  TRANSPORT_DTLS_PARAMETERS_INVALID: 'Invalid DTLS parameters',
  TRANSPORT_ICE_PARAMETERS_INVALID: 'Invalid ICE parameters',

  ROUTER_NOT_FOUND: 'Router not found',
  ROUTER_RTP_CAPABILITIES_INVALID: 'Invalid RTP capabilities for router',

  VALIDATION_ERROR: 'Validation error',
  INVALID_REQUEST: 'Invalid request',
  MISSING_REQUIRED_FIELD: 'Missing required field',

  INTERNAL_ERROR: 'Internal server error',
  SERVICE_UNAVAILABLE: 'Service unavailable',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded',
  RESOURCE_EXHAUSTED: 'Resource exhausted',

  NETWORK_ERROR: 'Network error',
  CONNECTION_TIMEOUT: 'Connection timeout',
  CONNECTION_REFUSED: 'Connection refused',

  DATABASE_ERROR: 'Database error',
  DATABASE_CONNECTION_ERROR: 'Database connection error',
  DATABASE_QUERY_ERROR: 'Database query error',

  REDIS_ERROR: 'Redis error',
  REDIS_CONNECTION_ERROR: 'Redis connection error',

  DJANGO_ERROR: 'Django integration error',
  DJANGO_CONNECTION_ERROR: 'Django connection error',
  DJANGO_WEBHOOK_ERROR: 'Django webhook error',

  MEDIASOUP_ERROR: 'Mediasoup error',
  MEDIASOUP_WORKER_ERROR: 'Mediasoup worker error',
  MEDIASOUP_ROUTER_ERROR: 'Mediasoup router error',
} as const;

// Error handler for async operations
export const handleAsyncError = (error: unknown): SFUError => {
  if (error instanceof SFUError) {
    return error;
  }

  if (error instanceof Error) {
    return createSystemError(error.message, undefined, { originalError: error.name });
  }

  return createSystemError('Unknown error occurred', undefined, { originalError: String(error) });
};

// Error response formatter
export const formatErrorResponse = (error: SFUError) => {
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    timestamp: new Date().toISOString(),
  };
};
