-- =============================================================
-- MigraciÃ³n 003 â€” BGP IPv6 + MikroTik Routers
-- ADITIVA: tablas nuevas Ãºnicamente
-- Rollback: DROP TABLE bgp_announcements, bgp_peers, mikrotik_routers;
-- =============================================================

-- â”€â”€â”€ Routers MikroTik â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS mikrotik_routers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL UNIQUE,
    ip_address      INET NOT NULL,
    api_port        INTEGER DEFAULT 8728,
    api_ssl_port    INTEGER DEFAULT 8729,
    username        VARCHAR(100) NOT NULL,
    password_enc    TEXT NOT NULL,
    ros_version     VARCHAR(20),
    role            VARCHAR(20) DEFAULT 'edge'
                    CHECK (role IN ('core','edge','distribution','access')),
    local_as        INTEGER,
    router_id       INET,
    site            VARCHAR(100),
    pop             VARCHAR(100),
    ipv6_enabled    BOOLEAN DEFAULT TRUE,
    ospf_enabled    BOOLEAN DEFAULT FALSE,
    bgp_enabled     BOOLEAN DEFAULT FALSE,
    last_seen       TIMESTAMPTZ,
    status          VARCHAR(20) DEFAULT 'unknown'
                    CHECK (status IN ('online','offline','degraded','unknown','maintenance')),
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mk_routers_status ON mikrotik_routers(status);
CREATE INDEX idx_mk_routers_site   ON mikrotik_routers(site);

-- â”€â”€â”€ BGP Peers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS bgp_peers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    router_id       UUID NOT NULL REFERENCES mikrotik_routers(id) ON DELETE CASCADE,
    peer_name       VARCHAR(100) NOT NULL,
    remote_address  INET NOT NULL,
    remote_as       INTEGER NOT NULL,
    local_as        INTEGER,
    peer_type       VARCHAR(10) DEFAULT 'ibgp'
                    CHECK (peer_type IN ('ibgp','ebgp')),
    address_family  VARCHAR(10) DEFAULT 'ipv6'
                    CHECK (address_family IN ('ipv4','ipv6','vpnv4','vpnv6')),
    multihop        BOOLEAN DEFAULT FALSE,
    multihop_ttl    INTEGER DEFAULT 1,
    password        TEXT,
    hold_time       INTEGER DEFAULT 90,
    keepalive       INTEGER DEFAULT 30,
    graceful_restart BOOLEAN DEFAULT TRUE,
    route_reflector BOOLEAN DEFAULT FALSE,
    cluster_id      INET,
    status          VARCHAR(20) DEFAULT 'idle'
                    CHECK (status IN ('established','active','idle','connect','opensent','openconfirm','error')),
    uptime_seconds  BIGINT DEFAULT 0,
    prefixes_rx     INTEGER DEFAULT 0,
    prefixes_tx     INTEGER DEFAULT 0,
    last_error      TEXT,
    last_checked    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(router_id, peer_name)
);

CREATE INDEX idx_bgp_peers_router ON bgp_peers(router_id);
CREATE INDEX idx_bgp_peers_status ON bgp_peers(status);

-- â”€â”€â”€ BGP Announcements â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS bgp_announcements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    router_id       UUID NOT NULL REFERENCES mikrotik_routers(id) ON DELETE CASCADE,
    pool_id         UUID REFERENCES ipv6_pools(id) ON DELETE SET NULL,
    prefix          CIDR NOT NULL,
    next_hop        INET,
    local_pref      INTEGER DEFAULT 100,
    med             INTEGER DEFAULT 0,
    communities     TEXT[],
    origin          VARCHAR(10) DEFAULT 'igp'
                    CHECK (origin IN ('igp','egp','incomplete')),
    active          BOOLEAN DEFAULT TRUE,
    auto_announce   BOOLEAN DEFAULT TRUE,
    filter_chain    VARCHAR(100),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(router_id, prefix)
);

-- â”€â”€â”€ MikroTik Config History (auditorÃ­a) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS mikrotik_config_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    router_id       UUID NOT NULL REFERENCES mikrotik_routers(id) ON DELETE CASCADE,
    action          VARCHAR(50) NOT NULL,
    command         TEXT NOT NULL,
    result          TEXT,
    success         BOOLEAN,
    applied_by      VARCHAR(100),
    applied_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mk_history_router  ON mikrotik_config_history(router_id);
CREATE INDEX idx_mk_history_applied ON mikrotik_config_history(applied_at DESC);

-- Trigger updated_at
CREATE TRIGGER trg_mikrotik_updated
    BEFORE UPDATE ON mikrotik_routers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

