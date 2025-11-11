import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

describe('SFU WebSocket E2E Tests', () => {
  let ws: WebSocket;
  let roomId: string;
  let participantId: string;
  let transportId: string;

  const SFU_URL = process.env.SFU_URL || 'ws://localhost:3000/ws';
  const MOCK_JWT_TOKEN = 'mock-jwt-token';

  beforeAll(async () => {
    // Wait for SFU service to be ready
    await waitForService();
  });

  afterEach(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  describe('Connection Management', () => {
    test('should connect to WebSocket server', async () => {
      ws = new WebSocket(SFU_URL);
      
      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          expect(ws.readyState).toBe(WebSocket.OPEN);
          resolve();
        });
        
        ws.on('error', (error) => {
          reject(error);
        });
        
        setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);
      });
    });

    test('should authenticate with valid JWT token', async () => {
      ws = new WebSocket(SFU_URL);
      
      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'authenticate',
            data: { token: MOCK_JWT_TOKEN }
          }));
        });
        
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'connected') {
            expect(message.data.connectionId).toBeDefined();
            resolve();
          } else if (message.type === 'error') {
            reject(new Error(message.error));
          }
        });
        
        ws.on('error', (error) => {
          reject(error);
        });
        
        setTimeout(() => {
          reject(new Error('Authentication timeout'));
        }, 10000);
      });
    });

    test('should reject invalid JWT token', async () => {
      ws = new WebSocket(SFU_URL);
      
      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'authenticate',
            data: { token: 'invalid-token' }
          }));
        });
        
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'error') {
            expect(message.error).toContain('Authentication');
            resolve();
          }
        });
        
        ws.on('error', (error) => {
          reject(error);
        });
        
        setTimeout(() => {
          reject(new Error('Expected authentication error'));
        }, 5000);
      });
    });
  });

  describe('Room Management', () => {
    beforeEach(async () => {
      ws = await createAuthenticatedConnection();
    });

    test('should create a room', async () => {
      const roomName = `Test Room ${Date.now()}`;
      
      const response = await sendMessage({
        type: 'createRoom',
        data: {
          name: roomName,
          description: 'Test room for E2E testing',
          maxParticipants: 50
        }
      });

      expect(response.type).toBe('createRoomResponse');
      expect(response.data.roomId).toBeDefined();
      expect(response.data.name).toBe(roomName);
      expect(response.data.maxParticipants).toBe(50);
      
      roomId = response.data.roomId;
    });

    test('should join a room', async () => {
      // First create a room
      await createRoom();
      
      const displayName = `Test User ${Date.now()}`;
      
      const response = await sendMessage({
        type: 'joinRoom',
        data: {
          roomId,
          displayName
        }
      });

      expect(response.type).toBe('joinRoomResponse');
      expect(response.data.roomId).toBe(roomId);
      expect(response.data.participants).toBeDefined();
      expect(response.data.routerRtpCapabilities).toBeDefined();
      
      participantId = response.data.participants[0].id;
    });

    test('should get router RTP capabilities', async () => {
      await createRoom();
      await joinRoom();
      
      const response = await sendMessage({
        type: 'getRouterRtpCapabilities',
        data: {
          roomId
        }
      });

      expect(response.type).toBe('getRouterRtpCapabilitiesResponse');
      expect(response.data.rtpCapabilities).toBeDefined();
      expect(response.data.rtpCapabilities.codecs).toBeDefined();
      expect(Array.isArray(response.data.rtpCapabilities.codecs)).toBe(true);
    });

    test('should leave a room', async () => {
      await createRoom();
      await joinRoom();
      
      const response = await sendMessage({
        type: 'leaveRoom',
        data: {
          roomId
        }
      });

      expect(response.type).toBe('leaveRoomResponse');
      expect(response.data.success).toBe(true);
    });
  });

  describe('Transport Management', () => {
    beforeEach(async () => {
      ws = await createAuthenticatedConnection();
      await createRoom();
      await joinRoom();
    });

    test('should create WebRTC transport', async () => {
      const response = await sendMessage({
        type: 'createWebRtcTransport',
        data: {
          roomId,
          direction: 'send'
        }
      });

      expect(response.type).toBe('createWebRtcTransportResponse');
      expect(response.data.transportId).toBeDefined();
      expect(response.data.iceParameters).toBeDefined();
      expect(response.data.iceCandidates).toBeDefined();
      expect(response.data.dtlsParameters).toBeDefined();
      
      transportId = response.data.transportId;
    });

    test('should connect WebRTC transport', async () => {
      await createTransport();
      
      const mockDtlsParameters = {
        role: 'auto',
        fingerprints: [{
          algorithm: 'sha-256',
          value: 'mock-fingerprint'
        }]
      };
      
      const response = await sendMessage({
        type: 'connectWebRtcTransport',
        data: {
          roomId,
          transportId,
          dtlsParameters: mockDtlsParameters
        }
      });

      expect(response.type).toBe('connectWebRtcTransportResponse');
      expect(response.data.success).toBe(true);
    });

    test('should restart ICE', async () => {
      await createTransport();
      
      const response = await sendMessage({
        type: 'restartIce',
        data: {
          roomId,
          transportId
        }
      });

      expect(response.type).toBe('restartIceResponse');
      expect(response.data.iceParameters).toBeDefined();
    });
  });

  describe('Media Publishing', () => {
    beforeEach(async () => {
      ws = await createAuthenticatedConnection();
      await createRoom();
      await joinRoom();
      await createTransport();
    });

    test('should publish audio', async () => {
      const mockRtpParameters = {
        codecs: [{
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
          payloadType: 111
        }],
        headerExtensions: [],
        rtcp: {
          cname: 'audio-producer'
        }
      };
      
      const response = await sendMessage({
        type: 'publish',
        data: {
          roomId,
          kind: 'audio',
          rtpParameters: mockRtpParameters
        }
      });

      expect(response.type).toBe('publishResponse');
      expect(response.data.producerId).toBeDefined();
      expect(response.data.kind).toBe('audio');
      expect(response.data.rtpParameters).toBeDefined();
    });

    test('should publish video', async () => {
      const mockRtpParameters = {
        codecs: [{
          mimeType: 'video/VP8',
          clockRate: 90000,
          payloadType: 96
        }],
        headerExtensions: [],
        rtcp: {
          cname: 'video-producer'
        }
      };
      
      const response = await sendMessage({
        type: 'publish',
        data: {
          roomId,
          kind: 'video',
          rtpParameters: mockRtpParameters
        }
      });

      expect(response.type).toBe('publishResponse');
      expect(response.data.producerId).toBeDefined();
      expect(response.data.kind).toBe('video');
      expect(response.data.rtpParameters).toBeDefined();
    });

    test('should unpublish producer', async () => {
      const publishResponse = await publishAudio();
      const producerId = publishResponse.data.producerId;
      
      const response = await sendMessage({
        type: 'unpublish',
        data: {
          roomId,
          producerId
        }
      });

      expect(response.type).toBe('unpublishResponse');
      expect(response.data.success).toBe(true);
    });
  });

  describe('Media Consumption', () => {
    let producerId: string;

    beforeEach(async () => {
      ws = await createAuthenticatedConnection();
      await createRoom();
      await joinRoom();
      await createTransport();
      
      const publishResponse = await publishAudio();
      producerId = publishResponse.data.producerId;
    });

    test('should subscribe to producer', async () => {
      const mockRtpCapabilities = {
        codecs: [{
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2
        }],
        headerExtensions: []
      };
      
      const response = await sendMessage({
        type: 'subscribe',
        data: {
          roomId,
          producerId,
          rtpCapabilities: mockRtpCapabilities
        }
      });

      expect(response.type).toBe('subscribeResponse');
      expect(response.data.consumerId).toBeDefined();
      expect(response.data.producerId).toBe(producerId);
      expect(response.data.kind).toBe('audio');
      expect(response.data.rtpParameters).toBeDefined();
    });

    test('should pause consumer', async () => {
      const subscribeResponse = await subscribeToProducer(producerId);
      const consumerId = subscribeResponse.data.consumerId;
      
      const response = await sendMessage({
        type: 'pause',
        data: {
          roomId,
          consumerId
        }
      });

      expect(response.type).toBe('pauseResponse');
      expect(response.data.success).toBe(true);
    });

    test('should resume consumer', async () => {
      const subscribeResponse = await subscribeToProducer(producerId);
      const consumerId = subscribeResponse.data.consumerId;
      
      // First pause
      await sendMessage({
        type: 'pause',
        data: {
          roomId,
          consumerId
        }
      });
      
      // Then resume
      const response = await sendMessage({
        type: 'resume',
        data: {
          roomId,
          consumerId
        }
      });

      expect(response.type).toBe('resumeResponse');
      expect(response.data.success).toBe(true);
    });

    test('should set preferred layers', async () => {
      const subscribeResponse = await subscribeToProducer(producerId);
      const consumerId = subscribeResponse.data.consumerId;
      
      const response = await sendMessage({
        type: 'setPreferredLayers',
        data: {
          roomId,
          consumerId,
          spatialLayer: 2,
          temporalLayer: 1
        }
      });

      expect(response.type).toBe('setPreferredLayersResponse');
      expect(response.data.success).toBe(true);
    });

    test('should unsubscribe from consumer', async () => {
      const subscribeResponse = await subscribeToProducer(producerId);
      const consumerId = subscribeResponse.data.consumerId;
      
      const response = await sendMessage({
        type: 'unsubscribe',
        data: {
          roomId,
          consumerId
        }
      });

      expect(response.type).toBe('unsubscribeResponse');
      expect(response.data.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      ws = await createAuthenticatedConnection();
    });

    test('should handle invalid room ID', async () => {
      const response = await sendMessage({
        type: 'joinRoom',
        data: {
          roomId: 'invalid-room-id',
          displayName: 'Test User'
        }
      });

      expect(response.type).toBe('error');
      expect(response.error).toContain('Room not found');
    });

    test('should handle invalid message type', async () => {
      const response = await sendMessage({
        type: 'invalidMessageType',
        data: {}
      });

      expect(response.type).toBe('error');
      expect(response.error).toContain('Unknown message type');
    });

    test('should handle malformed JSON', async () => {
      ws.send('invalid json');
      
      // Should not crash the connection
      expect(ws.readyState).toBe(WebSocket.OPEN);
    });
  });

  // Helper functions
  async function waitForService(): Promise<void> {
    const maxAttempts = 30;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        const response = await fetch('http://localhost:3000/healthz');
        if (response.ok) {
          return;
        }
      } catch (error) {
        // Service not ready yet
      }
      
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('SFU service not ready after 30 seconds');
  }

  async function createAuthenticatedConnection(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(SFU_URL);
      
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'authenticate',
          data: { token: MOCK_JWT_TOKEN }
        }));
      });
      
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'connected') {
          resolve(ws);
        } else if (message.type === 'error') {
          reject(new Error(message.error));
        }
      });
      
      ws.on('error', (error) => {
        reject(error);
      });
      
      setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);
    });
  }

  async function sendMessage(message: any): Promise<any> {
    const requestId = uuidv4();
    message.requestId = requestId;
    
    return new Promise((resolve, reject) => {
      ws.send(JSON.stringify(message));
      
      const timeout = setTimeout(() => {
        reject(new Error('Message timeout'));
      }, 10000);
      
      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        if (response.requestId === requestId) {
          clearTimeout(timeout);
          resolve(response);
        }
      });
    });
  }

  async function createRoom(): Promise<void> {
    const response = await sendMessage({
      type: 'createRoom',
      data: {
        name: `Test Room ${Date.now()}`,
        description: 'Test room',
        maxParticipants: 50
      }
    });
    
    expect(response.type).toBe('createRoomResponse');
    roomId = response.data.roomId;
  }

  async function joinRoom(): Promise<void> {
    const response = await sendMessage({
      type: 'joinRoom',
      data: {
        roomId,
        displayName: `Test User ${Date.now()}`
      }
    });
    
    expect(response.type).toBe('joinRoomResponse');
    participantId = response.data.participants[0].id;
  }

  async function createTransport(): Promise<void> {
    const response = await sendMessage({
      type: 'createWebRtcTransport',
      data: {
        roomId,
        direction: 'send'
      }
    });
    
    expect(response.type).toBe('createWebRtcTransportResponse');
    transportId = response.data.transportId;
  }

  async function publishAudio(): Promise<any> {
    const mockRtpParameters = {
      codecs: [{
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
        payloadType: 111
      }],
      headerExtensions: [],
      rtcp: {
        cname: 'audio-producer'
      }
    };
    
    return await sendMessage({
      type: 'publish',
      data: {
        roomId,
        kind: 'audio',
        rtpParameters: mockRtpParameters
      }
    });
  }

  async function subscribeToProducer(producerId: string): Promise<any> {
    const mockRtpCapabilities = {
      codecs: [{
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
      }],
      headerExtensions: []
    };
    
    return await sendMessage({
      type: 'subscribe',
      data: {
        roomId,
        producerId,
        rtpCapabilities: mockRtpCapabilities
      }
    });
  }
});
