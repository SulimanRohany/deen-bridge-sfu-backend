import axios from 'axios';
import crypto from 'crypto';
import { config } from '@/config';
import { logSystemEvent } from '@/utils/logger';
import { createSystemError, ERROR_CODES } from '@/utils/errors';
import { WebhookPayload, WebhookEvent } from '@/types';

// const logger = createLogger({ component: 'webhook' });

export class WebhookService {
  private retryAttempts = 3;
  private retryDelay = 1000; // 1 second

  async sendWebhook(event: WebhookEvent): Promise<void> {
    // Skip webhook sending in development mode
    if (process.env['NODE_ENV'] === 'development') {
      logSystemEvent('info', 'Webhook skipped in development mode', 'webhook', {
        event: event.event,
        data: event.data,
      });
      return;
    }

    try {
      const payload: WebhookPayload = {
        event: event.event,
        timestamp: new Date().toISOString(),
        data: event.data,
        signature: this.generateSignature(event),
      };

      await this.sendWithRetry(payload);

      logSystemEvent('info', 'Webhook sent successfully', 'webhook', {
        event: event.event,
        data: event.data,
      });
    } catch (error) {
      logSystemEvent('error', 'Failed to send webhook', 'webhook', {
        error: error instanceof Error ? error.message : String(error),
        event: event.event,
      });
      throw createSystemError(ERROR_CODES.DJANGO_WEBHOOK_ERROR, 'Failed to send webhook');
    }
  }

  private generateSignature(event: WebhookEvent): string {
    const payload = JSON.stringify(event);
    const signature = crypto
      .createHmac('sha256', config.django.webhookSecret)
      .update(payload)
      .digest('hex');
    
    return `sha256=${signature}`;
  }

  private async sendWithRetry(payload: WebhookPayload): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        await this.sendWebhookRequest(payload);
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.retryAttempts) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          logSystemEvent('warn', 'Webhook attempt failed, retrying', 'webhook', {
            attempt,
            maxAttempts: this.retryAttempts,
            delay,
            error: lastError.message,
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  // private async sendWebhookRequest(payload: WebhookPayload): Promise<void> {
  //   const webhookUrl = `${config.django.baseUrl}/api/sfu/webhook/`;
    
  //   await axios.post(webhookUrl, payload, {
  //     timeout: 10000,
  //     headers: {
  //       'Content-Type': 'application/json',
  //       'X-SFU-Signature': payload.signature,
  //       'X-SFU-Event': payload.event,
  //       'X-SFU-Timestamp': payload.timestamp,
  //     },
  //   });
  // }


  private async sendWebhookRequest(payload: any): Promise<void> {
    const webhookUrl = `${config.django.baseUrl}/sfu/webhook/`;
  
    try {
      await axios.post(webhookUrl, payload, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          // This is the ONLY header 99% of Django SFU webhook views expect:
          'X-Webhook-Secret': config.django.webhookSecret,
          // If your Django view also checks event/timestamp, add them too:
          // 'X-Webhook-Event': payload.event,
          // 'X-Webhook-Timestamp': payload.timestamp,
        },
      });
    } catch (error: any) {
      // This will now show you the real status code
      console.error('Webhook failed:', error.response?.status, error.response?.data);
      throw error;
    }
  }



  
  // Specific webhook methods for different events
  async sendRoomCreated(roomId: string, name: string, description: string | undefined, maxParticipants: number, createdBy: string, instanceId: string): Promise<void> {
    await this.sendWebhook({
      event: 'room.created',
      data: {
        roomId,
        name,
        ...(description && { description }),
        maxParticipants,
        createdBy,
        instanceId,
      },
    });
  }

  async sendRoomEnded(roomId: string, endedAt: string, instanceId: string): Promise<void> {
    await this.sendWebhook({
      event: 'room.ended',
      data: {
        roomId,
        endedAt,
        instanceId,
      },
    });
  }

  async sendParticipantJoined(roomId: string, participantId: string, userId: string, displayName: string, joinedAt: string): Promise<void> {
    await this.sendWebhook({
      event: 'participant.joined',
      data: {
        roomId,
        participantId,
        userId,
        displayName,
        joinedAt,
      },
    });
  }

  async sendParticipantLeft(roomId: string, participantId: string, userId: string, leftAt: string): Promise<void> {
    await this.sendWebhook({
      event: 'participant.left',
      data: {
        roomId,
        participantId,
        userId,
        leftAt,
      },
    });
  }

  async sendRecordingStarted(roomId: string, recordingId: string, startedAt: string): Promise<void> {
    await this.sendWebhook({
      event: 'recording.started',
      data: {
        roomId,
        recordingId,
        startedAt,
      },
    });
  }

  async sendRecordingStopped(roomId: string, recordingId: string, stoppedAt: string, duration: number): Promise<void> {
    await this.sendWebhook({
      event: 'recording.stopped',
      data: {
        roomId,
        recordingId,
        stoppedAt,
        duration,
      },
    });
  }

  // Verify webhook signature (for incoming webhooks from Django)
  verifySignature(payload: string, signature: string): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', config.django.webhookSecret)
        .update(payload)
        .digest('hex');
      
      const providedSignature = signature.replace('sha256=', '');
      
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
      );
    } catch (error) {
      logSystemEvent('error', 'Failed to verify webhook signature', 'webhook', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // Health check for webhook service
  async healthCheck(): Promise<boolean> {
    // Skip webhook health check in development mode
    if (process.env['NODE_ENV'] === 'development') {
      logSystemEvent('info', 'Webhook health check skipped in development mode', 'webhook');
      return true; // Return healthy in development
    }

    try {
      const response = await axios.get(`${config.django.baseUrl}/api/sfu/health/`, {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      logSystemEvent('warn', 'Webhook health check failed', 'webhook', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

// Singleton instance
export const webhookService = new WebhookService();
