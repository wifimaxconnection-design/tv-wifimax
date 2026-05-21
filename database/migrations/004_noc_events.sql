-- =============================================================
-- Migración 004 — NOC Events, Fiber Cuts, Maintenance
-- ADITIVA
-- =============================================================

-- ─── NOC Events ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS noc_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type      VARCHAR(50) NOT NULL,
    severity        VARCHAR(20) DEFAULT 'warning'
                    CHECK (severity IN ('info','warning','critical','disaster')),
    source_service  VARCHAR(50) NOT NULL,
    source_id       VARCHAR(100),
    title           TEXT NOT NULL,
    description     TEXT,
    affected_entity VARCHAR(200),
    affected_count  INTEGER DEFAULT 0,
    metadata        JSONB DEFAULT '{}',
    status          VARCHAR(20) DEFAULT 'open'
                    CHECK (status IN ('open','acknowledged','resolved','suppressed')),
    ack_by          VARCHAR(100),
    ack_at          TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,
    auto_resolve    BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_noc_events_severity ON noc_events(severity);
CREATE INDEX idx_noc_events_status   ON noc_events(status);
CREATE INDEX idx_noc_events_created  ON noc_events(created_at DESC);
CREATE INDEX idx_noc_events_source   ON noc_events(source_service, source_id);

-- ─── Fiber Cuts ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fiber_cuts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    olt_name        VARCHAR(100),
    pon_interface   VARCHAR(50),
    affected_onus   INTEGER DEFAULT 0,
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    location_desc   TEXT,
    cause           VARCHAR(50) DEFAULT 'unknown'
                    CHECK (cause IN ('unknown','cut','connector','splitter','weather','rodent','construction','other')),
    status          VARCHAR(20) DEFAULT 'open'
                    CHECK (status IN ('open','investigating','repairing','resolved')),
    opened_at       TIMESTAMPTZ DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,
    tech_assigned   VARCHAR(100),
    noc_event_id    UUID REFERENCES noc_events(id) ON DELETE SET NULL,
    notes           TEXT,
    photos          TEXT[],
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fiber_cuts_status  ON fiber_cuts(status);
CREATE INDEX idx_fiber_cuts_opened  ON fiber_cuts(opened_at DESC);
CREATE INDEX idx_fiber_cuts_geo     ON fiber_cuts(latitude, longitude) WHERE latitude IS NOT NULL;

-- ─── Maintenance Windows ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_windows (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    affected_items  TEXT[],
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    suppress_alerts BOOLEAN DEFAULT TRUE,
    created_by      VARCHAR(100),
    status          VARCHAR(20) DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','active','completed','cancelled')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    CHECK (ends_at > starts_at)
);

CREATE INDEX idx_maintenance_status  ON maintenance_windows(status);
CREATE INDEX idx_maintenance_starts  ON maintenance_windows(starts_at);

-- ─── Zabbix Hosts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zabbix_hosts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zabbix_host_id  INTEGER UNIQUE,
    hostname        VARCHAR(200) NOT NULL,
    ip_address      INET,
    host_type       VARCHAR(50) DEFAULT 'other'
                    CHECK (host_type IN ('olt','mikrotik','server','onu','switch','ups','other')),
    groups          TEXT[],
    templates       TEXT[],
    status          INTEGER DEFAULT 0,
    available       INTEGER DEFAULT 0,
    last_check      TIMESTAMPTZ,
    last_error      TEXT,
    metadata        JSONB DEFAULT '{}',
    synced_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_zabbix_hosts_type   ON zabbix_hosts(host_type);
CREATE INDEX idx_zabbix_hosts_zbxid  ON zabbix_hosts(zabbix_host_id);

-- ─── Alert Rules ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_rules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(200) NOT NULL UNIQUE,
    description     TEXT,
    event_type      VARCHAR(50),
    severity_min    VARCHAR(20) DEFAULT 'critical'
                    CHECK (severity_min IN ('info','warning','critical','disaster')),
    condition_expr  TEXT,
    channels        VARCHAR(20)[] DEFAULT ARRAY['whatsapp'],
    recipients      TEXT[],
    cooldown_minutes INTEGER DEFAULT 15,
    max_per_hour    INTEGER DEFAULT 4,
    enabled         BOOLEAN DEFAULT TRUE,
    template        TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Alert Incidents ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_incidents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id         UUID REFERENCES alert_rules(id) ON DELETE CASCADE,
    noc_event_id    UUID REFERENCES noc_events(id) ON DELETE SET NULL,
    channel         VARCHAR(20) NOT NULL,
    recipient       VARCHAR(200),
    message         TEXT,
    status          VARCHAR(20) DEFAULT 'sent'
                    CHECK (status IN ('sent','delivered','failed','suppressed')),
    sent_at         TIMESTAMPTZ DEFAULT NOW(),
    error           TEXT
);

CREATE INDEX idx_alert_incidents_rule    ON alert_incidents(rule_id);
CREATE INDEX idx_alert_incidents_sent    ON alert_incidents(sent_at DESC);

-- ─── OMCI Profiles ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS omci_profiles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor          VARCHAR(50) NOT NULL,
    model           VARCHAR(100),
    version         VARCHAR(50),
    profile_type    VARCHAR(30) NOT NULL
                    CHECK (profile_type IN ('service','line','traffic','vlan','ipv6','qos')),
    profile_name    VARCHAR(200) NOT NULL,
    config          JSONB NOT NULL DEFAULT '{}',
    dual_stack      BOOLEAN DEFAULT FALSE,
    ipv6_mode       VARCHAR(20) DEFAULT 'none'
                    CHECK (ipv6_mode IN ('none','slaac','dhcpv6','dhcpv6-pd','pppoe-ipv6','static')),
    supported_devices TEXT[],
    active          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(vendor, profile_name, profile_type)
);

CREATE INDEX idx_omci_profiles_vendor  ON omci_profiles(vendor);
CREATE INDEX idx_omci_profiles_type    ON omci_profiles(profile_type);

-- Seed OMCI profiles
INSERT INTO omci_profiles (vendor, model, profile_type, profile_name, dual_stack, ipv6_mode, config) VALUES
('Huawei', 'MA5608T', 'service', 'FTTH-DUAL-STACK', TRUE, 'dhcpv6-pd',
 '{"tcont":1,"gem_port":1,"vlan_action":"translate","ipv6_proto":"43","max_gem_ports":8}'),
('VSOL', 'V1600', 'service', 'VSOL-DUAL-STACK', TRUE, 'dhcpv6-pd',
 '{"service_type":"internet","vlan_mode":"tag","ipv6_enable":true}'),
('ZTE', 'C300', 'service', 'ZTE-DUAL-STACK', TRUE, 'dhcpv6-pd',
 '{"service_profile":"FTTH","line_profile":"FTTH-LINE","ipv6_enable":true}'),
('Nokia', 'ISAM', 'service', 'NOKIA-DUAL-STACK', TRUE, 'dhcpv6-pd',
 '{"dpbo_profile":"FTTH","service_vlan":100,"ipv6_mode":"dhcpv6-pd"}')
ON CONFLICT (vendor, profile_name, profile_type) DO NOTHING;
