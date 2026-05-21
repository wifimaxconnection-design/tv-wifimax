-- =============================================================
-- Migración 002 — IPv6 Dual Stack
-- ADITIVA: no modifica ninguna tabla existente
-- Rollback: DROP TABLE IF EXISTS ipv6_pools, subscriber_ipv6;
-- =============================================================

-- Extensión para CIDR nativo
CREATE EXTENSION IF NOT EXISTS "citext";

-- ─── IPv6 Pools ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ipv6_pools (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Referencia opcional a canal/OLT (FK nullable = seguro)
    olt_id            UUID,
    mikrotik_id       UUID,
    pool_name         VARCHAR(100) NOT NULL UNIQUE,
    ipv6_prefix       CIDR NOT NULL,
    delegated_size    INTEGER NOT NULL DEFAULT 56 CHECK (delegated_size BETWEEN 48 AND 64),
    gateway           INET,
    vlan              INTEGER CHECK (vlan BETWEEN 1 AND 4094),
    wan_mode          VARCHAR(20) DEFAULT 'dhcpv6-pd'
                      CHECK (wan_mode IN ('dhcpv6-pd','slaac','static','pppoe-ipv6')),
    dns_primary       INET DEFAULT '2001:4860:4860::8888',
    dns_secondary     INET DEFAULT '2001:4860:4860::8844',
    ra_interval       INTEGER DEFAULT 200,
    ra_lifetime       INTEGER DEFAULT 600,
    enabled           BOOLEAN DEFAULT TRUE,
    description       TEXT,
    pool_metadata     JSONB DEFAULT '{}',
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ipv6_pools_olt ON ipv6_pools(olt_id);
CREATE INDEX idx_ipv6_pools_prefix ON ipv6_pools USING GIST (ipv6_prefix inet_ops);
CREATE INDEX idx_ipv6_pools_enabled ON ipv6_pools(enabled);

-- ─── Suscriptores IPv6 ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriber_ipv6 (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- FK nullable al modelo ONU existente en YesOLT (referencia lógica)
    onu_serial        VARCHAR(50),
    client_id         UUID REFERENCES clients(id) ON DELETE SET NULL,
    pool_id           UUID REFERENCES ipv6_pools(id) ON DELETE SET NULL,
    wan_mode          VARCHAR(20) DEFAULT 'dhcpv6-pd'
                      CHECK (wan_mode IN ('dhcpv6-pd','slaac','static','pppoe-ipv6')),
    delegated_prefix  CIDR,
    ipv6_wan          INET,
    ipv6_lan          INET,
    slaac_enabled     BOOLEAN DEFAULT FALSE,
    dhcpv6_enabled    BOOLEAN DEFAULT TRUE,
    tr069_enabled     BOOLEAN DEFAULT TRUE,
    rdnss             INET[],
    pd_lifetime       INTEGER DEFAULT 3600,
    preferred_lifetime INTEGER DEFAULT 1800,
    status            VARCHAR(20) DEFAULT 'pending'
                      CHECK (status IN ('pending','active','suspended','error')),
    last_seen         TIMESTAMPTZ,
    lease_expires     TIMESTAMPTZ,
    provision_log     JSONB DEFAULT '[]',
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sub_ipv6_client ON subscriber_ipv6(client_id);
CREATE INDEX idx_sub_ipv6_serial ON subscriber_ipv6(onu_serial);
CREATE INDEX idx_sub_ipv6_status ON subscriber_ipv6(status);
CREATE INDEX idx_sub_ipv6_prefix ON subscriber_ipv6 USING GIST (delegated_prefix inet_ops);

-- ─── Signal/trigger: updated_at automático ───────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ipv6_pools_updated
    BEFORE UPDATE ON ipv6_pools
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_subscriber_ipv6_updated
    BEFORE UPDATE ON subscriber_ipv6
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Seed pool de ejemplo ────────────────────────────────────
INSERT INTO ipv6_pools (pool_name, ipv6_prefix, delegated_size, wan_mode, description)
VALUES ('FTTH-PD-PRINCIPAL', '2806:106e::/32', 56, 'dhcpv6-pd', 'Pool principal FTTH delegación /56')
ON CONFLICT (pool_name) DO NOTHING;
