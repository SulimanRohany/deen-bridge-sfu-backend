import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { logWebSocketEvent } from '@/utils/logger';
import { createSystemError, ERROR_CODES } from '@/utils/errors';
import { WebSocketMessage, JWTClaims, User } from '@/types';
import { authService } from './auth';
import { roomService } from './room';
import { webhookService } from './webhook';
import { databaseService } from './database';
import { metricsService } from './metrics';
import { validateRequest } from '@/utils/validation';
import {
  createRoomSchema,
  joinRoomSchema,
  leaveRoomSchema,
  publishSchema,
  unpublishSchema,
  subscribeSchema,
  unsubscribeSchema,
  resumeSchema,
  pauseSchema,
  pauseProducerSchema,
  resumeProducerSchema,
  setPreferredLayersSchema,
  createWebRtcTransportSchema,
  connectWebRtcTransportSchema,
  restartIceSchema,
  getRouterRtpCapabilitiesSchema,
} from '@/utils/validation';

// const logger = createLogger({ component: 'websocket' });

export interface WebSocketConnection {
  id: string;
  ws: WebSocket;
  user: User;
  claims: JWTClaims;
  participantId?: string;
  roomId?: string;
  isAlive: boolean;
  lastPing: number;
  createdAt: Date;
}

export class WebSocketService {
  private connections = new Map<string, WebSocketConnection>();
  private roomConnections = new Map<string, Set<string>>();
  private pingInterval?: NodeJS.Timeout;
  private userConnectionAttempts = new Map<string, number>();

  constructor() {
    this.startPingInterval();
  }

  private startPingInterval(): void {
    // Send ping every 30 seconds
    this.pingInterval = setInterval(() => {
      this.pingConnections();
    }, 30000);
  }

