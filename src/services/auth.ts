import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-client';
import axios from 'axios';
import { config } from '@/config';
import { JWTClaims, User } from '@/types';
import { logSystemEvent } from '@/utils/logger';
import { createAuthError, ERROR_CODES } from '@/utils/errors';

// const logger = createLogger({ component: 'auth' });

export class AuthService {
  private jwksClient?: jwksClient.JwksClient;

  constructor() {
    if (config.django.jwksUrl) {
      this.jwksClient = jwksClient({
        jwksUri: config.django.jwksUrl,
        cache: true,
        cacheMaxAge: 600000, // 10 minutes
        rateLimit: true,
        jwksRequestsPerMinute: 5,
      });
    }
  }

  async verifyToken(token: string): Promise<JWTClaims> {
    try {
      // Decode token without verification first to get header
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded || typeof decoded === 'string') {
        throw createAuthError(ERROR_CODES.AUTH_TOKEN_INVALID, 'Invalid token format');
      }

      const header = decoded.header;
      const payload = decoded.payload as any;

      // Check if token is expired
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        throw createAuthError(ERROR_CODES.AUTH_TOKEN_EXPIRED, 'Token has expired');
      }

      // Verify token based on algorithm
      let secretOrKey: string | Buffer;
      
      if (config.django.jwtAlgorithm === 'RS256' && this.jwksClient) {
        // RS256 with JWKS
        const key = await this.getSigningKey(header.kid);
        secretOrKey = key;
      } else {
        // HS256 with shared secret
        secretOrKey = config.django.jwtSecret;
      }

      // Verify token (don't check issuer/audience for Django JWT tokens)
      const verified = jwt.verify(token, secretOrKey, {
        algorithms: [config.django.jwtAlgorithm],
        // Django JWT tokens don't include iss/aud by default
        // issuer: config.django.baseUrl,
        // audience: config.security.jwt.audience,
      }) as any;

      // Extract user info from nested user object or root level
      const userId = verified.user_id || verified.user?.id?.toString();
      const email = verified.email || verified.user?.email;
      const fullName = verified.full_name || verified.user?.full_name || verified.user?.fullName;
      const role = verified.role || verified.user?.role;

      // Validate required claims
      if (!userId || !email || !role) {
        throw createAuthError(ERROR_CODES.AUTH_TOKEN_INVALID, 'Token missing required claims');
      }

      // Create consistent JWTClaims object
      const claims: JWTClaims = {
        user_id: userId,
        email: email,
        full_name: fullName,
        role: role,
        token_type: verified.token_type || 'access',
        exp: verified.exp,
        iat: verified.iat,
        jti: verified.jti,
      };

      logSystemEvent('info', 'Token verified successfully', 'auth', {
        userId: claims.user_id,
        email: claims.email,
        role: claims.role,
      });

