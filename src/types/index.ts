import { types as mediasoupTypes } from 'mediasoup';

// Base types
export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'student' | 'teacher' | 'parent' | 'staff' | 'super_admin';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JWTClaims {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  exp: number;
  iat: number;
  jti: string;
  token_type: 'access' | 'refresh';
}

// Room types
export interface Room {
  id: string;
  name: string;
  description?: string;
  maxParticipants: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  participants: Map<string, Participant>;
  router?: mediasoupTypes.Router;
  instanceId: string;
}

export interface Participant {
  id: string;
  userId: string;
  user: User;
  roomId: string;
  displayName: string;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isHidden?: boolean; // Hidden participants (observers) are not visible to others
  joinedAt: Date;
  lastSeen: Date;
  sendTransport?: mediasoupTypes.WebRtcTransport;
  recvTransport?: mediasoupTypes.WebRtcTransport;
  producers: Map<string, ProducerInfo>;
  consumers: Map<string, ConsumerInfo>;
  rtpCapabilities?: mediasoupTypes.RtpCapabilities;
  metadata?: Record<string, any>;
}

export interface ProducerInfo {
  id: string;
  kind: 'audio' | 'video';
  rtpParameters: mediasoupTypes.RtpParameters;
  appData: any;
  paused: boolean;
  score?: number[];
  producer: mediasoupTypes.Producer;
}

export interface ConsumerInfo {
  id: string;
  producerId: string;
  kind: 'audio' | 'video';
  rtpParameters: mediasoupTypes.RtpParameters;
  appData: any;
  paused: boolean;
  score?: number[];
  consumer: mediasoupTypes.Consumer;
}

// WebSocket message types
export interface WebSocketMessage {
  type: string;
  data?: any;
  requestId?: string;
  error?: string;
}

export interface CreateRoomRequest {
  name: string;
  description?: string;
  maxParticipants?: number;
}

export interface JoinRoomRequest {
  roomId: string;
  displayName: string;
}

export interface LeaveRoomRequest {
  roomId: string;
}

export interface PublishRequest {
  roomId: string;
  kind: 'audio' | 'video';
  rtpParameters: mediasoupTypes.RtpParameters;
  appData?: any;
}

export interface UnpublishRequest {
  roomId: string;
  producerId: string;
}

export interface SubscribeRequest {
  roomId: string;
  producerId: string;
  rtpCapabilities: mediasoupTypes.RtpCapabilities;
}

export interface UnsubscribeRequest {
  roomId: string;
  consumerId: string;
}

export interface ResumeRequest {
  roomId: string;
  consumerId: string;
}

export interface PauseRequest {
  roomId: string;
  consumerId: string;
}

export interface SetPreferredLayersRequest {
  roomId: string;
  consumerId: string;
  spatialLayer: number;
  temporalLayer: number;
}

export interface GetRouterRtpCapabilitiesRequest {
  roomId: string;
}

export interface CreateWebRtcTransportRequest {
  roomId: string;
  direction: 'send' | 'recv';
  sctpCapabilities?: mediasoupTypes.SctpCapabilities;
}

export interface ConnectWebRtcTransportRequest {
  roomId: string;
  transportId: string;
  dtlsParameters: mediasoupTypes.DtlsParameters;
}

export interface RestartIceRequest {
  roomId: string;
  transportId: string;
}

// Response types
export interface CreateRoomResponse {
  roomId: string;
  name: string;
  description?: string;
  maxParticipants: number;
}

export interface JoinRoomResponse {
  roomId: string;
  participants: ParticipantInfo[];
  routerRtpCapabilities: mediasoupTypes.RtpCapabilities;
}

export interface ParticipantInfo {
  id: string;
  userId: string;
  displayName: string;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isHidden?: boolean; // Hidden participants (observers) are not visible to others
  joinedAt: string;
  metadata?: Record<string, any>;
}

export interface PublishResponse {
  producerId: string;
  kind: 'audio' | 'video';
  rtpParameters: mediasoupTypes.RtpParameters;
}

export interface SubscribeResponse {
  consumerId: string;
  producerId: string;
  kind: 'audio' | 'video';
  rtpParameters: mediasoupTypes.RtpParameters;
  paused: boolean;
}

export interface CreateWebRtcTransportResponse {
  transportId: string;
  iceParameters: mediasoupTypes.IceParameters;
  iceCandidates: mediasoupTypes.IceCandidate[];
  dtlsParameters: mediasoupTypes.DtlsParameters;
  sctpParameters?: mediasoupTypes.SctpParameters;
}

// Event types
export interface ParticipantJoinedEvent {
  type: 'participantJoined';
  roomId: string;
  participant: ParticipantInfo;
}

export interface ParticipantLeftEvent {
  type: 'participantLeft';
  roomId: string;
  participantId: string;
}

export interface ParticipantUpdatedEvent {
  type: 'participantUpdated';
  roomId: string;
  participantId: string;
  updates: Partial<ParticipantInfo>;
}

export interface ProducerCreatedEvent {
  type: 'producerCreated';
  roomId: string;
  participantId: string;
  producer: {
    id: string;
    kind: 'audio' | 'video';
    paused: boolean;
  };
}

export interface ProducerPausedEvent {
  type: 'producerPaused';
  roomId: string;
  participantId: string;
  producerId: string;
}

