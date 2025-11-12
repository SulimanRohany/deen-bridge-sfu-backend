import { v4 as uuidv4 } from 'uuid';
import { types as mediasoupTypes } from 'mediasoup';
import { Room, Participant, ProducerInfo, ConsumerInfo, ParticipantInfo } from '@/types';
import { mediasoupService } from './mediasoup';
import { logRoomEvent } from '@/utils/logger';
import { createRoomError, createParticipantError, createProducerError, createConsumerError, ERROR_CODES } from '@/utils/errors';
import { config } from '@/config';

// const logger = createLogger({ component: 'room' });

export class RoomService {
  private rooms = new Map<string, Room>();
  private participants = new Map<string, Participant>();

  async createRoom(
    name: string,
    description?: string,
    maxParticipants: number = 100,
    instanceId: string = 'sfu-001'
  ): Promise<Room> {
    try {
      const roomId = uuidv4();
      const worker = mediasoupService.getWorker();
      const router = await mediasoupService.createRouter(worker);

      const room: Room = {
        id: roomId,
        name,
        ...(description && { description }),
        maxParticipants,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        participants: new Map(),
        router,
        instanceId: config.cluster.instanceId,
      };

      this.rooms.set(roomId, room);

      logRoomEvent('info', 'Room created', roomId, undefined, {
        name,
        description,
        maxParticipants,
        instanceId,
      });

      return room;
    } catch (error) {
      logRoomEvent('error', 'Failed to create room', '', undefined, {
        error: error instanceof Error ? error.message : String(error),
        name,
        maxParticipants,
      });
      throw createRoomError(ERROR_CODES.INTERNAL_ERROR, 'Failed to create room', undefined, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  async deleteRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw createRoomError(ERROR_CODES.ROOM_NOT_FOUND, 'Room not found', roomId);
    }

    try {
      // Close all participants
      for (const participant of room.participants.values()) {
        await this.leaveRoom(roomId, participant.id);
      }

      // Close router
      if (room.router) {
        room.router.close();
      }

      this.rooms.delete(roomId);

      logRoomEvent('info', 'Room deleted', roomId, undefined, {
        participantCount: room.participants.size,
      });
    } catch (error) {
      logRoomEvent('error', 'Failed to delete room', roomId, undefined, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw createRoomError(ERROR_CODES.INTERNAL_ERROR, 'Failed to delete room', roomId, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async joinRoom(
    roomId: string,
    userId: string,
    user: any,
    displayName: string,
    metadata?: Record<string, any>
  ): Promise<Participant> {
    let room = this.rooms.get(roomId);
    
    // Auto-create room if it doesn't exist
    if (!room) {
      logRoomEvent('info', 'Auto-creating room for join request', roomId, undefined, {
        userId,
        displayName,
      });
      
      room = await this.createRoom(
        `Session Room ${roomId}`,
        `Auto-created room for session ${roomId}`,
        100, // default max participants
        config.cluster.instanceId
      );
      
      // Update the room ID to match the requested roomId
      this.rooms.delete(room.id);
      room.id = roomId;
      this.rooms.set(roomId, room);
    }

    // Reactivate inactive rooms when someone tries to join
    if (!room.isActive) {
      logRoomEvent('info', 'Reactivating inactive room for join request', roomId, undefined, {
        userId,
        displayName,
      });
      room.isActive = true;
    }

    if (room.participants.size >= room.maxParticipants) {
      throw createRoomError(ERROR_CODES.ROOM_FULL, 'Room is full', roomId);
    }

    // Check if participant already exists
    const existingParticipant = Array.from(room.participants.values())
      .find(p => p.userId === userId);
    
    if (existingParticipant) {
      // Instead of throwing an error, return the existing participant
      logRoomEvent('info', 'Participant already in room, returning existing', roomId, existingParticipant.id, {
        userId,
        displayName,
        participantCount: room.participants.size,
      });
      
      return existingParticipant;
    }

    try {
      const participantId = uuidv4();
      
      // Check if this is a hidden/observer participant
      const isHidden = metadata?.['isHidden'] === true;
      
      const participant: Participant = {
        id: participantId,
        userId,
        user,
        roomId,
        displayName,
        isAudioEnabled: false,
        isVideoEnabled: false,
        isScreenSharing: false,
        isHidden,  // Mark as hidden if observer
        joinedAt: new Date(),
        lastSeen: new Date(),
        producers: new Map(),
        consumers: new Map(),
        ...(metadata && { metadata }),
      };

      room.participants.set(participantId, participant);
      this.participants.set(participantId, participant);
      room.updatedAt = new Date();

      logRoomEvent('info', 'Participant joined room', roomId, participantId, {
        userId,
        displayName,
        isHidden,
        participantCount: room.participants.size,
      });

      return participant;
    } catch (error) {
      logRoomEvent('error', 'Failed to join room', roomId, undefined, {
        error: error instanceof Error ? error.message : String(error),
        userId,
        displayName,
      });
      throw createParticipantError(ERROR_CODES.INTERNAL_ERROR, 'Failed to join room', undefined, roomId, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async leaveRoom(roomId: string, participantId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw createRoomError(ERROR_CODES.ROOM_NOT_FOUND, 'Room not found', roomId);
    }

    const participant = room.participants.get(participantId);
    if (!participant) {
      throw createParticipantError(ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Participant not found', participantId, roomId);
    }

    try {
      // Close all producers
      for (const producerInfo of participant.producers.values()) {
        producerInfo.producer.close();
      }

      // Close all consumers
      for (const consumerInfo of participant.consumers.values()) {
        consumerInfo.consumer.close();
      }

      // Close both transports
      if (participant.sendTransport) {
        participant.sendTransport.close();
      }
      if (participant.recvTransport) {
        participant.recvTransport.close();
      }

      // Remove from room
      room.participants.delete(participantId);
      this.participants.delete(participantId);
      room.updatedAt = new Date();

      logRoomEvent('info', 'Participant left room', roomId, participantId, {
        userId: participant.userId,
        displayName: participant.displayName,
        participantCount: room.participants.size,
      });

      // If room is empty, mark as inactive
      if (room.participants.size === 0) {
        room.isActive = false;
        logRoomEvent('info', 'Room marked as inactive (no participants)', roomId);
      }
    } catch (error) {
      logRoomEvent('error', 'Failed to leave room', roomId, participantId, {
        error: error instanceof Error ? error.message : String(error),
        userId: participant.userId,
      });
      throw createParticipantError(ERROR_CODES.INTERNAL_ERROR, 'Failed to leave room', participantId, roomId, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  getParticipant(participantId: string): Participant | undefined {
    return this.participants.get(participantId);
  }

  getParticipantByUserId(roomId: string, userId: string): Participant | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    return Array.from(room.participants.values())
      .find(p => p.userId === userId);
  }

  getProducerInfo(producerId: string): ProducerInfo | undefined {
    // Search through all participants to find the producer
    for (const participant of this.participants.values()) {
      const producerInfo = participant.producers.get(producerId);
      if (producerInfo) {
        return producerInfo;
      }
    }
    return undefined;
  }

  getRoomParticipants(roomId: string): Participant[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    return Array.from(room.participants.values());
  }

  async createTransport(
    roomId: string,
    participantId: string,
    direction: 'send' | 'recv',
    sctpCapabilities?: mediasoupTypes.SctpCapabilities
  ): Promise<mediasoupTypes.WebRtcTransport> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw createRoomError(ERROR_CODES.ROOM_NOT_FOUND, 'Room not found', roomId);
    }

    const participant = room.participants.get(participantId);
    if (!participant) {
      throw createParticipantError(ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Participant not found', participantId, roomId);
    }

    if (!room.router) {
      throw createRoomError(ERROR_CODES.ROUTER_NOT_FOUND, 'Router not found', roomId);
    }

    try {
      const transport = await mediasoupService.createWebRtcTransport(
        room.router,
        direction,
        sctpCapabilities
      );

      // Store transport based on direction
      if (direction === 'send') {
        participant.sendTransport = transport;
      } else {
        participant.recvTransport = transport;
      }
      participant.lastSeen = new Date();

      logRoomEvent('info', 'Transport created', roomId, participantId, {
        transportId: transport.id,
        direction,
      });

      return transport;
    } catch (error) {
      logRoomEvent('error', 'Failed to create transport', roomId, participantId, {
        error: error instanceof Error ? error.message : String(error),
        direction,
      });
      throw createParticipantError(ERROR_CODES.INTERNAL_ERROR, 'Failed to create transport', participantId, roomId, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async createProducer(
    roomId: string,
    participantId: string,
    kind: 'audio' | 'video',
    rtpParameters: mediasoupTypes.RtpParameters,
    appData?: any
  ): Promise<ProducerInfo> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw createRoomError(ERROR_CODES.ROOM_NOT_FOUND, 'Room not found', roomId);
    }

    const participant = room.participants.get(participantId);
    if (!participant) {
      throw createParticipantError(ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Participant not found', participantId, roomId);
    }

    if (!participant.sendTransport) {
      throw createParticipantError(ERROR_CODES.TRANSPORT_NOT_FOUND, 'Send transport not found', participantId, roomId);
    }

    try {
      const producer = await mediasoupService.createProducer(
        participant.sendTransport,
        kind,
        rtpParameters,
        appData
      );

      const producerInfo: ProducerInfo = {
        id: producer.id,
        kind,
        rtpParameters,
        appData,
        paused: producer.paused,
        producer,
      };

      participant.producers.set(producer.id, producerInfo);
      participant.lastSeen = new Date();

      // Update participant state
      if (kind === 'audio') {
        participant.isAudioEnabled = true;
      } else if (kind === 'video') {
        participant.isVideoEnabled = true;
      }

      logRoomEvent('info', 'Producer created', roomId, participantId, {
        producerId: producer.id,
        kind,
      });

      return producerInfo;
    } catch (error) {
      logRoomEvent('error', 'Failed to create producer', roomId, participantId, {
        error: error instanceof Error ? error.message : String(error),
        kind,
      });
      throw createProducerError(ERROR_CODES.INTERNAL_ERROR, 'Failed to create producer', undefined, roomId, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async createConsumer(
    roomId: string,
    participantId: string,
    producerId: string,
    rtpCapabilities: mediasoupTypes.RtpCapabilities,
    appData?: any
  ): Promise<ConsumerInfo> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw createRoomError(ERROR_CODES.ROOM_NOT_FOUND, 'Room not found', roomId);
    }

    const participant = room.participants.get(participantId);
    if (!participant) {
      throw createParticipantError(ERROR_CODES.PARTICIPANT_NOT_FOUND, 'Participant not found', participantId, roomId);
    }

    if (!participant.recvTransport) {
      throw createParticipantError(ERROR_CODES.TRANSPORT_NOT_FOUND, 'Receive transport not found', participantId, roomId);
    }

    if (!room.router) {
      throw createRoomError(ERROR_CODES.ROUTER_NOT_FOUND, 'Router not found', roomId);
    }

    // Check if can consume
    if (!mediasoupService.canConsume(room.router, producerId, rtpCapabilities)) {
      throw createConsumerError(ERROR_CODES.CONSUMER_RTP_CAPABILITIES_INVALID, 'Cannot consume producer', undefined, roomId, {
        producerId,
      });
    }

    try {
      const consumer = await mediasoupService.createConsumer(
        room.router,
        participant.recvTransport,
        producerId,
        rtpCapabilities,
        appData
      );

      const consumerInfo: ConsumerInfo = {
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        appData,
        paused: consumer.paused,
        consumer,
      };

      participant.consumers.set(consumer.id, consumerInfo);
      participant.lastSeen = new Date();

      logRoomEvent('info', 'Consumer created', roomId, participantId, {
        consumerId: consumer.id,
        producerId,
        kind: consumer.kind,
      });

      return consumerInfo;
    } catch (error) {
      logRoomEvent('error', 'Failed to create consumer', roomId, participantId, {
        error: error instanceof Error ? error.message : String(error),
        producerId,
      });
      throw createConsumerError(ERROR_CODES.INTERNAL_ERROR, 'Failed to create consumer', undefined, roomId, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  getRouterRtpCapabilities(roomId: string): mediasoupTypes.RtpCapabilities {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw createRoomError(ERROR_CODES.ROOM_NOT_FOUND, 'Room not found', roomId);
    }

    if (!room.router) {
      throw createRoomError(ERROR_CODES.ROUTER_NOT_FOUND, 'Router not found', roomId);
    }

    return mediasoupService.getRtpCapabilities(room.router);
  }

  getParticipantInfo(participant: Participant): ParticipantInfo {
    return {
      id: participant.id,
      userId: participant.userId,
      displayName: participant.displayName,
      isAudioEnabled: participant.isAudioEnabled,
      isVideoEnabled: participant.isVideoEnabled,
      isScreenSharing: participant.isScreenSharing,
      isHidden: participant.isHidden ?? false,  // Ensure it's always boolean
      joinedAt: participant.joinedAt.toISOString(),
      ...(participant.metadata && { metadata: participant.metadata }),
    };
  }

  getRoomInfo(room: Room): any {
    return {
      id: room.id,
      name: room.name,
      description: room.description,
      maxParticipants: room.maxParticipants,
      isActive: room.isActive,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
      participantCount: room.participants.size,
      instanceId: room.instanceId,
    };
  }

  // Cleanup inactive rooms
  async cleanupInactiveRooms(): Promise<void> {
    const now = new Date();
    const inactiveRooms: string[] = [];

    for (const [roomId, room] of this.rooms.entries()) {
      const timeSinceUpdate = now.getTime() - room.updatedAt.getTime();
      
      if (room.participants.size === 0 && timeSinceUpdate > config.room.idleTimeout) {
        inactiveRooms.push(roomId);
      }
    }

    for (const roomId of inactiveRooms) {
      try {
        await this.deleteRoom(roomId);
        logRoomEvent('info', 'Cleaned up inactive room', roomId);
      } catch (error) {
        logRoomEvent('error', 'Failed to cleanup inactive room', roomId, undefined, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Get statistics
  getStats(): any {
    const rooms = Array.from(this.rooms.values());
    const participants = Array.from(this.participants.values());

    return {
      rooms: {
        total: rooms.length,
        active: rooms.filter(r => r.isActive).length,
        participants: participants.length,
      },
      participants: {
        total: participants.length,
        active: participants.length,
      },
      producers: {
        total: participants.reduce((sum, p) => sum + p.producers.size, 0),
        active: participants.reduce((sum, p) => sum + p.producers.size, 0),
        audio: participants.reduce((sum, p) => sum + Array.from(p.producers.values()).filter(pr => pr.kind === 'audio').length, 0),
        video: participants.reduce((sum, p) => sum + Array.from(p.producers.values()).filter(pr => pr.kind === 'video').length, 0),
      },
      consumers: {
        total: participants.reduce((sum, p) => sum + p.consumers.size, 0),
        active: participants.reduce((sum, p) => sum + p.consumers.size, 0),
        audio: participants.reduce((sum, p) => sum + Array.from(p.consumers.values()).filter(c => c.kind === 'audio').length, 0),
        video: participants.reduce((sum, p) => sum + Array.from(p.consumers.values()).filter(c => c.kind === 'video').length, 0),
      },
    };
  }
}

// Singleton instance
export const roomService = new RoomService();
