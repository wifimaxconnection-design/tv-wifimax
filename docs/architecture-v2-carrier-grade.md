# Arquitectura Carrier-Grade ISP/FTTH — v2.0

## Diagrama General

```mermaid
graph TB
    subgraph INTERNET["🌐 Internet / Upstream BGP"]
        ISP_UPLINK["ISP Uplink IPv4/IPv6\nAS64512"]
    end

    subgraph CORE_ROUTING["🔀 Core Routing Layer"]
        MK1["MikroTik CHR-01\nRouterOS v7\nBGP + OSPFv3"]
        MK2["MikroTik CHR-02\nRouterOS v7\nBGP + OSPFv3"]
        BGP_PEER["iBGP Peering\nRoute Reflector"]
    end

    subgraph OLT_LAYER["📡 OLT/PON Layer"]
        VSOL["VSOL V1600\nGPON"]
        HUAWEI["Huawei MA5608T\nGPON"]
        ZTE["ZTE C300\nGPON"]
        NOKIA["Nokia ISAM\nGPON"]
    end

    subgraph ONT_LAYER["🏠 ONT/Subscriber Layer"]
        ONU1["ONU/ONT IPv4+IPv6\nDual Stack"]
        ONU2["ONU/ONT IPv4+IPv6\nDual Stack"]
        IPTV_STB["IPTV STB\nMulticast v4+v6"]
    end

    subgraph PLATFORM["🖥️ ISP Platform — Docker"]
        direction TB

        subgraph EXISTING["Servicios Existentes (NO MODIFICAR)"]
            BACKEND["FastAPI Backend\n:8000"]
            AUTH["Auth Service\n:8004"]
            PACKAGER["HLS Packager\n:8003"]
            INGEST["Ingest Multicast\n:8001"]
            TRANSCODER["GPU Transcoder\n:8002 NVENC"]
            FRONTEND["React Dashboard\n:3000"]
            POSTGRES["PostgreSQL 16\n:5432"]
            REDIS["Redis 7\n:6379"]
            PROMETHEUS["Prometheus\n:9090"]
            GRAFANA["Grafana\n:3001"]
            YESOLT["YesOLT\n:8090 MongoDB"]
            GENIEACS["GenieACS TR069\n:7547/:3002"]
        end

        subgraph NEW_SERVICES["🆕 Nuevos Microservicios"]
            IPV6MGR["ipv6-manager\n:8010\nPython/FastAPI"]
            BGP_ORCH["bgp-orchestrator\n:8011\nPython/FastAPI"]
            NOC_ENGINE["noc-engine\n:8012\nPython/FastAPI"]
            ZABBIX_SYNC["zabbix-sync\n:8013\nPython"]
            WA_ALERTS["whatsapp-alerts\n:8014\nPython"]
            TR069_V6["tr069-ipv6\n:8015\nPython"]
            OMCI_MGR["omci-profiles\n:8016\nPython"]
        end

        subgraph NEW_DB["🆕 Nuevas Tablas PostgreSQL"]
            T_IPV6["ipv6_pools\nsubscriber_ipv6"]
            T_BGP["bgp_peers\nbgp_announcements\nmikrotik_routers"]
            T_NOC["noc_events\nfiber_cuts\nmaintenance_windows"]
            T_ALERTS["alert_rules\nalert_incidents\nalert_channels"]
            T_ZABBIX["zabbix_hosts\nzabbix_metrics\nzabbix_triggers"]
            T_OMCI["omci_profiles\nomci_vendor_caps"]
        end

        subgraph NEW_FRONTEND["🆕 Nuevas Páginas React"]
            NOC_UI["NOC Dashboard\n/noc"]
            IPV6_UI["IPv6 Management\n/ipv6"]
            BGP_UI["BGP Monitor\n/bgp"]
            ALERTS_UI["Alert Manager\n/alerts"]
            ZABBIX_UI["Zabbix View\n/zabbix"]
            MAP_UI["GeoMap / Fiber\n/map"]
        end
    end

    subgraph EXTERNAL["🔗 Sistemas Externos"]
        ZABBIX_SRV["Zabbix Server\n6.x+"]
        WA_API["WhatsApp API\nEvolution/Meta"]
        GEOLOC["GeoLocation API"]
    end

    ISP_UPLINK --> MK1
    ISP_UPLINK --> MK2
    MK1 <--> BGP_PEER
    MK2 <--> BGP_PEER
    MK1 --> OLT_LAYER
    MK2 --> OLT_LAYER
    OLT_LAYER --> ONT_LAYER

    BGP_ORCH -->|"RouterOS API v7"| MK1
    BGP_ORCH -->|"RouterOS API v7"| MK2
    IPV6MGR -->|"DHCPv6-PD"| MK1
    TR069_V6 -->|"CWMP"| GENIEACS
    OMCI_MGR -->|"SNMP/Telnet"| OLT_LAYER

    NOC_ENGINE --> BACKEND
    NOC_ENGINE --> IPV6MGR
    NOC_ENGINE --> BGP_ORCH
    NOC_ENGINE --> YESOLT
    NOC_ENGINE --> ZABBIX_SRV

    ZABBIX_SYNC <--> ZABBIX_SRV
    WA_ALERTS --> WA_API
    NOC_ENGINE --> WA_ALERTS
```

## Principios Carrier-Grade

| Principio | Implementación |
|-----------|---------------|
| **No-touch existente** | Feature flags por env var, extensión aditiva |
| **Alta disponibilidad** | Healthchecks, restart policies, volúmenes persistentes |
| **Observabilidad** | Prometheus metrics en cada servicio nuevo |
| **Rollback** | Rama git `ipv6-noc-bgp-feature`, migraciones reversibles |
| **Seguridad** | JWT por servicio, mTLS futuro, rate limiting |
| **Escalabilidad** | Stateless services, Redis pub/sub, PostgreSQL partitioning |

## Puertos Asignados (sin conflictos)

| Puerto | Servicio | Estado |
|--------|---------|--------|
| 8000 | Backend FastAPI | Existente |
| 8001 | Ingest | Existente |
| 8002 | Transcoder | Existente |
| 8003 | Packager | Existente |
| 8004 | Auth | Existente |
| 8005 | Odoo Connector | Existente |
| 8090 | YesOLT | Existente |
| **8010** | **IPv6 Manager** | **NUEVO** |
| **8011** | **BGP Orchestrator** | **NUEVO** |
| **8012** | **NOC Engine** | **NUEVO** |
| **8013** | **Zabbix Sync** | **NUEVO** |
| **8014** | **WhatsApp Alerts** | **NUEVO** |
| **8015** | **TR069 IPv6** | **NUEVO** |
| **8016** | **OMCI Manager** | **NUEVO** |