export interface ProducerResumedEvent {
  type: 'producerResumed';
  roomId: string;
  participantId: string;
  producerId: string;
}

export interface ProducerClosedEvent {
  type: 'producerClosed';
  roomId: string;
  participantId: string;
  producerId: string;
}

export interface ConsumerCreatedEvent {
  type: 'consumerCreated';
  roomId: string;
  participantId: string;
  consumer: {
    id: string;
    producerId: string;
    kind: 'audio' | 'video';
    paused: boolean;
  };
}

export interface ConsumerPausedEvent {
  type: 'consumerPaused';
  roomId: string;
  participantId: string;
  consumerId: string;
}

export interface ConsumerResumedEvent {
  type: 'consumerResumed';
  roomId: string;
  participantId: string;
  consumerId: string;
}

export interface ConsumerClosedEvent {
  type: 'consumerClosed';
  roomId: string;
  participantId: string;
  consumerId: string;
}

export interface ConsumerLayersChangedEvent {
  type: 'consumerLayersChanged';
  roomId: string;
  participantId: string;
  consumerId: string;
  spatialLayer: number;
  temporalLayer: number;
}

export interface ConsumerScoreEvent {
  type: 'consumerScore';
  roomId: string;
  participantId: string;
  consumerId: string;
  score: number;
}

export interface ProducerScoreEvent {
  type: 'producerScore';
  roomId: string;
  participantId: string;
  producerId: string;
  score: number[];
}

export interface RoomClosedEvent {
  type: 'roomClosed';
  roomId: string;
}

export type RoomEvent = 
  | ParticipantJoinedEvent
  | ParticipantLeftEvent
  | ParticipantUpdatedEvent
  | ProducerCreatedEvent
  | ProducerPausedEvent
  | ProducerResumedEvent
  | ProducerClosedEvent
  | ConsumerCreatedEvent
  | ConsumerPausedEvent
  | ConsumerResumedEvent
  | ConsumerClosedEvent
  | ConsumerLayersChangedEvent
  | ConsumerScoreEvent
  | ProducerScoreEvent
  | RoomClosedEvent;

// Error types
export class SFUError extends Error {
  public readonly code: string;
  public readonly details?: any;

  constructor(code: string, message: string, details?: any) {
    super(message);
    this.name = 'SFUError';
    this.code = code;
    this.details = details;
  }
}

// Health check types
export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  instanceId: string;
  checks: {
    database: 'healthy' | 'unhealthy';
    redis: 'healthy' | 'unhealthy';
    mediasoup: 'healthy' | 'unhealthy';
    django: 'healthy' | 'unhealthy';
  };
  metrics: {
    activeRooms: number;
    activeParticipants: number;
    activeProducers: number;
    activeConsumers: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

// Metrics types
export interface Metrics {
  rooms: {
    total: number;
    active: number;
    participants: number;
  };
  participants: {
    total: number;
    active: number;
  };
  producers: {
    total: number;
    active: number;
    audio: number;
    video: number;
  };
  consumers: {
    total: number;
    active: number;
    audio: number;
    video: number;
  };
  transports: {
    total: number;
    active: number;
  };
  system: {
    memoryUsage: number;
    cpuUsage: number;
    uptime: number;
  };
}

// Database types
export interface RoomRecord {
  id: string;
  name: string;
  description?: string;
  max_participants: number;
  is_active: boolean;
  instance_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface ParticipantRecord {
  id: string;
  user_id: string;
  room_id: string;
  display_name: string;
  is_audio_enabled: boolean;
  is_video_enabled: boolean;
  is_screen_sharing: boolean;
  joined_at: Date;
  last_seen: Date;
  created_at: Date;
  updated_at: Date;
}

export interface RoomEventRecord {
  id: string;
  room_id: string;
  participant_id?: string;
  event_type: string;
  event_data: any;
  created_at: Date;
}

// Webhook types
export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: any;
  signature: string;
}

export interface RoomCreatedWebhook {
  event: 'room.created';
  data: {
    roomId: string;
    name: string;
    description?: string;
    maxParticipants: number;
    createdBy: string;
    instanceId: string;
  };
}

export interface RoomEndedWebhook {
  event: 'room.ended';
  data: {
    roomId: string;
    endedAt: string;
    instanceId: string;
  };
}

export interface ParticipantJoinedWebhook {
  event: 'participant.joined';
  data: {
    roomId: string;
    participantId: string;
    userId: string;
    displayName: string;
    joinedAt: string;
  };
}

export interface ParticipantLeftWebhook {
  event: 'participant.left';
  data: {
    roomId: string;
    participantId: string;
    userId: string;
    leftAt: string;
  };
}

export interface RecordingStartedWebhook {
  event: 'recording.started';
  data: {
    roomId: string;
    recordingId: string;
    startedAt: string;
  };
}

export interface RecordingStoppedWebhook {
  event: 'recording.stopped';
  data: {
    roomId: string;
    recordingId: string;
    stoppedAt: string;
    duration: number;
  };
}

export type WebhookEvent = 
  | RoomCreatedWebhook
  | RoomEndedWebhook
  | ParticipantJoinedWebhook
  | ParticipantLeftWebhook
  | RecordingStartedWebhook
  | RecordingStoppedWebhook;
