# SFU Backend API Reference

This document provides a comprehensive reference for the SFU Backend API, including WebSocket messages, HTTP endpoints, and data types.

## Table of Contents

- [WebSocket API](#websocket-api)
- [HTTP API](#http-api)
- [Data Types](#data-types)
- [Error Handling](#error-handling)
- [Authentication](#authentication)
- [Examples](#examples)

## WebSocket API

The SFU uses WebSocket for real-time communication. All messages follow a consistent format:

```typescript
interface WebSocketMessage {
  type: string;
  data?: any;
  requestId?: string;
  error?: string;
}
```

### Connection

#### Connect
Establishes a WebSocket connection to the SFU.

**URL:** `ws://localhost:3000/ws`

**Headers:**
- `Authorization: Bearer <jwt-token>` (required)

**Response:**
```typescript
{
  type: 'connected',
  data: {
    connectionId: string;
    user: {
      id: string;
      email: string;
      fullName: string;
      role: string;
    };
  }
}
```

### Room Management

#### Create Room
Creates a new room for video conferencing.

**Request:**
```typescript
{
  type: 'createRoom',
  data: {
    name: string;
    description?: string;
    maxParticipants?: number;
  },
  requestId: string;
}
```

**Response:**
```typescript
{
  type: 'createRoomResponse',
  data: {
    roomId: string;
    name: string;
    description?: string;
    maxParticipants: number;
  },
  requestId: string;
}
```

**Events:**
- `room.created` - Broadcast to all instances

#### Join Room
Joins an existing room.

**Request:**
```typescript
{
  type: 'joinRoom',
  data: {
    roomId: string;
    displayName: string;
  },
  requestId: string;
}
```

**Response:**
```typescript
{
  type: 'joinRoomResponse',
  data: {
    roomId: string;
    participants: ParticipantInfo[];
    routerRtpCapabilities: RtpCapabilities;
  },
  requestId: string;
}
```

**Events:**
- `participantJoined` - Broadcast to room participants

#### Leave Room
Leaves the current room.

**Request:**
```typescript
{
  type: 'leaveRoom',
  data: {
    roomId: string;
  },
  requestId: string;
}
```

**Response:**
```typescript
{
  type: 'leaveRoomResponse',
  data: {
    success: boolean;
  },
  requestId: string;
}
```

**Events:**
- `participantLeft` - Broadcast to room participants

#### Get Router RTP Capabilities
Gets the router's RTP capabilities for media negotiation.

**Request:**
```typescript
{
  type: 'getRouterRtpCapabilities',
  data: {
    roomId: string;
  },
  requestId: string;
}
```

**Response:**
```typescript
{
  type: 'getRouterRtpCapabilitiesResponse',
  data: {
    rtpCapabilities: RtpCapabilities;
  },
  requestId: string;
}
```

### Transport Management

#### Create WebRTC Transport
Creates a WebRTC transport for media transmission.

**Request:**
```typescript
{
  type: 'createWebRtcTransport',
  data: {
    roomId: string;
    direction: 'send' | 'recv';
    sctpCapabilities?: SctpCapabilities;
  },
  requestId: string;
}
```

**Response:**
```typescript
{
  type: 'createWebRtcTransportResponse',
  data: {
    transportId: string;
    iceParameters: IceParameters;
    iceCandidates: IceCandidate[];
    dtlsParameters: DtlsParameters;
    sctpParameters?: SctpParameters;
  },
  requestId: string;
}
```

#### Connect WebRTC Transport
Connects the transport with DTLS parameters.

**Request:**
```typescript
{
  type: 'connectWebRtcTransport',
  data: {
    roomId: string;
    transportId: string;
    dtlsParameters: DtlsParameters;
  },
  requestId: string;
}
```

**Response:**
```typescript
{
  type: 'connectWebRtcTransportResponse',
  data: {
    success: boolean;
  },
  requestId: string;
}
```

#### Restart ICE
Restarts ICE gathering for the transport.

**Request:**
```typescript
{
  type: 'restartIce',
  data: {
    roomId: string;
    transportId: string;
  },
  requestId: string;
}
```

**Response:**
```typescript
{
  type: 'restartIceResponse',
  data: {
    iceParameters: IceParameters;
  },
  requestId: string;
}
```

### Media Publishing

#### Publish
Publishes a media stream (audio or video).

**Request:**
```typescript
{
  type: 'publish',
  data: {
    roomId: string;
    kind: 'audio' | 'video';
    rtpParameters: RtpParameters;
    appData?: any;
  },
  requestId: string;
}
```

**Response:**
```typescript
{
  type: 'publishResponse',
  data: {
    producerId: string;
    kind: 'audio' | 'video';
    rtpParameters: RtpParameters;
  },
  requestId: string;
}
```

**Events:**
- `producerCreated` - Broadcast to room participants

#### Unpublish
Stops publishing a media stream.

**Request:**
```typescript
{
  type: 'unpublish',
  data: {
    roomId: string;
    producerId: string;
  },
  requestId: string;
}
```

**Response:**
```typescript
{
  type: 'unpublishResponse',
  data: {
    success: boolean;
  },
  requestId: string;
}
```

**Events:**
- `producerClosed` - Broadcast to room participants

### Media Consumption

#### Subscribe
Subscribes to a producer's media stream.

**Request:**
```typescript
{
  type: 'subscribe',
  data: {
    roomId: string;
    producerId: string;
    rtpCapabilities: RtpCapabilities;
    appData?: any;
  },
  requestId: string;
}
```

**Response:**
```typescript
{
  type: 'subscribeResponse',
  data: {
    consumerId: string;
    producerId: string;
    kind: 'audio' | 'video';
    rtpParameters: RtpParameters;
    paused: boolean;
  },
  requestId: string;
}
```

**Events:**
- `consumerCreated` - Broadcast to room participants

#### Unsubscribe
Stops consuming a media stream.

**Request:**
```typescript
{
  type: 'unsubscribe',
  data: {
    roomId: string;
    consumerId: string;
  },
  requestId: string;
}
```

**Response:**
```typescript
{
  type: 'unsubscribeResponse',
  data: {
    success: boolean;
  },
  requestId: string;
}
```

**Events:**
- `consumerClosed` - Broadcast to room participants

#### Pause Consumer
Pauses a consumer.

**Request:**
```typescript
{
  type: 'pause',
  data: {
    roomId: string;
    consumerId: string;
  },
  requestId: string;
}
```

**Response:**
```typescript
{
  type: 'pauseResponse',
  data: {
    success: boolean;
  },
  requestId: string;
}
```

**Events:**
- `consumerPaused` - Broadcast to room participants

#### Resume Consumer
Resumes a paused consumer.

**Request:**
```typescript
{
  type: 'resume',
  data: {
    roomId: string;
    consumerId: string;
  },
  requestId: string;
}
```

**Response:**
```typescript
{
  type: 'resumeResponse',
  data: {
    success: boolean;
  },
  requestId: string;
}
```

**Events:**
- `consumerResumed` - Broadcast to room participants

#### Set Preferred Layers
Sets preferred spatial and temporal layers for a consumer.

**Request:**
```typescript
{
  type: 'setPreferredLayers',
  data: {
    roomId: string;
    consumerId: string;
    spatialLayer: number;
    temporalLayer: number;
  },
  requestId: string;
}
```

**Response:**
```typescript
{
  type: 'setPreferredLayersResponse',
  data: {
    success: boolean;
  },
  requestId: string;
}
```

**Events:**
- `consumerLayersChanged` - Broadcast to room participants

## HTTP API

### Health Endpoints

#### Liveness Probe
Checks if the service is alive.

**GET** `/healthz`

**Response:**
```typescript
{
  status: 'alive' | 'dead';
  timestamp: string;
  uptime: number;
}
```

#### Readiness Probe
Checks if the service is ready to accept requests.

**GET** `/readyz`

**Response:**
```typescript
{
  status: 'ready' | 'not_ready';
  timestamp: string;
  uptime: number;
}
```

#### Health Status
Gets detailed health status.

**GET** `/health`

**Response:**
```typescript
{
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
```

#### Service Status
Gets service status and statistics.

**GET** `/status`

**Response:**
```typescript
{
  service: string;
  version: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  instance: {
    id: string;
    pid: number;
    platform: string;
    arch: string;
    nodeVersion: string;
  };
  system: {
    memory: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
    };
    cpu: {
      user: number;
      system: number;
    };
  };
  checks: object;
  metrics: object;
}
```

### Metrics

#### Prometheus Metrics
Gets metrics in Prometheus format.

**GET** `/metrics`

**Response:** Plain text Prometheus metrics

#### JSON Metrics
Gets metrics in JSON format.

**GET** `/metrics/json`

**Response:**
```typescript
{
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
  system: {
    memoryUsage: number;
    cpuUsage: number;
    uptime: number;
  };
}
```

### Version

#### Service Version
Gets service version information.

**GET** `/api/version`

**Response:**
```typescript
{
  service: string;
  version: string;
  timestamp: string;
}
```

## Data Types

### ParticipantInfo
```typescript
interface ParticipantInfo {
  id: string;
  userId: string;
  displayName: string;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  joinedAt: string;
}
```

### RtpCapabilities
```typescript
interface RtpCapabilities {
  codecs: RtpCodecCapability[];
  headerExtensions: RtpHeaderExtension[];
  rtcp: {
    cname?: string;
    reducedSize?: boolean;
  };
}
```

### RtpParameters
```typescript
interface RtpParameters {
  codecs: RtpCodecParameters[];
  headerExtensions: RtpHeaderExtensionParameters[];
  rtcp: {
    cname?: string;
    reducedSize?: boolean;
  };
}
```

### IceParameters
```typescript
interface IceParameters {
  usernameFragment: string;
  password: string;
  iceLite?: boolean;
}
```

### IceCandidate
```typescript
interface IceCandidate {
  foundation: string;
  priority: number;
  ip: string;
  protocol: 'udp' | 'tcp';
  port: number;
  type: 'host' | 'srflx' | 'prflx' | 'relay';
  tcpType?: 'active' | 'passive' | 'so';
}
```

### DtlsParameters
```typescript
interface DtlsParameters {
  role: 'auto' | 'client' | 'server';
  fingerprints: DtlsFingerprint[];
}
```

### DtlsFingerprint
```typescript
interface DtlsFingerprint {
  algorithm: string;
  value: string;
}
```

## Error Handling

### Error Response Format
```typescript
{
  type: 'error';
  error: string;
  requestId?: string;
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `AUTH_TOKEN_MISSING` | Authentication token is required |
| `AUTH_TOKEN_INVALID` | Invalid authentication token |
| `AUTH_TOKEN_EXPIRED` | Authentication token has expired |
| `ROOM_NOT_FOUND` | Room not found |
| `ROOM_FULL` | Room is full |
| `PARTICIPANT_NOT_FOUND` | Participant not found |
| `PRODUCER_NOT_FOUND` | Producer not found |
| `CONSUMER_NOT_FOUND` | Consumer not found |
| `TRANSPORT_NOT_FOUND` | Transport not found |
| `VALIDATION_ERROR` | Validation error |
| `INTERNAL_ERROR` | Internal server error |

## Authentication

The SFU uses JWT tokens for authentication. Tokens are validated against the Django backend.

### Token Format
```typescript
{
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  exp: number;
  iat: number;
  jti: string;
  token_type: 'access' | 'refresh';
}
```

### Token Validation
1. Verify signature using Django's secret key
2. Check expiration time
3. Validate required claims
4. Fetch user data from Django

## Examples

### Complete Video Conference Flow

```typescript
// 1. Connect to SFU
const ws = new WebSocket('ws://localhost:3000/ws');
ws.onopen = () => {
  // 2. Authenticate
  ws.send(JSON.stringify({
    type: 'authenticate',
    data: { token: 'jwt-token' }
  }));
};

ws.onmessage = async (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'connected') {
    // 3. Create room
    ws.send(JSON.stringify({
      type: 'createRoom',
      data: {
        name: 'My Room',
        description: 'Test room',
        maxParticipants: 10
      },
      requestId: 'create-1'
    }));
  }
  
  if (message.type === 'createRoomResponse') {
    // 4. Join room
    ws.send(JSON.stringify({
      type: 'joinRoom',
      data: {
        roomId: message.data.roomId,
        displayName: 'John Doe'
      },
      requestId: 'join-1'
    }));
  }
  
  if (message.type === 'joinRoomResponse') {
    // 5. Get user media
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true
    });
    
    // 6. Create transport
    ws.send(JSON.stringify({
      type: 'createWebRtcTransport',
      data: {
        roomId: message.data.roomId,
        direction: 'send'
      },
      requestId: 'transport-1'
    }));
  }
  
  if (message.type === 'createWebRtcTransportResponse') {
    // 7. Create mediasoup device and transport
    const device = new Device();
    await device.load({ routerRtpCapabilities: routerRtpCapabilities });
    
    const transport = device.createTransport({
      id: message.data.transportId,
      iceParameters: message.data.iceParameters,
      iceCandidates: message.data.iceCandidates,
      dtlsParameters: message.data.dtlsParameters
    });
    
    // 8. Connect transport
    await transport.connect({ dtlsParameters: transport.dtlsParameters });
    
    // 9. Publish audio
    const audioProducer = await transport.produce({
      track: stream.getAudioTracks()[0]
    });
    
    ws.send(JSON.stringify({
      type: 'publish',
      data: {
        roomId: roomId,
        kind: 'audio',
        rtpParameters: audioProducer.rtpParameters
      },
      requestId: 'publish-audio-1'
    }));
    
    // 10. Publish video
    const videoProducer = await transport.produce({
      track: stream.getVideoTracks()[0]
    });
    
    ws.send(JSON.stringify({
      type: 'publish',
      data: {
        roomId: roomId,
        kind: 'video',
        rtpParameters: videoProducer.rtpParameters
      },
      requestId: 'publish-video-1'
    }));
  }
};
```

### Error Handling Example

```typescript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'error') {
    switch (message.error) {
      case 'AUTH_TOKEN_EXPIRED':
        // Refresh token and reconnect
        refreshToken().then(() => {
          ws.close();
          // Reconnect with new token
        });
        break;
        
      case 'ROOM_FULL':
        // Show error to user
        showError('Room is full. Please try another room.');
        break;
        
      case 'VALIDATION_ERROR':
        // Show validation error
        showError('Invalid request: ' + message.details);
        break;
        
      default:
        // Show generic error
        showError('An error occurred: ' + message.error);
    }
  }
};
```
