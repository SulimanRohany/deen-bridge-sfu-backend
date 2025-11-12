import * as mediasoup from 'mediasoup';
import { types as mediasoupTypes } from 'mediasoup';
import { config } from '@/config';
import { logSystemEvent } from '@/utils/logger';
import { createSystemError } from '@/utils/errors';
import path from 'path';
import fs from 'fs';

// const logger = createLogger({ component: 'mediasoup' });

export class MediasoupService {
  private workers: mediasoupTypes.Worker[] = [];
  private nextWorkerIndex = 0;
  private isInitialized = false;

  /**
   * Get the correct mediasoup-worker binary path for the current platform
   */
  private getWorkerBinPath(): string | undefined {
    // If a custom binary path is configured and it's not the default, use it
    if (config.mediasoup.worker.bin && config.mediasoup.worker.bin !== 'mediasoup-worker') {
      return config.mediasoup.worker.bin;
    }

    // On Windows, we need to explicitly point to the .exe
    if (process.platform === 'win32') {
      try {
        // Get the mediasoup package root directory
        // mediasoup main is at node_modules/mediasoup/node/lib/index.js
        // We need to go up to the mediasoup root: node_modules/mediasoup
        const mediasoupMainPath = require.resolve('mediasoup');
        const mediasoupRoot = path.join(path.dirname(mediasoupMainPath), '..', '..');
        const workerPath = path.join(mediasoupRoot, 'worker', 'out', 'Release', 'mediasoup-worker.exe');
        
        logSystemEvent('info', `Checking for mediasoup-worker at: ${workerPath}`, 'mediasoup');
        
        if (fs.existsSync(workerPath)) {
          logSystemEvent('info', `✓ Found mediasoup-worker binary`, 'mediasoup');
          return workerPath;
        } else {
          logSystemEvent('warn', `✗ mediasoup-worker.exe not found at: ${workerPath}`, 'mediasoup');
          logSystemEvent('warn', `You may need to rebuild mediasoup: npm rebuild mediasoup`, 'mediasoup');
        }
      } catch (error) {
        logSystemEvent('error', `Error resolving mediasoup path: ${error instanceof Error ? error.message : String(error)}`, 'mediasoup');
      }
    }

    // On Linux/Mac, let mediasoup use its default binary resolution
    return undefined;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      logSystemEvent('info', 'Initializing mediasoup service', 'mediasoup');

      // On Windows, add the mediasoup worker directory to PATH
      // This helps mediasoup find the worker binary
      if (process.platform === 'win32') {
        const workerBin = this.getWorkerBinPath();
        if (workerBin) {
          const workerDir = path.dirname(workerBin);
          const currentPath = process.env['PATH'] || '';
          if (!currentPath.includes(workerDir)) {
            process.env['PATH'] = `${workerDir};${currentPath}`;
            logSystemEvent('info', `Added mediasoup worker directory to PATH: ${workerDir}`, 'mediasoup');
          }
        }
      }

      // Get number of CPU cores
      const numWorkers = Math.max(1, Math.min(require('os').cpus().length, 8));
      
      logSystemEvent('info', `Creating ${numWorkers} mediasoup workers`, 'mediasoup');

      // Create workers
      for (let i = 0; i < numWorkers; i++) {
        const workerSettings: mediasoupTypes.WorkerSettings = {
          logLevel: config.mediasoup.worker.logLevel as mediasoupTypes.WorkerLogLevel,
          logTags: [config.mediasoup.worker.logTag as mediasoupTypes.WorkerLogTag],
          rtcMinPort: config.mediasoup.worker.rtcMinPort,
          rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
        };

        // On Windows, explicitly set the worker path
        if (process.platform === 'win32') {
          const workerBin = this.getWorkerBinPath();
          if (workerBin) {
            // Normalize path for Windows
            (workerSettings as any).workerPath = path.normalize(workerBin);
            logSystemEvent('info', `Using worker path: ${(workerSettings as any).workerPath}`, 'mediasoup', { workerIndex: i });
          }
        } else if (config.mediasoup.worker.bin && config.mediasoup.worker.bin !== 'mediasoup-worker') {
          (workerSettings as any).workerPath = config.mediasoup.worker.bin;
        }

        const worker = await mediasoup.createWorker(workerSettings);

        worker.on('died', (error) => {
          logSystemEvent('error', `Mediasoup worker died: ${error.message}`, 'mediasoup', { workerIndex: i, error: error.message });
          process.exit(1);
        });

        this.workers.push(worker);
        logSystemEvent('info', `Created mediasoup worker ${i + 1}/${numWorkers}`, 'mediasoup', { workerIndex: i });
      }

      this.isInitialized = true;
      logSystemEvent('info', 'Mediasoup service initialized successfully', 'mediasoup', { workerCount: this.workers.length });
    } catch (error) {
      logSystemEvent('error', 'Failed to initialize mediasoup service', 'mediasoup', { error: error instanceof Error ? error.message : String(error) });
      throw createSystemError('Failed to initialize mediasoup service', 'mediasoup', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  getWorker(): mediasoupTypes.Worker {
    if (!this.isInitialized || this.workers.length === 0) {
      throw createSystemError('Mediasoup service not initialized', 'mediasoup');
    }

    // Round-robin worker selection
    const worker = this.workers[this.nextWorkerIndex];
    if (!worker) {
      throw createSystemError('No worker available', 'mediasoup');
    }
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
    
    return worker;
  }

  getWorkerCount(): number {
    return this.workers.length;
  }

  async createRouter(worker: mediasoupTypes.Worker, _rtpCapabilities?: mediasoupTypes.RtpCapabilities): Promise<mediasoupTypes.Router> {
    try {
      const router = await worker.createRouter({
        mediaCodecs: this.getMediaCodecs(),
        appData: {
          createdAt: Date.now(),
        },
      });

      if (!router) {
        throw new Error('Failed to create router');
      }

      logSystemEvent('info', 'Created mediasoup router', 'mediasoup', { routerId: router.id });
      return router;
    } catch (error) {
      logSystemEvent('error', 'Failed to create mediasoup router', 'mediasoup', { error: error instanceof Error ? error.message : String(error) });
      throw createSystemError('Failed to create mediasoup router', 'mediasoup', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  async createWebRtcTransport(
    router: mediasoupTypes.Router,
    direction: 'send' | 'recv',
    sctpCapabilities?: mediasoupTypes.SctpCapabilities
  ): Promise<mediasoupTypes.WebRtcTransport> {
    try {
      const transport = await router.createWebRtcTransport({
        listenIps: [{
          ip: config.mediasoup.listen.ip,
          announcedIp: config.mediasoup.announcedIp,
        }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate: 1000000,
        enableSctp: direction === 'recv' && sctpCapabilities !== undefined,
        ...(sctpCapabilities?.numStreams && { numSctpStreams: sctpCapabilities.numStreams }),
        appData: {
          direction,
          createdAt: Date.now(),
        },
      });

      logSystemEvent('info', 'Created WebRTC transport', 'mediasoup', { 
        transportId: transport.id, 
        direction,
        sctpEnabled: sctpCapabilities !== undefined 
      });
      
      return transport;
    } catch (error) {
      logSystemEvent('error', 'Failed to create WebRTC transport', 'mediasoup', { 
        error: error instanceof Error ? error.message : String(error),
        direction 
      });
      throw createSystemError('Failed to create WebRTC transport', 'mediasoup', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  async createProducer(
    transport: mediasoupTypes.WebRtcTransport,
    kind: 'audio' | 'video',
    rtpParameters: mediasoupTypes.RtpParameters,
    appData?: any
  ): Promise<mediasoupTypes.Producer> {
    try {
      logSystemEvent('info', 'Attempting to create producer', 'mediasoup', { 
        kind,
        transportId: transport.id,
        codecsCount: rtpParameters.codecs?.length,
        encodingsCount: rtpParameters.encodings?.length,
        rtpParametersDetail: {
          codecs: rtpParameters.codecs?.map(c => ({ mimeType: c.mimeType, payloadType: c.payloadType })),
          encodings: rtpParameters.encodings?.map(e => ({ ssrc: e.ssrc, rtx: e.rtx }))
        }
      });

      const producer = await transport.produce({
        kind,
        rtpParameters,
        appData: {
          ...appData,
          createdAt: Date.now(),
        },
      });

      logSystemEvent('info', 'Created producer', 'mediasoup', { 
        producerId: producer.id, 
        kind,
        transportId: transport.id 
      });
      
      return producer;
    } catch (error) {
      logSystemEvent('error', 'Failed to create producer', 'mediasoup', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        kind,
        rtpParametersSnippet: JSON.stringify(rtpParameters).substring(0, 300)
      });
      throw createSystemError('Failed to create producer', 'mediasoup', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  async createConsumer(
    _router: mediasoupTypes.Router,
    transport: mediasoupTypes.WebRtcTransport,
    producerId: string,
    rtpCapabilities: mediasoupTypes.RtpCapabilities,
    appData?: any
  ): Promise<mediasoupTypes.Consumer> {
    try {
      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: true, // Start paused
        appData: {
          ...appData,
          createdAt: Date.now(),
        },
      });

      logSystemEvent('info', 'Created consumer', 'mediasoup', { 
        consumerId: consumer.id, 
        producerId,
        transportId: transport.id 
      });
      
      return consumer;
    } catch (error) {
      logSystemEvent('error', 'Failed to create consumer', 'mediasoup', { 
        error: error instanceof Error ? error.message : String(error),
        producerId 
      });
      throw createSystemError('Failed to create consumer', 'mediasoup', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  getRtpCapabilities(router: mediasoupTypes.Router): mediasoupTypes.RtpCapabilities {
    return router.rtpCapabilities;
  }

  canConsume(router: mediasoupTypes.Router, producerId: string, rtpCapabilities: mediasoupTypes.RtpCapabilities): boolean {
    try {
      return router.canConsume({ producerId, rtpCapabilities });
    } catch (error) {
      logSystemEvent('warn', 'Failed to check if can consume', 'mediasoup', { 
        error: error instanceof Error ? error.message : String(error),
        producerId 
      });
      return false;
    }
  }

  getMediaCodecs(): mediasoupTypes.RtpCodecCapability[] {
    const codecs: mediasoupTypes.RtpCodecCapability[] = [
      // Audio codecs
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
        preferredPayloadType: 111,
        parameters: {
          minptime: 10,
          useinbandfec: 1,
        },
      },
      // Video codecs - VP8 (most compatible)
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        preferredPayloadType: 96,
        parameters: {
          'x-google-start-bitrate': 1000,
        },
      },
      // Video codecs - H264 (widely supported)
      {
        kind: 'video',
        mimeType: 'video/H264',
        clockRate: 90000,
        preferredPayloadType: 99,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '4d0032',
          'level-asymmetry-allowed': 1,
        },
      },
      // Video codecs - VP9 (good quality, but less compatible than VP8/H264)
      {
        kind: 'video',
        mimeType: 'video/VP9',
        clockRate: 90000,
        preferredPayloadType: 97,
        parameters: {
          'profile-id': 2,
          'x-google-start-bitrate': 1000,
        },
      },
    ];

    // In development, return all codecs for maximum compatibility
    if (process.env['NODE_ENV'] === 'development') {
      return codecs;
    }

    // Filter codecs based on configuration in production
    const preferredCodecs = config.codecs.preferred.map(codec => codec.toLowerCase());
    return codecs.filter(codec => {
      if (codec.kind === 'audio') {
        return true; // Always include audio codecs
      }
      return preferredCodecs.some(preferred => 
        codec.mimeType.toLowerCase().includes(preferred)
      );
    });
  }

  getRtpParameters(codec: string, _bitrate?: number): mediasoupTypes.RtpParameters {
    return {
      codecs: [
        {
          mimeType: codec,
          clockRate: codec.includes('audio') ? 48000 : 90000,
          ...(codec.includes('audio') && { channels: 2 }),
          parameters: this.getCodecParameters(codec),
          payloadType: 0,
        },
      ],
      headerExtensions: [],
      rtcp: {
        cname: `sfu-${Date.now()}`,
        reducedSize: true,
      },
    };
  }


  private getCodecParameters(codec: string): any {
    if (codec.includes('opus')) {
      return {
        minptime: 10,
        useinbandfec: 1,
      };
    } else if (codec.includes('vp8')) {
      return {
        'x-google-start-bitrate': config.codecs.bitrates.vp8,
      };
    } else if (codec.includes('vp9')) {
      return {
        'profile-id': 2,
        'x-google-start-bitrate': config.codecs.bitrates.vp9,
      };
    } else if (codec.includes('h264')) {
      return {
        'packetization-mode': 1,
        'profile-level-id': '4d0032',
        'level-asymmetry-allowed': 1,
      };
    }
    return {};
  }

  async close(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    logSystemEvent('info', 'Closing mediasoup service', 'mediasoup');

    for (const worker of this.workers) {
      try {
        await worker.close();
      } catch (error) {
        logSystemEvent('warn', 'Error closing mediasoup worker', 'mediasoup', { 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }

    this.workers = [];
    this.isInitialized = false;
    
    logSystemEvent('info', 'Mediasoup service closed', 'mediasoup');
  }
}

// Singleton instance
export const mediasoupService = new MediasoupService();