  private pingConnections(): void {
    const now = Date.now();
    const timeout = 60000; // 60 seconds timeout

    for (const [connectionId, connection] of this.connections.entries()) {
      if (now - connection.lastPing > timeout) {
        logWebSocketEvent('warn', 'Connection timeout, closing', connectionId, connection.user.id);
        this.closeConnection(connectionId, 'timeout');
        continue;
      }

      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.ping();
        connection.lastPing = now;
      }
    }
  }

  async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    const connectionId = uuidv4();
    
    try {
      // Extract JWT token from query parameter or authorization header
      let authHeader = req.headers.authorization;
      
      // If no auth header, try to get token from query parameter
      if (!authHeader && req.url) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get('token');
        if (token) {
          authHeader = `Bearer ${token}`;
        }
      }
      
      const { claims, user } = await authService.authenticateUser(authHeader);

      // Rate limit connection attempts per user
      const now = Date.now();
      const lastAttempt = this.userConnectionAttempts.get(user.id) || 0;
      
      if (now - lastAttempt < 500) { // Minimum 500ms between connections
        logWebSocketEvent('warn', 'Rate limiting connection attempt', connectionId, user.id);
        ws.close(1008, 'Rate limited');
        return;
      }
      
      this.userConnectionAttempts.set(user.id, now);

      // Check for existing connections from the same user and close them
      const existingConnections = Array.from(this.connections.values())
        .filter(conn => conn.user.id === user.id);
      
      if (existingConnections.length > 0) {
        logWebSocketEvent('info', 'Closing existing connections for user', connectionId, user.id, {
          existingCount: existingConnections.length
        });
        
        for (const existingConn of existingConnections) {
          existingConn.ws.close(1000, 'New connection established');
          this.connections.delete(existingConn.id);
        }
      }

      const connection: WebSocketConnection = {
        id: connectionId,
        ws,
        user,
        claims,
        isAlive: true,
        lastPing: Date.now(),
        createdAt: new Date(),
      };

      this.connections.set(connectionId, connection);

      // Set up event handlers
      this.setupConnectionHandlers(connection);

      logWebSocketEvent('info', 'WebSocket connection established', connectionId, user.id, {
        email: user.email,
        role: user.role,
      });

      // Send welcome message
      this.sendMessage(connectionId, {
        type: 'connected',
        data: {
          connectionId,
          user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
          },
        },
      });

      metricsService.incrementWebSocketMessage('connected', 'success');
    } catch (error) {
      logWebSocketEvent('error', 'WebSocket connection failed', connectionId, undefined, {
        error: error instanceof Error ? error.message : String(error),
      });

      ws.close(1008, 'Authentication failed');
      metricsService.incrementWebSocketMessage('connected', 'error');
    }
  }

  private setupConnectionHandlers(connection: WebSocketConnection): void {
    connection.ws.on('message', async (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        await this.handleMessage(connection, message);
      } catch (error) {
        logWebSocketEvent('error', 'Failed to parse WebSocket message', connection.id, connection.user.id, {
          error: error instanceof Error ? error.message : String(error),
        });
        
        this.sendError(connection.id, 'INVALID_MESSAGE', 'Invalid message format');
        metricsService.incrementWebSocketMessage('message', 'error');
      }
    });

    connection.ws.on('pong', () => {
      connection.lastPing = Date.now();
    });

    connection.ws.on('close', (code: number, reason: string) => {
      logWebSocketEvent('info', 'WebSocket connection closed', connection.id, connection.user.id, {
        code,
        reason,
      });

      this.handleDisconnection(connection);
    });

    connection.ws.on('error', (error: Error) => {
      logWebSocketEvent('error', 'WebSocket error', connection.id, connection.user.id, {
        error: error.message,
      });

      this.handleDisconnection(connection);
    });
  }

  private async handleMessage(connection: WebSocketConnection, message: WebSocketMessage): Promise<void> {
    try {
      logWebSocketEvent('info', 'Handling WebSocket message', connection.id, connection.user.id, {
        type: message.type,
        requestId: message.requestId,
      });

      let response: any;

      switch (message.type) {
        case 'createRoom':
          response = await this.handleCreateRoom(connection, message);
          break;
        case 'joinRoom':
          response = await this.handleJoinRoom(connection, message);
          break;
        case 'leaveRoom':
          response = await this.handleLeaveRoom(connection, message);
          break;
        case 'getRouterRtpCapabilities':
          response = await this.handleGetRouterRtpCapabilities(connection, message);
          break;
        case 'createWebRtcTransport':
          response = await this.handleCreateWebRtcTransport(connection, message);
          break;
        case 'connectWebRtcTransport':
          response = await this.handleConnectWebRtcTransport(connection, message);
          break;
        case 'restartIce':
          response = await this.handleRestartIce(connection, message);
          break;
        case 'ping':
          response = { type: 'pong', data: { timestamp: Date.now() } };
          break;
        case 'publish':
          response = await this.handlePublish(connection, message);
          break;
        case 'unpublish':
          response = await this.handleUnpublish(connection, message);
          break;
        case 'subscribe':
          response = await this.handleSubscribe(connection, message);
          break;
        case 'unsubscribe':
          response = await this.handleUnsubscribe(connection, message);
          break;
        case 'resume':
          response = await this.handleResume(connection, message);
          break;
        case 'pause':
          response = await this.handlePause(connection, message);
          break;
        case 'pauseProducer':
          response = await this.handlePauseProducer(connection, message);
          break;
        case 'resumeProducer':
          response = await this.handleResumeProducer(connection, message);
          break;
        case 'setPreferredLayers':
          response = await this.handleSetPreferredLayers(connection, message);
          break;
        default:
          throw createSystemError(ERROR_CODES.INVALID_REQUEST, `Unknown message type: ${message.type}`);
      }

      this.sendMessage(connection.id, {
        type: `${message.type}Response`,
        data: response,
        ...(message.requestId && { requestId: message.requestId }),
      });

      metricsService.incrementWebSocketMessage(message.type, 'success');
    } catch (error) {
      logWebSocketEvent('error', 'Failed to handle WebSocket message', connection.id, connection.user.id, {
        error: error instanceof Error ? error.message : String(error),
        messageType: message.type,
      });

      this.sendError(connection.id, error instanceof Error ? error.message : String(error), message.requestId);
      metricsService.incrementWebSocketMessage(message.type, 'error');
    }
  }

  private async handleCreateRoom(connection: WebSocketConnection, message: WebSocketMessage): Promise<any> {
    const data = validateRequest(createRoomSchema, message.data);
    
    const room = await roomService.createRoom(
      data.name,
      data.description,
      data.maxParticipants,
      'sfu-001' // TODO: Get from config
    );

    // Log room creation event (optional - skip if database not available)
    try {
      await databaseService.logRoomEvent({
        id: uuidv4(),
        room_id: room.id,
        event_type: 'room.created',
        event_data: {
          name: room.name,
          description: room.description,
          maxParticipants: room.maxParticipants,
          createdBy: connection.user.id,
        },
        created_at: new Date(),
      });
    } catch (error) {
      // Ignore database errors in development
      logWebSocketEvent('warn', 'Failed to log room creation event', connection.id, connection.user.id, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Send webhook
    await webhookService.sendRoomCreated(
      room.id,
      room.name,
      room.description,
      room.maxParticipants,
      connection.user.id,
      'sfu-001'
    );

    metricsService.incrementRoomCreation();

    return {
      roomId: room.id,
      name: room.name,
      description: room.description,
      maxParticipants: room.maxParticipants,
    };
  }

  private async handleJoinRoom(connection: WebSocketConnection, message: WebSocketMessage): Promise<any> {
    // Log the incoming message data for debugging
    logWebSocketEvent('info', 'Processing joinRoom request', connection.id, connection.user.id, {
      roomId: message.data?.roomId,
      roomIdType: typeof message.data?.roomId,
      displayName: message.data?.displayName,
      rawData: message.data,
    });
    
    // Ensure roomId is a string (Django session IDs are numeric, but we accept any string)
    if (message.data?.roomId !== undefined && message.data?.roomId !== null) {
      message.data.roomId = String(message.data.roomId);
    }
    
    try {
      const data = validateRequest(joinRoomSchema, message.data);
      
      // Log after validation
      logWebSocketEvent('info', 'JoinRoom validation passed', connection.id, connection.user.id, {
        roomId: data.roomId,
        roomIdType: typeof data.roomId,
      });
    
      // Check room access
      const hasAccess = await authService.validateRoomAccess(connection.user.id, data.roomId);
      if (!hasAccess) {
        throw createSystemError(ERROR_CODES.ROOM_ACCESS_DENIED, 'Access denied to room');
      }

      const participant = await roomService.joinRoom(
        data.roomId,
        connection.user.id,
        connection.user,
        data.displayName,
        data.metadata
      );

      connection.participantId = participant.id;
      connection.roomId = data.roomId;

      // Add to room connections (check if already exists to prevent duplicates)
      if (!this.roomConnections.has(data.roomId)) {
        this.roomConnections.set(data.roomId, new Set());
      }
      
      const roomConnections = this.roomConnections.get(data.roomId)!;
      if (!roomConnections.has(connection.id)) {
        roomConnections.add(connection.id);
      }

      // Get room participants
      const participants = roomService.getRoomParticipants(data.roomId);
      
      // Filter out hidden participants for non-observer users
      // Observers can see everyone, but regular users cannot see observers
      const isObserver = participant.isHidden === true;
      const visibleParticipants = isObserver 
        ? participants  // Observers see all participants
        : participants.filter(p => !p.isHidden);  // Regular users don't see hidden participants
      
      const participantInfos = visibleParticipants.map(p => {
        const info = roomService.getParticipantInfo(p);
        // Include producer IDs so new participants can subscribe to existing streams
        const producers = Array.from(p.producers.values()).map(prod => ({
          id: prod.id,
          kind: prod.kind,
          paused: prod.paused
        }));
        return { ...info, producers };
      });

      // Debug log
      logWebSocketEvent('info', 'Returning participants in joinRoom response', connection.id, connection.user.id, {
        totalParticipants: participantInfos.length,
        participantUserIds: participantInfos.map(p => p.userId),
        currentUserId: connection.user.id,
        isObserver,
        participantsWithProducers: participantInfos.map(p => ({ 
          userId: p.userId, 
          producerCount: p.producers?.length || 0,
          isHidden: p.isHidden 
        }))
      });

      // Log participant join event (optional - skip if database not available)
      try {
        await databaseService.logRoomEvent({
          id: uuidv4(),
          room_id: data.roomId,
          participant_id: participant.id,
          event_type: 'participant.joined',
          event_data: {
            userId: connection.user.id,
            displayName: data.displayName,
          },
          created_at: new Date(),
        });
      } catch (error) {
        // Ignore database errors in development
        logWebSocketEvent('warn', 'Failed to log participant join event', connection.id, connection.user.id, {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Send webhook
      await webhookService.sendParticipantJoined(
        data.roomId,
        participant.id,
        connection.user.id,
        data.displayName,
        participant.joinedAt.toISOString()
      );

      // Only notify other participants if this is a new join (not a duplicate)
      // AND if the joining participant is NOT hidden (observers should not be announced)
      const isNewParticipant = participant.joinedAt.getTime() > (Date.now() - 1000); // Joined within last second
      if (isNewParticipant && !participant.isHidden) {
        this.broadcastToRoom(data.roomId, {
          type: 'participantJoined',
          data: {
            roomId: data.roomId,
            participant: roomService.getParticipantInfo(participant),
          },
        }, connection.id);
      }

      metricsService.incrementParticipantJoin(data.roomId);

      return {
        roomId: data.roomId,
        participants: participantInfos,
        routerRtpCapabilities: roomService.getRouterRtpCapabilities(data.roomId),
      };
    } catch (validationError) {
      // Enhanced error logging for validation errors
      logWebSocketEvent('error', 'JoinRoom validation failed', connection.id, connection.user.id, {
        error: validationError instanceof Error ? validationError.message : String(validationError),
        roomId: message.data?.roomId,
        roomIdType: typeof message.data?.roomId,
        errorStack: validationError instanceof Error ? validationError.stack : undefined,
      });
      throw validationError;
    }
  }

  private async handleLeaveRoom(connection: WebSocketConnection, message: WebSocketMessage): Promise<any> {
    const data = validateRequest(leaveRoomSchema, message.data);
    
    if (!connection.participantId || !connection.roomId) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_IN_ROOM, 'Not in a room');
    }

    const participant = roomService.getParticipant(connection.participantId);
    if (!participant) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Participant not found');
    }

    // Log participant leave event (optional - skip if database not available)
    try {
      await databaseService.logRoomEvent({
        id: uuidv4(),
        room_id: data.roomId,
        participant_id: connection.participantId,
        event_type: 'participant.left',
        event_data: {
          userId: connection.user.id,
          displayName: participant.displayName,
        },
        created_at: new Date(),
      });
    } catch (error) {
      // Ignore database errors in development
      logWebSocketEvent('warn', 'Failed to log participant leave event', connection.id, connection.user.id, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Send webhook
    await webhookService.sendParticipantLeft(
      data.roomId,
      connection.participantId,
      connection.user.id,
      new Date().toISOString()
    );

    // Notify other participants
    this.broadcastToRoom(data.roomId, {
      type: 'participantLeft',
      data: {
        roomId: data.roomId,
        participantId: connection.participantId,
      },
    }, connection.id);

    await roomService.leaveRoom(data.roomId, connection.participantId);

    // Remove from room connections
    this.roomConnections.get(data.roomId)?.delete(connection.id);
    if (this.roomConnections.get(data.roomId)?.size === 0) {
      this.roomConnections.delete(data.roomId);
    }

    delete connection.participantId;
    delete connection.roomId;

    metricsService.incrementParticipantLeave(data.roomId);

    return { success: true };
  }

  private async handleGetRouterRtpCapabilities(connection: WebSocketConnection, message: WebSocketMessage): Promise<any> {
    const data = validateRequest(getRouterRtpCapabilitiesSchema, message.data);
    
    if (!connection.roomId) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_IN_ROOM, 'Not in a room');
    }

    const rtpCapabilities = roomService.getRouterRtpCapabilities(data.roomId);
    return { rtpCapabilities };
  }

  private async handleCreateWebRtcTransport(connection: WebSocketConnection, message: WebSocketMessage): Promise<any> {
    const data = validateRequest(createWebRtcTransportSchema, message.data);
    
    if (!connection.participantId || !connection.roomId) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_IN_ROOM, 'Not in a room');
    }

    const transport = await roomService.createTransport(
      data.roomId,
      connection.participantId,
      data.direction,
      data.sctpCapabilities
    );

    return {
      transportId: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters,
    };
  }

  private async handleConnectWebRtcTransport(connection: WebSocketConnection, message: WebSocketMessage): Promise<any> {
    const data = validateRequest(connectWebRtcTransportSchema, message.data);
    
    if (!connection.participantId || !connection.roomId) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_IN_ROOM, 'Not in a room');
    }

    const participant = roomService.getParticipant(connection.participantId);
    if (!participant) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Participant not found');
    }

    // Find the transport by ID
    const transport = 
      participant.sendTransport?.id === data.transportId ? participant.sendTransport :
      participant.recvTransport?.id === data.transportId ? participant.recvTransport :
      null;

    if (!transport) {
      logWebSocketEvent('error', 'Transport not found for connection', connection.id, connection.user.id, {
        transportId: data.transportId,
        hasSendTransport: !!participant.sendTransport,
        hasRecvTransport: !!participant.recvTransport,
        sendTransportId: participant.sendTransport?.id,
        recvTransportId: participant.recvTransport?.id
      });
      throw createSystemError(ERROR_CODES.TRANSPORT_NOT_FOUND, 'Transport not found');
    }

    const transportType = participant.sendTransport?.id === data.transportId ? 'send' : 'recv';
    logWebSocketEvent('info', `Connecting ${transportType} transport`, connection.id, connection.user.id, {
      transportId: data.transportId
    });

    await transport.connect({ 
      dtlsParameters: {
        ...data.dtlsParameters,
        fingerprints: data.dtlsParameters.fingerprints.map(fp => ({
          ...fp,
          algorithm: fp.algorithm as any
        }))
      }
    });

    logWebSocketEvent('info', `${transportType} transport connected`, connection.id, connection.user.id, {
      transportId: data.transportId
    });

    return { success: true };
  }

  private async handleRestartIce(connection: WebSocketConnection, message: WebSocketMessage): Promise<any> {
    const data = validateRequest(restartIceSchema, message.data);
    
    if (!connection.participantId || !connection.roomId) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_IN_ROOM, 'Not in a room');
    }

    const participant = roomService.getParticipant(connection.participantId);
    if (!participant) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Participant not found');
    }

    // Find the transport by ID
    const transport = 
      participant.sendTransport?.id === data.transportId ? participant.sendTransport :
      participant.recvTransport?.id === data.transportId ? participant.recvTransport :
      null;

    if (!transport) {
      throw createSystemError(ERROR_CODES.TRANSPORT_NOT_FOUND, 'Transport not found');
    }

    const iceParameters = await transport.restartIce();
    return { iceParameters };
  }

  private async handlePublish(connection: WebSocketConnection, message: WebSocketMessage): Promise<any> {
    const data = validateRequest(publishSchema, message.data);
    
    if (!connection.participantId || !connection.roomId) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_IN_ROOM, 'Not in a room');
    }

    const rtpParameters: any = {
      codecs: data.rtpParameters.codecs,
      headerExtensions: data.rtpParameters.headerExtensions || [],
      encodings: data.rtpParameters.encodings || []
    };
    
    if (data.rtpParameters.rtcp) {
      rtpParameters.rtcp = data.rtpParameters.rtcp;
    }
    
    // Log the full rtpParameters for debugging

    const producerInfo = await roomService.createProducer(
      data.roomId,
      connection.participantId,
      data.kind,
      rtpParameters,
      data.appData
    );

    // Notify other participants
    this.broadcastToRoom(data.roomId, {
      type: 'producerCreated',
      data: {
        roomId: data.roomId,
        participantId: connection.participantId,
        producer: {
          id: producerInfo.id,
          kind: producerInfo.kind,
          paused: producerInfo.paused,
          appData: producerInfo.appData, // Include appData to identify screen shares
        },
      },
    }, connection.id);

    return {
      producerId: producerInfo.id,
      kind: producerInfo.kind,
      rtpParameters: producerInfo.rtpParameters,
    };
  }

  private async handleUnpublish(connection: WebSocketConnection, message: WebSocketMessage): Promise<any> {
    const data = validateRequest(unpublishSchema, message.data);
    
    if (!connection.participantId || !connection.roomId) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_IN_ROOM, 'Not in a room');
    }

    const participant = roomService.getParticipant(connection.participantId);
    if (!participant) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Participant not found');
    }

    const producerInfo = participant.producers.get(data.producerId);
    if (!producerInfo) {
      throw createSystemError(ERROR_CODES.PRODUCER_NOT_FOUND, 'Producer not found');
    }

    producerInfo.producer.close();
    participant.producers.delete(data.producerId);

    // Notify other participants
    this.broadcastToRoom(data.roomId, {
      type: 'producerClosed',
      data: {
        roomId: data.roomId,
        participantId: connection.participantId,
        producerId: data.producerId,
      },
    }, connection.id);

    return { success: true };
  }

  private async handleSubscribe(connection: WebSocketConnection, message: WebSocketMessage): Promise<any> {
    const data = validateRequest(subscribeSchema, message.data);
    
    if (!connection.participantId || !connection.roomId) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_IN_ROOM, 'Not in a room');
    }

    // Get the producer info to retrieve appData (for screen share detection)
    const producerInfo = roomService.getProducerInfo(data.producerId);
    
    const consumerInfo = await roomService.createConsumer(
      data.roomId,
      connection.participantId,
      data.producerId,
      {
        ...data.rtpCapabilities,
        headerExtensions: data.rtpCapabilities.headerExtensions || []
      },
      producerInfo?.appData // Pass producer's appData to consumer
    );

    // Resume the consumer immediately on the server side
    // This ensures media starts flowing without waiting for client resume call
    const participant = roomService.getParticipant(connection.participantId);
    if (participant) {
      const consumer = participant.consumers.get(consumerInfo.id);
      if (consumer && consumer.consumer.paused) {
        logWebSocketEvent('info', 'Auto-resuming consumer on server', connection.id, connection.user.id, {
          consumerId: consumerInfo.id,
          producerId: data.producerId
        });
        await consumer.consumer.resume();
      }
    }

    return {
      consumerId: consumerInfo.id,
      producerId: consumerInfo.producerId,
      kind: consumerInfo.kind,
      rtpParameters: consumerInfo.rtpParameters,
      paused: false, // Return paused as false since we just resumed it
      appData: consumerInfo.appData, // Include appData for screen share detection
    };
  }

  private async handleUnsubscribe(connection: WebSocketConnection, message: WebSocketMessage): Promise<any> {
    const data = validateRequest(unsubscribeSchema, message.data);
    
    if (!connection.participantId || !connection.roomId) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_IN_ROOM, 'Not in a room');
    }

    const participant = roomService.getParticipant(connection.participantId);
    if (!participant) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Participant not found');
    }

    const consumerInfo = participant.consumers.get(data.consumerId);
    if (!consumerInfo) {
      throw createSystemError(ERROR_CODES.CONSUMER_NOT_FOUND, 'Consumer not found');
    }

    consumerInfo.consumer.close();
    participant.consumers.delete(data.consumerId);

    return { success: true };
  }

  private async handleResume(connection: WebSocketConnection, message: WebSocketMessage): Promise<any> {
    const data = validateRequest(resumeSchema, message.data);
    
    if (!connection.participantId || !connection.roomId) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_IN_ROOM, 'Not in a room');
    }

    const participant = roomService.getParticipant(connection.participantId);
    if (!participant) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Participant not found');
    }

    const consumerInfo = participant.consumers.get(data.consumerId);
    if (!consumerInfo) {
      throw createSystemError(ERROR_CODES.CONSUMER_NOT_FOUND, 'Consumer not found');
    }

    await consumerInfo.consumer.resume();
    consumerInfo.paused = false;

    return { success: true };
  }

  private async handlePause(connection: WebSocketConnection, message: WebSocketMessage): Promise<any> {
    const data = validateRequest(pauseSchema, message.data);
    
    if (!connection.participantId || !connection.roomId) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_IN_ROOM, 'Not in a room');
    }

    const participant = roomService.getParticipant(connection.participantId);
    if (!participant) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Participant not found');
    }

    const consumerInfo = participant.consumers.get(data.consumerId);
    if (!consumerInfo) {
      throw createSystemError(ERROR_CODES.CONSUMER_NOT_FOUND, 'Consumer not found');
    }

    await consumerInfo.consumer.pause();
    consumerInfo.paused = true;

    return { success: true };
  }

  private async handlePauseProducer(connection: WebSocketConnection, message: WebSocketMessage): Promise<any> {
    const data = validateRequest(pauseProducerSchema, message.data);
    
    if (!connection.participantId || !connection.roomId) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_IN_ROOM, 'Not in a room');
    }

    const participant = roomService.getParticipant(connection.participantId);
    if (!participant) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Participant not found');
    }

    const producerInfo = participant.producers.get(data.producerId);
    if (!producerInfo) {
      throw createSystemError(ERROR_CODES.PRODUCER_NOT_FOUND, 'Producer not found');
    }

    // Pause the producer on the server side
    await producerInfo.producer.pause();
    producerInfo.paused = true;

    logWebSocketEvent('info', 'Producer paused', connection.id, connection.user.id, {
      producerId: data.producerId,
      kind: producerInfo.kind,
    });

    // Broadcast producer paused event to all other participants in the room
    this.broadcastToRoom(data.roomId, {
      type: 'producerPaused',
      data: {
        roomId: data.roomId,
        participantId: connection.participantId,
        producerId: data.producerId,
        kind: producerInfo.kind,
      },
    }, connection.id);

    return { success: true };
  }

  private async handleResumeProducer(connection: WebSocketConnection, message: WebSocketMessage): Promise<any> {
    const data = validateRequest(resumeProducerSchema, message.data);
    
    if (!connection.participantId || !connection.roomId) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_IN_ROOM, 'Not in a room');
    }

    const participant = roomService.getParticipant(connection.participantId);
    if (!participant) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Participant not found');
    }

    const producerInfo = participant.producers.get(data.producerId);
    if (!producerInfo) {
      throw createSystemError(ERROR_CODES.PRODUCER_NOT_FOUND, 'Producer not found');
    }

    // Resume the producer on the server side
    await producerInfo.producer.resume();
    producerInfo.paused = false;

    logWebSocketEvent('info', 'Producer resumed', connection.id, connection.user.id, {
      producerId: data.producerId,
      kind: producerInfo.kind,
    });

    // Broadcast producer resumed event to all other participants in the room
    this.broadcastToRoom(data.roomId, {
      type: 'producerResumed',
      data: {
        roomId: data.roomId,
        participantId: connection.participantId,
        producerId: data.producerId,
        kind: producerInfo.kind,
      },
    }, connection.id);

    return { success: true };
  }

  private async handleSetPreferredLayers(connection: WebSocketConnection, message: WebSocketMessage): Promise<any> {
    const data = validateRequest(setPreferredLayersSchema, message.data);
    
    if (!connection.participantId || !connection.roomId) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_IN_ROOM, 'Not in a room');
    }

    const participant = roomService.getParticipant(connection.participantId);
    if (!participant) {
      throw createSystemError(ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Participant not found');
    }

    const consumerInfo = participant.consumers.get(data.consumerId);
    if (!consumerInfo) {
      throw createSystemError(ERROR_CODES.CONSUMER_NOT_FOUND, 'Consumer not found');
    }

    await consumerInfo.consumer.setPreferredLayers({
      spatialLayer: data.spatialLayer,
      temporalLayer: data.temporalLayer,
    });

    return { success: true };
  }

  private handleDisconnection(connection: WebSocketConnection): void {
    if (connection.participantId && connection.roomId) {
      // Handle participant leaving room
      roomService.leaveRoom(connection.roomId, connection.participantId)
        .catch(error => {
          logWebSocketEvent('error', 'Failed to handle participant leave on disconnect', connection.id, connection.user.id, {
            error: error instanceof Error ? error.message : String(error),
          });
        });

      // Notify other participants
      this.broadcastToRoom(connection.roomId, {
        type: 'participantLeft',
        data: {
          roomId: connection.roomId,
          participantId: connection.participantId,
        },
      }, connection.id);

      // Remove from room connections
      this.roomConnections.get(connection.roomId)?.delete(connection.id);
    }

    this.connections.delete(connection.id);
  }

  private closeConnection(connectionId: string, reason: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.ws.close(1000, reason);
      this.handleDisconnection(connection);
    }
  }

  private sendMessage(connectionId: string, message: WebSocketMessage): void {
    const connection = this.connections.get(connectionId);
    if (connection && connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(JSON.stringify(message));
    }
  }

  private sendError(connectionId: string, error: string, requestId?: string): void {
    this.sendMessage(connectionId, {
      type: 'error',
      error,
      ...(requestId && { requestId }),
    });
  }

  private broadcastToRoom(roomId: string, message: WebSocketMessage, excludeConnectionId?: string): void {
    const roomConnections = this.roomConnections.get(roomId);
    if (!roomConnections) return;

    for (const connectionId of roomConnections) {
      if (connectionId !== excludeConnectionId) {
        this.sendMessage(connectionId, message);
      }
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getRoomConnectionCount(roomId: string): number {
    return this.roomConnections.get(roomId)?.size || 0;
  }

  getConnections(): WebSocketConnection[] {
    return Array.from(this.connections.values());
  }

  cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    // Close all connections
    for (const connection of this.connections.values()) {
      connection.ws.close(1000, 'Server shutdown');
    }

    this.connections.clear();
    this.roomConnections.clear();
  }
}

// Singleton instance
export const webSocketService = new WebSocketService();
