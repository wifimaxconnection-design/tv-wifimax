# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project scaffold with full microservices architecture
- Multicast UDP ingest service with PCR monitoring and packet loss detection
- GPU transcoding service using NVIDIA RTX 4500 Ada NVENC/CUDA
- HLS/RTSP/SRT packaging service with adaptive bitrate
- FastAPI backend with full REST API
- React + Vite admin dashboard with real-time GPU metrics
- PostgreSQL schema for channels, clients, subscriptions, sessions
- Redis cache and message queue integration
- Odoo CRM/billing integration
- JWT/OAuth2 authentication service
- Nginx reverse proxy with HLS streaming support
- Prometheus + Grafana monitoring stack
- GitHub Actions CI/CD pipeline
- Docker Compose with NVIDIA Container Toolkit support

## [0.1.0] - 2025-01-01

### Added
- Project initialization

[Unreleased]: https://github.com/your-org/iptv-platform/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/your-org/iptv-platform/releases/tag/v0.1.0
