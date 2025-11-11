import { Pool, PoolClient } from 'pg';
import { config } from '@/config';
import { logSystemEvent } from '@/utils/logger';
import { createSystemError, ERROR_CODES } from '@/utils/errors';
import { RoomRecord, ParticipantRecord, RoomEventRecord } from '@/types';

// const logger = createLogger({ component: 'database' });

export class DatabaseService {
  private pool: Pool | null = null;
  private isConnected = false;

  constructor() {
    // Skip database setup if no connection URL or password in development
    if (process.env['NODE_ENV'] === 'development' && (!config.postgres.url || !config.postgres.password)) {
      logSystemEvent('warn', 'Skipping database setup in development mode - no credentials provided', 'database');
      return;
    }

    this.pool = new Pool({
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.pool.on('connect', (_client) => {
      logSystemEvent('info', 'Database client connected', 'database');
    });

    this.pool.on('error', (error) => {
      logSystemEvent('error', 'Database pool error', 'database', { error: error.message });
      this.isConnected = false;
    });

    this.pool.on('remove', () => {
      logSystemEvent('info', 'Database client removed from pool', 'database');
    });
  }

  async connect(): Promise<void> {
    // Skip connection if pool is not initialized
    if (!this.pool) {
      logSystemEvent('warn', 'Database pool not initialized, skipping connection', 'database');
      this.isConnected = false;
      return;
    }

    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      this.isConnected = true;
      logSystemEvent('info', 'Database service connected successfully', 'database');
    } catch (error) {
      logSystemEvent('warn', 'Database connection failed, continuing without database', 'database', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw error in development - allow the app to continue without database
      this.isConnected = false;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.pool) {
      return;
    }
    
    try {
      await this.pool.end();
      this.isConnected = false;
      logSystemEvent('info', 'Database service disconnected', 'database');
    } catch (error) {
      logSystemEvent('error', 'Error disconnecting from database', 'database', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  isHealthy(): boolean {
    return this.isConnected && this.pool && !this.pool.ended;
  }

  async query(text: string, params?: any[]): Promise<any> {
    if (!this.isConnected) {
      logSystemEvent('warn', 'Database query skipped - not connected', 'database', { query: text });
      return { rows: [], rowCount: 0 };
    }
    
    try {
      const result = await this.pool.query(text, params);
      return result;
    } catch (error) {
      logSystemEvent('error', 'Database query failed', 'database', {
        error: error instanceof Error ? error.message : String(error),
        query: text,
        params,
      });
      throw createSystemError(ERROR_CODES.DATABASE_QUERY_ERROR, 'Database query failed');
    }
  }

  async getClient(): Promise<PoolClient> {
    try {
      return await this.pool.connect();
    } catch (error) {
      logSystemEvent('error', 'Failed to get database client', 'database', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw createSystemError(ERROR_CODES.DATABASE_CONNECTION_ERROR, 'Failed to get database client');
    }
  }

  // Room operations
  async createRoom(room: RoomRecord): Promise<void> {
    const query = `
      INSERT INTO rooms (id, name, description, max_participants, is_active, instance_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    
    await this.query(query, [
      room.id,
      room.name,
      room.description,
      room.max_participants,
      room.is_active,
      room.instance_id,
      room.created_at,
      room.updated_at,
    ]);

    logSystemEvent('info', 'Room created in database', 'database', { roomId: room.id });
  }

  async getRoom(roomId: string): Promise<RoomRecord | null> {
    const query = 'SELECT * FROM rooms WHERE id = $1';
    const result = await this.query(query, [roomId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      max_participants: row.max_participants,
      is_active: row.is_active,
      instance_id: row.instance_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async updateRoom(roomId: string, updates: Partial<RoomRecord>): Promise<void> {
    const fields = Object.keys(updates).filter(key => key !== 'id');
    const values = fields.map((field, index) => `${field} = $${index + 2}`);
    const query = `UPDATE rooms SET ${values.join(', ')}, updated_at = NOW() WHERE id = $1`;
    
    const params = [roomId, ...fields.map(field => (updates as any)[field])];
    await this.query(query, params);

    logSystemEvent('info', 'Room updated in database', 'database', { roomId, updates });
  }

  async deleteRoom(roomId: string): Promise<void> {
    const query = 'DELETE FROM rooms WHERE id = $1';
    await this.query(query, [roomId]);

    logSystemEvent('info', 'Room deleted from database', 'database', { roomId });
  }

  async getRooms(instanceId?: string): Promise<RoomRecord[]> {
    let query = 'SELECT * FROM rooms';
    let params: any[] = [];

    if (instanceId) {
      query += ' WHERE instance_id = $1';
      params = [instanceId];
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.query(query, params);
    return result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      max_participants: row.max_participants,
      is_active: row.is_active,
      instance_id: row.instance_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  // Participant operations
  async createParticipant(participant: ParticipantRecord): Promise<void> {
    const query = `
      INSERT INTO participants (id, user_id, room_id, display_name, is_audio_enabled, is_video_enabled, 
                               is_screen_sharing, joined_at, last_seen, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;
    
    await this.query(query, [
      participant.id,
      participant.user_id,
      participant.room_id,
      participant.display_name,
      participant.is_audio_enabled,
      participant.is_video_enabled,
      participant.is_screen_sharing,
      participant.joined_at,
      participant.last_seen,
      participant.created_at,
      participant.updated_at,
    ]);

    logSystemEvent('info', 'Participant created in database', 'database', { 
      participantId: participant.id, 
      roomId: participant.room_id 
    });
  }

  async getParticipant(participantId: string): Promise<ParticipantRecord | null> {
    const query = 'SELECT * FROM participants WHERE id = $1';
    const result = await this.query(query, [participantId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      room_id: row.room_id,
      display_name: row.display_name,
      is_audio_enabled: row.is_audio_enabled,
      is_video_enabled: row.is_video_enabled,
      is_screen_sharing: row.is_screen_sharing,
      joined_at: row.joined_at,
      last_seen: row.last_seen,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async updateParticipant(participantId: string, updates: Partial<ParticipantRecord>): Promise<void> {
    const fields = Object.keys(updates).filter(key => key !== 'id');
    const values = fields.map((field, index) => `${field} = $${index + 2}`);
    const query = `UPDATE participants SET ${values.join(', ')}, updated_at = NOW() WHERE id = $1`;
    
    const params = [participantId, ...fields.map(field => (updates as any)[field])];
    await this.query(query, params);

    logSystemEvent('info', 'Participant updated in database', 'database', { 
      participantId, 
      updates 
    });
  }

  async deleteParticipant(participantId: string): Promise<void> {
    const query = 'DELETE FROM participants WHERE id = $1';
    await this.query(query, [participantId]);

    logSystemEvent('info', 'Participant deleted from database', 'database', { participantId });
  }

  async getRoomParticipants(roomId: string): Promise<ParticipantRecord[]> {
    const query = 'SELECT * FROM participants WHERE room_id = $1 ORDER BY joined_at ASC';
    const result = await this.query(query, [roomId]);
    
    return result.rows.map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      room_id: row.room_id,
      display_name: row.display_name,
      is_audio_enabled: row.is_audio_enabled,
      is_video_enabled: row.is_video_enabled,
      is_screen_sharing: row.is_screen_sharing,
      joined_at: row.joined_at,
      last_seen: row.last_seen,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  // Event logging
  async logRoomEvent(event: RoomEventRecord): Promise<void> {
    const query = `
      INSERT INTO room_events (id, room_id, participant_id, event_type, event_data, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    
    await this.query(query, [
      event.id,
      event.room_id,
      event.participant_id,
      event.event_type,
      JSON.stringify(event.event_data),
      event.created_at,
    ]);

    logSystemEvent('info', 'Room event logged to database', 'database', { 
      eventType: event.event_type,
      roomId: event.room_id,
      participantId: event.participant_id,
    });
  }

  async getRoomEvents(roomId: string, limit: number = 100): Promise<RoomEventRecord[]> {
    const query = `
      SELECT * FROM room_events 
      WHERE room_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;
    
    const result = await this.query(query, [roomId, limit]);
    
    return result.rows.map((row: any) => ({
      id: row.id,
      room_id: row.room_id,
      participant_id: row.participant_id,
      event_type: row.event_type,
      event_data: JSON.parse(row.event_data),
      created_at: row.created_at,
    }));
  }

  // Statistics
  async getRoomStats(roomId: string): Promise<any> {
    const query = `
      SELECT 
        COUNT(DISTINCT p.id) as participant_count,
        COUNT(DISTINCT CASE WHEN p.is_audio_enabled THEN p.id END) as audio_enabled_count,
        COUNT(DISTINCT CASE WHEN p.is_video_enabled THEN p.id END) as video_enabled_count,
        COUNT(DISTINCT CASE WHEN p.is_screen_sharing THEN p.id END) as screen_sharing_count,
        COUNT(DISTINCT re.id) as event_count
      FROM participants p
      LEFT JOIN room_events re ON p.room_id = re.room_id
      WHERE p.room_id = $1
    `;
    
    const result = await this.query(query, [roomId]);
    return result.rows[0];
  }

  async getInstanceStats(instanceId: string): Promise<any> {
    const query = `
      SELECT 
        COUNT(DISTINCT r.id) as room_count,
        COUNT(DISTINCT p.id) as participant_count,
        COUNT(DISTINCT re.id) as event_count
      FROM rooms r
      LEFT JOIN participants p ON r.id = p.room_id
      LEFT JOIN room_events re ON r.id = re.room_id
      WHERE r.instance_id = $1
    `;
    
    const result = await this.query(query, [instanceId]);
    return result.rows[0];
  }

  // Cleanup operations
  async cleanupOldEvents(daysOld: number = 30): Promise<number> {
    const query = 'DELETE FROM room_events WHERE created_at < NOW() - INTERVAL \'${daysOld} days\'';
    const result = await this.query(query);
    
    logSystemEvent('info', 'Cleaned up old room events', 'database', { 
      deletedCount: result.rowCount,
      daysOld 
    });
    
    return result.rowCount || 0;
  }

  async cleanupInactiveParticipants(hoursOld: number = 24): Promise<number> {
    const query = 'DELETE FROM participants WHERE last_seen < NOW() - INTERVAL \'${hoursOld} hours\'';
    const result = await this.query(query);
    
    logSystemEvent('info', 'Cleaned up inactive participants', 'database', { 
      deletedCount: result.rowCount,
      hoursOld 
    });
    
    return result.rowCount || 0;
  }

  // Health check
  async ping(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1');
      return result.rows.length > 0;
    } catch (error) {
      logSystemEvent('error', 'Database ping failed', 'database', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

// Singleton instance
export const databaseService = new DatabaseService();
