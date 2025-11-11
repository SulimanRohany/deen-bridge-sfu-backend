-- Initial SFU database schema
-- This migration creates the basic tables for the SFU backend

-- Create rooms table
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    max_participants INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT true,
    instance_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create participants table
CREATE TABLE IF NOT EXISTS participants (
    id UUID PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    display_name VARCHAR(50) NOT NULL,
    is_audio_enabled BOOLEAN NOT NULL DEFAULT false,
    is_video_enabled BOOLEAN NOT NULL DEFAULT false,
    is_screen_sharing BOOLEAN NOT NULL DEFAULT false,
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create room_events table for audit logging
CREATE TABLE IF NOT EXISTS room_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_rooms_instance_id ON rooms(instance_id);
CREATE INDEX IF NOT EXISTS idx_rooms_is_active ON rooms(is_active);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON rooms(created_at);

CREATE INDEX IF NOT EXISTS idx_participants_room_id ON participants(room_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON participants(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_joined_at ON participants(joined_at);
CREATE INDEX IF NOT EXISTS idx_participants_last_seen ON participants(last_seen);

CREATE INDEX IF NOT EXISTS idx_room_events_room_id ON room_events(room_id);
CREATE INDEX IF NOT EXISTS idx_room_events_participant_id ON room_events(participant_id);
CREATE INDEX IF NOT EXISTS idx_room_events_event_type ON room_events(event_type);
CREATE INDEX IF NOT EXISTS idx_room_events_created_at ON room_events(created_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_rooms_updated_at 
    BEFORE UPDATE ON rooms 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_participants_updated_at 
    BEFORE UPDATE ON participants 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to clean up old events
CREATE OR REPLACE FUNCTION cleanup_old_events()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM room_events 
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to clean up inactive participants
CREATE OR REPLACE FUNCTION cleanup_inactive_participants()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM participants 
    WHERE last_seen < NOW() - INTERVAL '24 hours';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to get room statistics
CREATE OR REPLACE FUNCTION get_room_stats(room_uuid UUID)
RETURNS TABLE (
    participant_count BIGINT,
    audio_enabled_count BIGINT,
    video_enabled_count BIGINT,
    screen_sharing_count BIGINT,
    event_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT p.id) as participant_count,
        COUNT(DISTINCT CASE WHEN p.is_audio_enabled THEN p.id END) as audio_enabled_count,
        COUNT(DISTINCT CASE WHEN p.is_video_enabled THEN p.id END) as video_enabled_count,
        COUNT(DISTINCT CASE WHEN p.is_screen_sharing THEN p.id END) as screen_sharing_count,
        COUNT(DISTINCT re.id) as event_count
    FROM participants p
    LEFT JOIN room_events re ON p.room_id = re.room_id
    WHERE p.room_id = room_uuid;
END;
$$ LANGUAGE plpgsql;

-- Create function to get instance statistics
CREATE OR REPLACE FUNCTION get_instance_stats(instance_id_param VARCHAR(50))
RETURNS TABLE (
    room_count BIGINT,
    participant_count BIGINT,
    event_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT r.id) as room_count,
        COUNT(DISTINCT p.id) as participant_count,
        COUNT(DISTINCT re.id) as event_count
    FROM rooms r
    LEFT JOIN participants p ON r.id = p.room_id
    LEFT JOIN room_events re ON r.id = re.room_id
    WHERE r.instance_id = instance_id_param;
END;
$$ LANGUAGE plpgsql;

-- Insert initial data if needed
-- This is optional and can be customized based on requirements