      return claims;
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw createAuthError(ERROR_CODES.AUTH_TOKEN_EXPIRED, 'Token has expired');
      }
      
      if (error instanceof Error && error.name === 'JsonWebTokenError') {
        throw createAuthError(ERROR_CODES.AUTH_TOKEN_INVALID, 'Invalid token');
      }

      logSystemEvent('error', 'Token verification failed', 'auth', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw createAuthError(ERROR_CODES.AUTH_TOKEN_INVALID, 'Token verification failed');
    }
  }

  private async getSigningKey(kid?: string): Promise<string> {
    if (!this.jwksClient) {
      throw createAuthError(ERROR_CODES.AUTH_TOKEN_INVALID, 'JWKS client not configured');
    }

    return new Promise((resolve, reject) => {
      this.jwksClient!.getSigningKey(kid!, (err, key) => {
        if (err) {
          logSystemEvent('error', 'Failed to get signing key', 'auth', {
            error: err.message,
            kid,
          });
          reject(createAuthError(ERROR_CODES.AUTH_TOKEN_INVALID, 'Failed to get signing key'));
        } else {
          resolve(key.getPublicKey());
        }
      });
    });
  }

  async getUserFromDjango(userId: string): Promise<User> {
    try {
      const response = await axios.get(`${config.django.baseUrl}/api/accounts/users/${userId}/`, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.status !== 200) {
        throw createAuthError(ERROR_CODES.AUTH_USER_NOT_FOUND, 'User not found in Django');
      }

      const userData = response.data;
      
      // Transform Django user data to our User type
      const user: User = {
        id: userData.id.toString(),
        email: userData.email,
        fullName: userData.full_name,
        role: userData.role,
        isActive: userData.is_active,
        createdAt: userData.created_at,
        updatedAt: userData.updated_at,
      };

      logSystemEvent('info', 'User fetched from Django', 'auth', {
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      return user;
    } catch (error) {
      logSystemEvent('error', 'Failed to fetch user from Django', 'auth', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });

      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw createAuthError(ERROR_CODES.AUTH_USER_NOT_FOUND, 'User not found in Django');
      }

      throw createAuthError(ERROR_CODES.DJANGO_CONNECTION_ERROR, 'Failed to fetch user from Django');
    }
  }

  async validateRoomAccess(userId: string, roomId: string): Promise<boolean> {
    // In development mode, always allow access
    if (config.server.env === 'development') {
      logSystemEvent('info', 'Development mode: allowing room access', 'auth', {
        userId,
        roomId,
      });
      return true;
    }

    try {
      // Call Django to check room access permissions
      const response = await axios.post(
        `${config.django.baseUrl}/api/sfu/room-access/`,
        {
          userId,
          roomId,
        },
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      return response.status === 200 && response.data.allowed === true;
    } catch (error) {
      logSystemEvent('warn', 'Failed to validate room access', 'auth', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        roomId,
      });

      // Default to allowing access if Django is unavailable
      return true;
    }
  }

  async getRoomPolicy(roomId: string): Promise<any> {
    try {
      const response = await axios.get(
        `${config.django.baseUrl}/api/sfu/room-policy/${roomId}/`,
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status === 200) {
        return response.data;
      }

      // Return default policy if not found
      return {
        maxParticipants: config.room.maxParticipants,
        maxBitrate: 1000000,
        allowScreenSharing: true,
        allowRecording: false,
        requireModeratorApproval: false,
      };
    } catch (error) {
      logSystemEvent('warn', 'Failed to get room policy', 'auth', {
        error: error instanceof Error ? error.message : String(error),
        roomId,
      });

      // Return default policy if Django is unavailable
      return {
        maxParticipants: config.room.maxParticipants,
        maxBitrate: 1000000,
        allowScreenSharing: true,
        allowRecording: false,
        requireModeratorApproval: false,
      };
    }
  }

  async checkUserEntitlements(userId: string): Promise<any> {
    try {
      const response = await axios.get(
        `${config.django.baseUrl}/api/sfu/user-entitlements/${userId}/`,
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status === 200) {
        return response.data;
      }

      // Return default entitlements if not found
      return {
        canCreateRooms: true,
        canJoinRooms: true,
        canScreenShare: true,
        canRecord: false,
        maxRoomsPerUser: 10,
        maxParticipantsPerRoom: config.room.maxParticipants,
      };
    } catch (error) {
      logSystemEvent('warn', 'Failed to get user entitlements', 'auth', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });

      // Return default entitlements if Django is unavailable
      return {
        canCreateRooms: true,
        canJoinRooms: true,
        canScreenShare: true,
        canRecord: false,
        maxRoomsPerUser: 10,
        maxParticipantsPerRoom: config.room.maxParticipants,
      };
    }
  }

  extractTokenFromHeader(authHeader: string | undefined): string {
    if (!authHeader) {
      throw createAuthError(ERROR_CODES.AUTH_TOKEN_MISSING, 'Authorization header is required');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw createAuthError(ERROR_CODES.AUTH_TOKEN_INVALID, 'Invalid authorization header format');
    }

    return parts[1] || '';
  }

  async authenticateUser(authHeader: string | undefined): Promise<{ claims: JWTClaims; user: User }> {
    try {
      // For development: decode JWT but skip signature validation
      if (config.server.env === 'development') {
        logSystemEvent('info', 'Development mode: skipping JWT validation', 'auth');
        
        // Try to extract token and decode it to get real user info
        let realClaims: any = null;
        try {
          const token = this.extractTokenFromHeader(authHeader);
          const decoded = jwt.decode(token) as any;
          if (decoded && decoded.user) {
            realClaims = decoded;
          }
        } catch (error) {
          // If token extraction fails, use fallback
          console.log('Failed to decode token in dev mode, using fallback');
        }

        // Use real user data if available, otherwise fallback to mock
        const userId = realClaims?.user?.id?.toString() || realClaims?.user_id?.toString() || '5';
        const email = realClaims?.user?.email || 'student2@gmail.com';
        const fullName = realClaims?.user?.full_name || realClaims?.user?.fullName || 'student2';
        const role = realClaims?.user?.role || 'student';
        
        const mockClaims: JWTClaims = {
          user_id: userId,
          email: email,
          full_name: fullName,
          role: role,
          token_type: 'access',
          exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
          iat: Math.floor(Date.now() / 1000),
          jti: 'dev-mock-jti',
        };

        const mockUser: User = {
          id: userId,
          email: email,
          fullName: fullName,
          role: role,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        return { claims: mockClaims, user: mockUser };
      }

      // Production: full JWT validation
      const token = this.extractTokenFromHeader(authHeader);
      const claims = await this.verifyToken(token);
      
      // Get user data from the token payload (already verified)
      // Decode the token to access the full payload with nested user object
      const decoded = jwt.decode(token, { complete: true }) as any;
      const payload = decoded?.payload || {};
      
      // Extract user data from token payload (Django includes full user object)
      const tokenUser = payload.user || {};
      const isActive = tokenUser.is_active !== undefined ? tokenUser.is_active : true;
      const createdAt = tokenUser.created_at || new Date().toISOString();
      const updatedAt = tokenUser.updated_at || new Date().toISOString();
      
      // Create User object from JWT token data
      const user: User = {
        id: claims.user_id,
        email: claims.email,
        fullName: claims.full_name,
        role: claims.role as 'student' | 'teacher' | 'parent' | 'staff' | 'super_admin',
        isActive: isActive,
        createdAt: createdAt,
        updatedAt: updatedAt,
      };

      if (!user.isActive) {
        throw createAuthError(ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS, 'User account is inactive');
      }

      logSystemEvent('info', 'User authenticated from JWT token', 'auth', {
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      return { claims, user };
    } catch (error) {
      if (error instanceof Error && error.name === 'SFUError') {
        throw error;
      }

      logSystemEvent('error', 'Authentication failed', 'auth', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw createAuthError(ERROR_CODES.AUTH_TOKEN_INVALID, 'Authentication failed');
    }
  }
}

// Singleton instance
export const authService = new AuthService();
