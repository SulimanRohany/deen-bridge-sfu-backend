import { z } from 'zod';
import { createValidationError } from './errors';

// Common validation schemas
export const uuidSchema = z.string().uuid('Invalid UUID format');
// Flexible schema that accepts any non-empty string (for Django session IDs which are numeric)
export const flexibleUuidSchema = z.string()
  .min(1, 'ID cannot be empty')
  .refine((val) => {
    // Accept any non-empty string - no UUID format requirement
    return typeof val === 'string' && val.length > 0;
  }, {
    message: 'ID must be a non-empty string'
  });
export const emailSchema = z.string().email('Invalid email format');
export const nonEmptyStringSchema = z.string().min(1, 'String cannot be empty');
export const positiveNumberSchema = z.number().positive('Number must be positive');
export const nonNegativeNumberSchema = z.number().nonnegative('Number must be non-negative');

// Room validation schemas
export const createRoomSchema = z.object({
  name: z.string().min(1, 'Room name is required').max(100, 'Room name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  maxParticipants: z.number().min(1, 'Max participants must be at least 1').max(1000, 'Max participants too high').optional(),
});

export const joinRoomSchema = z.object({
  roomId: flexibleUuidSchema, // Accept any non-empty string ID (Django session IDs are not UUIDs)
  displayName: z.string().min(1, 'Display name is required').max(50, 'Display name too long'),
  metadata: z.record(z.any()).optional(),
});

export const leaveRoomSchema = z.object({
  roomId: flexibleUuidSchema, // Accept any non-empty string ID (Django session IDs are not UUIDs)
});

// Producer validation schemas
export const publishSchema = z.object({
  roomId: flexibleUuidSchema, // Accept any non-empty string ID (Django session IDs are not UUIDs)
  kind: z.enum(['audio', 'video'], { errorMap: () => ({ message: 'Kind must be audio or video' }) }),
  rtpParameters: z.object({
    codecs: z.array(z.any()).min(1, 'RTP parameters must include codecs'),
    headerExtensions: z.array(z.any()).optional(),
    encodings: z.array(z.any()).optional(),
    rtcp: z.object({
      cname: z.string().optional(),
      reducedSize: z.boolean().optional(),
    }).optional(),
  }),
  appData: z.any().optional(),
});

export const unpublishSchema = z.object({
  roomId: flexibleUuidSchema, // Accept any non-empty string ID (Django session IDs are not UUIDs)
  producerId: z.string().min(1, 'Producer ID is required'),
});

// Consumer validation schemas
export const subscribeSchema = z.object({
  roomId: flexibleUuidSchema, // Accept any non-empty string ID (Django session IDs are not UUIDs)
  producerId: z.string().min(1, 'Producer ID is required'),
  rtpCapabilities: z.object({
    codecs: z.array(z.any()).min(1, 'RTP capabilities must include codecs'),
    headerExtensions: z.array(z.any()).optional(),
  }),
});

export const unsubscribeSchema = z.object({
  roomId: flexibleUuidSchema, // Accept any non-empty string ID (Django session IDs are not UUIDs)
  consumerId: z.string().min(1, 'Consumer ID is required'),
});

export const resumeSchema = z.object({
  roomId: flexibleUuidSchema, // Accept any non-empty string ID (Django session IDs are not UUIDs)
  consumerId: z.string().min(1, 'Consumer ID is required'),
});

export const pauseSchema = z.object({
  roomId: flexibleUuidSchema, // Accept any non-empty string ID (Django session IDs are not UUIDs)
  consumerId: z.string().min(1, 'Consumer ID is required'),
});

// Producer pause/resume validation schemas
export const pauseProducerSchema = z.object({
  roomId: flexibleUuidSchema, // Accept any non-empty string ID (Django session IDs are not UUIDs)
  producerId: z.string().min(1, 'Producer ID is required'),
});

export const resumeProducerSchema = z.object({
  roomId: flexibleUuidSchema, // Accept any non-empty string ID (Django session IDs are not UUIDs)
  producerId: z.string().min(1, 'Producer ID is required'),
});

export const setPreferredLayersSchema = z.object({
  roomId: flexibleUuidSchema, // Accept any non-empty string ID (Django session IDs are not UUIDs)
  consumerId: z.string().min(1, 'Consumer ID is required'),
  spatialLayer: z.number().int().min(0, 'Spatial layer must be non-negative'),
  temporalLayer: z.number().int().min(0, 'Temporal layer must be non-negative'),
});

// Transport validation schemas
export const createWebRtcTransportSchema = z.object({
  roomId: flexibleUuidSchema, // Accept any non-empty string ID (Django session IDs are not UUIDs)
  direction: z.enum(['send', 'recv'], { errorMap: () => ({ message: 'Direction must be send or recv' }) }),
  sctpCapabilities: z.any().optional(),
});

export const connectWebRtcTransportSchema = z.object({
  roomId: flexibleUuidSchema, // Accept any non-empty string ID (Django session IDs are not UUIDs)
  transportId: z.string().min(1, 'Transport ID is required'),
  dtlsParameters: z.object({
    role: z.enum(['auto', 'client', 'server'], { errorMap: () => ({ message: 'Invalid DTLS role' }) }),
    fingerprints: z.array(z.object({
      algorithm: z.string(),
      value: z.string(),
    })).min(1, 'DTLS parameters must include fingerprints'),
  }),
});

export const restartIceSchema = z.object({
  roomId: flexibleUuidSchema, // Accept any non-empty string ID (Django session IDs are not UUIDs)
  transportId: z.string().min(1, 'Transport ID is required'),
});

// Router validation schemas
export const getRouterRtpCapabilitiesSchema = z.object({
  roomId: flexibleUuidSchema, // Accept any non-empty string ID (Django session IDs are not UUIDs)
});

// WebSocket message validation
export const webSocketMessageSchema = z.object({
  type: z.string().min(1, 'Message type is required'),
  data: z.any().optional(),
  requestId: z.string().optional(),
  error: z.string().optional(),
});

// JWT validation
export const jwtClaimsSchema = z.object({
  user_id: z.string().min(1, 'User ID is required'),
  email: emailSchema,
  full_name: z.string().min(1, 'Full name is required'),
  role: z.enum(['student', 'teacher', 'parent', 'staff', 'super_admin']),
  exp: z.number().positive('Expiration time must be positive'),
  iat: z.number().positive('Issued at time must be positive'),
  jti: z.string().min(1, 'JTI is required'),
  token_type: z.enum(['access', 'refresh']),
});

// Validation helper functions
export const validateRequest = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw createValidationError(
        firstError?.message || 'Validation failed',
        firstError?.path.join('.') || 'unknown',
        { errors: error.errors }
      );
    }
    throw createValidationError('Validation failed', undefined, { originalError: error });
  }
};

