-- =============================================================
-- IPTV Platform – PostgreSQL Initial Schema
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- for ILIKE search

-- ─── Categories ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    icon_url    VARCHAR(500),
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Channels ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channels (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                  VARCHAR(200) NOT NULL,
    multicast_address     VARCHAR(50) NOT NULL,
    multicast_port        INTEGER NOT NULL,
    interface             VARCHAR(50) DEFAULT 'eth0',
    category_id           UUID REFERENCES categories(id) ON DELETE SET NULL,
    transcoding_profiles  JSONB DEFAULT '["1080p","720p","480p"]',
    logo_url              VARCHAR(500),
    epg_id                VARCHAR(100),
    is_active             BOOLEAN DEFAULT TRUE,
    is_encrypted          BOOLEAN DEFAULT FALSE,
    sort_order            INTEGER DEFAULT 0,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(multicast_address, multicast_port)
);

CREATE INDEX idx_channels_active ON channels(is_active);
CREATE INDEX idx_channels_category ON channels(category_id);

-- ─── Transcoding Jobs ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transcoding_jobs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id      UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    profile         VARCHAR(50) NOT NULL,
    status          VARCHAR(20) DEFAULT 'stopped',  -- running, stopped, error, restarting
    pid             INTEGER,
    ffmpeg_command  TEXT,
    error_message   TEXT,
    started_at      TIMESTAMPTZ,
    stopped_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(channel_id, profile)
);

CREATE INDEX idx_transcode_channel ON transcoding_jobs(channel_id);
CREATE INDEX idx_transcode_status ON transcoding_jobs(status);

-- ─── Clients ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name              VARCHAR(200) NOT NULL,
    email             VARCHAR(200) NOT NULL UNIQUE,
    phone             VARCHAR(50),
    address           TEXT,
    odoo_partner_id   VARCHAR(50),
    is_active         BOOLEAN DEFAULT TRUE,
    max_devices       INTEGER DEFAULT 3,
    notes             TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clients_email ON clients(email);
CREATE INDEX idx_clients_odoo ON clients(odoo_partner_id);
CREATE INDEX idx_clients_active ON clients(is_active);

-- ─── Packages ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS packages (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name              VARCHAR(200) NOT NULL UNIQUE,
    description       TEXT,
    channel_ids       JSONB DEFAULT '[]',
    price             NUMERIC(10, 2) DEFAULT 0.00,
    max_devices       INTEGER DEFAULT 3,
    is_active         BOOLEAN DEFAULT TRUE,
    odoo_product_id   VARCHAR(50),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Subscriptions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id             UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    package_id            UUID NOT NULL REFERENCES packages(id),
    starts_at             TIMESTAMPTZ NOT NULL,
    expires_at            TIMESTAMPTZ NOT NULL,
    is_active             BOOLEAN DEFAULT TRUE,
    odoo_subscription_id  VARCHAR(50),
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_client ON subscriptions(client_id);
CREATE INDEX idx_subscriptions_expires ON subscriptions(expires_at);
CREATE INDEX idx_subscriptions_active ON subscriptions(is_active);

-- ─── Devices ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name         VARCHAR(200),
    device_type  VARCHAR(50),  -- stb, mobile, web, smart_tv
    mac_address  VARCHAR(17),
    is_active    BOOLEAN DEFAULT TRUE,
    last_seen    TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_devices_client ON devices(client_id);
CREATE INDEX idx_devices_mac ON devices(mac_address);

-- ─── Stream Sessions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stream_sessions (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    channel_id        UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    ip_address        VARCHAR(50) NOT NULL,
    device_type       VARCHAR(50),
    profile           VARCHAR(50),
    started_at        TIMESTAMPTZ DEFAULT NOW(),
    last_seen         TIMESTAMPTZ DEFAULT NOW(),
    ended_at          TIMESTAMPTZ,
    bytes_transferred BIGINT DEFAULT 0
);

CREATE INDEX idx_sessions_client ON stream_sessions(client_id);
CREATE INDEX idx_sessions_channel ON stream_sessions(channel_id);
CREATE INDEX idx_sessions_active ON stream_sessions(ended_at) WHERE ended_at IS NULL;
CREATE INDEX idx_sessions_started ON stream_sessions(started_at);

-- ─── Alarm Log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alarms (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service      VARCHAR(50) NOT NULL,
    channel_id   UUID REFERENCES channels(id) ON DELETE CASCADE,
    severity     VARCHAR(20) DEFAULT 'warning',  -- info, warning, critical
    message      TEXT NOT NULL,
    resolved_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alarms_unresolved ON alarms(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_alarms_severity ON alarms(severity);

-- ─── Audit Log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     VARCHAR(200),
    action      VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id   UUID,
    details     JSONB,
    ip_address  VARCHAR(50),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_user ON audit_log(user_id);

-- ─── Seed data ───────────────────────────────────────────────
INSERT INTO categories (name, description, sort_order) VALUES
    ('Entertainment', 'General entertainment channels', 1),
    ('News', 'News and information channels', 2),
    ('Sports', 'Live sports channels', 3),
    ('Kids', 'Children programming', 4),
    ('Movies', 'Movie channels', 5)
ON CONFLICT (name) DO NOTHING;