export const validatePartialRequest = <T>(schema: z.ZodSchema<T>, data: unknown): Partial<T> => {
  try {
    return (schema as any).partial().parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw createValidationError(
        firstError?.message || 'Validation failed',
        firstError?.path.join('.') || 'unknown',
        { errors: error.errors }
      );
    }
    throw createValidationError('Validation failed', undefined, { originalError: error });
  }
};

// Sanitization helpers
export const sanitizeString = (str: string, maxLength: number = 1000): string => {
  return str.trim().slice(0, maxLength);
};

export const sanitizeDisplayName = (displayName: string): string => {
  return sanitizeString(displayName, 50).replace(/[<>]/g, '');
};

export const sanitizeRoomName = (name: string): string => {
  return sanitizeString(name, 100).replace(/[<>]/g, '');
};

export const sanitizeDescription = (description: string): string => {
  return sanitizeString(description, 500).replace(/[<>]/g, '');
};

// Type guards
export const isWebSocketMessage = (data: unknown): data is { type: string; data?: any; requestId?: string; error?: string } => {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    typeof (data as any).type === 'string'
  );
};

export const isJWTClaims = (data: unknown): data is {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  exp: number;
  iat: number;
  jti: string;
  token_type: string;
} => {
  try {
    jwtClaimsSchema.parse(data);
    return true;
  } catch {
    return false;
  }
};

// Validation middleware factory
export const createValidationMiddleware = <T>(schema: z.ZodSchema<T>) => {
  return (data: unknown): T => {
    return validateRequest(schema, data);
  };
};
